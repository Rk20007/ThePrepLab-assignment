"""Thin LLM client supporting Gemini and Groq through their REST APIs, always in JSON mode."""

import asyncio
import json
import logging
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from .config import Settings

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

RETRYABLE_STATUSES = {500, 502, 503, 504}
RETRY_DELAYS_SECONDS = (2,)


class LLMError(RuntimeError):
    """A failure talking to the LLM, with a message safe to show to end users."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


class LLMClient:
    def __init__(self, settings: Settings):
        self.provider = settings.llm_provider
        self.timeout = settings.llm_timeout_seconds
        if self.provider == "gemini":
            self.api_key = settings.gemini_api_key
            self.models = [settings.gemini_model, *settings.gemini_fallbacks]
        else:
            self.api_key = settings.groq_api_key
            self.models = [settings.groq_model]
        # The model that served the most recent request (may be a fallback).
        self.model = self.models[0]

    async def generate(self, system: str, prompt: str, schema: type[T], temperature: float = 0.4) -> T:
        """Call the LLM and parse its JSON reply into `schema`, retrying once on malformed output."""
        if not self.api_key:
            raise LLMError("The server has no LLM API key configured.", status_code=500)

        last_error: Exception | None = None
        for _ in range(2):
            raw = await self._complete(system, prompt, temperature)
            try:
                return schema.model_validate(json.loads(_strip_fences(raw)))
            except (json.JSONDecodeError, ValidationError) as exc:
                log.warning("LLM returned invalid JSON, retrying: %s", exc)
                last_error = exc
        raise LLMError("The AI returned an unexpected response. Please try again.") from last_error

    def _request(self, model: str, system: str, prompt: str, temperature: float) -> tuple[str, dict, dict]:
        if self.provider == "gemini":
            return (
                GEMINI_URL.format(model=model),
                {"x-goog-api-key": self.api_key},
                {
                    "systemInstruction": {"parts": [{"text": system}]},
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": temperature,
                        "responseMimeType": "application/json",
                        # Rewriting a resume needs little reasoning; default thinking makes calls 10x slower.
                        "thinkingConfig": {"thinkingLevel": "low"},
                    },
                },
            )
        return (
            GROQ_URL,
            {"Authorization": f"Bearer {self.api_key}"},
            {
                "model": model,
                "temperature": temperature,
                "response_format": {"type": "json_object"},
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            },
        )

    async def _post_with_retry(self, client: httpx.AsyncClient, model: str, *args) -> httpx.Response:
        url, headers, body = self._request(model, *args)
        # Providers regularly return 5xx under load; these are usually gone within seconds.
        for delay in RETRY_DELAYS_SECONDS:
            res = await client.post(url, headers=headers, json=body)
            if res.status_code not in RETRYABLE_STATUSES:
                return res
            log.warning("%s returned %s, retrying in %ss", model, res.status_code, delay)
            await asyncio.sleep(delay)
        return await client.post(url, headers=headers, json=body)

    async def _complete(self, system: str, prompt: str, temperature: float) -> str:
        res: httpx.Response | None = None
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for model in self.models:
                # Overloaded, hanging or retired model: move on to the next configured fallback.
                try:
                    res = await self._post_with_retry(client, model, system, prompt, temperature)
                except httpx.TimeoutException:
                    log.warning("%s timed out, trying next model", model)
                    res = None
                    continue
                except httpx.HTTPError as exc:
                    raise LLMError("Couldn't reach the AI service. Please try again shortly.") from exc
                if res.status_code not in RETRYABLE_STATUSES | {404}:
                    break
                log.warning("%s unavailable (%s), trying next model", model, res.status_code)
        self.model = model

        if res is None:
            raise LLMError("The AI took too long to respond. Please try again.", 504)
        if res.status_code == 429:
            raise LLMError("The AI service is rate-limited right now. Please wait a minute and retry.", 429)
        if res.status_code in RETRYABLE_STATUSES:
            raise LLMError("The AI service is overloaded right now. Please try again in a minute.", 503)
        if res.status_code >= 400:
            log.error("LLM error %s: %s", res.status_code, res.text[:500])
            raise LLMError("The AI service returned an error. Please try again.")

        data = res.json()
        try:
            if self.provider == "gemini":
                candidate = data["candidates"][0]
                return "".join(part.get("text", "") for part in candidate["content"]["parts"])
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            log.error("Unexpected LLM payload: %s", str(data)[:500])
            raise LLMError("The AI declined or returned an empty response. Please try again.") from exc


def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        text = text.rsplit("```", 1)[0]
    return text
