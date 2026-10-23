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
    """A failure talking to the LLM, with a message safe to show to end users.

    `code` lets the frontend react to key problems (e.g. by offering to open Settings).
    """

    def __init__(self, message: str, status_code: int = 502, code: str = "llm_error"):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


SETTINGS_HINT = "You can add your own Gemini API key in Settings (top right)."


class LLMClient:
    def __init__(self, settings: Settings, user_api_key: str | None = None):
        """`user_api_key` is a Gemini key supplied by the visitor; it takes precedence over the server's."""
        self.provider = "gemini" if user_api_key else settings.llm_provider
        self.timeout = settings.llm_timeout_seconds
        self.uses_user_key = bool(user_api_key)
        if self.provider == "gemini":
            self.api_key = user_api_key or settings.gemini_api_key
            self.models = [settings.gemini_model, *settings.gemini_fallbacks]
        else:
            self.api_key = settings.groq_api_key
            self.models = [settings.groq_model]
        # The model that served the most recent request (may be a fallback).
        self.model = self.models[0]

    async def generate(self, system: str, prompt: str, schema: type[T], temperature: float = 0.4) -> T:
        """Call the LLM and parse its JSON reply into `schema`, retrying once on malformed output."""
        if not self.api_key:
            raise LLMError(f"No AI API key is configured on the server. {SETTINGS_HINT}", 503, "no_key")

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
                # Free-tier quotas are per model, so a 429 is also worth a fallback.
                if res.status_code not in RETRYABLE_STATUSES | {404, 429}:
                    break
                log.warning("%s unavailable (%s), trying next model", model, res.status_code)
        self.model = model

        if res is None:
            raise LLMError("The AI took too long to respond. Please try again.", 504)
        if res.status_code >= 400:
            raise self._error_for(res)

        data = res.json()
        try:
            if self.provider == "gemini":
                candidate = data["candidates"][0]
                return "".join(part.get("text", "") for part in candidate["content"]["parts"])
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            log.error("Unexpected LLM payload: %s", str(data)[:500])
            raise LLMError("The AI declined or returned an empty response. Please try again.") from exc


    def _error_for(self, res: httpx.Response) -> LLMError:
        """Translate a provider error response into a message the user can act on."""
        body = res.text
        log.error("LLM error %s: %s", res.status_code, body[:500])
        whose = "Your" if self.uses_user_key else "The server's"
        fix = "Update it in Settings (top right)." if self.uses_user_key else SETTINGS_HINT

        if "API_KEY_INVALID" in body or "API key not valid" in body or res.status_code == 401:
            return LLMError(f"{whose} Gemini API key is invalid. {fix}", 401, "invalid_key")
        if res.status_code == 429:
            if "quota" in body.lower() or "RESOURCE_EXHAUSTED" in body:
                return LLMError(
                    f"{whose} Gemini API key has run out of quota (free-tier limit reached or billing "
                    f"not set up). Wait for the quota to reset or use another key. {fix}",
                    429,
                    "quota_exceeded",
                )
            return LLMError("The AI service is rate-limited right now. Please wait a minute and retry.", 429)
        if res.status_code == 403 or "billing" in body.lower() or "FAILED_PRECONDITION" in body:
            return LLMError(
                f"{whose} Gemini API key was rejected (permission or billing issue on the Google account). {fix}",
                403,
                "key_rejected",
            )
        if res.status_code in RETRYABLE_STATUSES:
            return LLMError("The AI service is overloaded right now. Please try again in a minute.", 503)
        if res.status_code == 404:
            return LLMError("The configured AI model is no longer available. Please contact the site owner.")
        return LLMError("The AI service returned an error. Please try again.")


def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        text = text.rsplit("```", 1)[0]
    return text
