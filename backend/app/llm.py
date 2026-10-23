"""Thin LLM client supporting Gemini and Groq through their REST APIs, always in JSON mode."""

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
            self.api_key, self.model = settings.gemini_api_key, settings.gemini_model
        else:
            self.api_key, self.model = settings.groq_api_key, settings.groq_model

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

    async def _complete(self, system: str, prompt: str, temperature: float) -> str:
        if self.provider == "gemini":
            url = GEMINI_URL.format(model=self.model)
            headers = {"x-goog-api-key": self.api_key}
            body = {
                "systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": temperature, "responseMimeType": "application/json"},
            }
        else:
            url = GROQ_URL
            headers = {"Authorization": f"Bearer {self.api_key}"}
            body = {
                "model": self.model,
                "temperature": temperature,
                "response_format": {"type": "json_object"},
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.post(url, headers=headers, json=body)
        except httpx.TimeoutException as exc:
            raise LLMError("The AI took too long to respond. Please try again.", 504) from exc
        except httpx.HTTPError as exc:
            raise LLMError("Couldn't reach the AI service. Please try again shortly.") from exc

        if res.status_code == 429:
            raise LLMError("The AI service is rate-limited right now. Please wait a minute and retry.", 429)
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
