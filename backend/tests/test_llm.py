import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.llm import LLMClient, LLMError
from app.main import app, get_llm
from app.schemas import Ping

SERVER = Settings(_env_file=None, llm_provider="groq", groq_api_key="server-key", gemini_api_key="")


def test_user_key_overrides_server_key_and_provider():
    llm = LLMClient(SERVER, user_api_key="user-key")
    assert (llm.provider, llm.api_key, llm.uses_user_key) == ("gemini", "user-key", True)
    assert not LLMClient(SERVER).uses_user_key


async def test_missing_key_has_settings_hint():
    llm = LLMClient(Settings(_env_file=None, gemini_api_key=""))
    with pytest.raises(LLMError) as exc:
        await llm.generate("s", "p", Ping)
    assert exc.value.code == "no_key"
    assert "Settings" in str(exc.value)


@pytest.mark.parametrize(
    ("status", "body", "code"),
    [
        (400, '{"error": {"message": "API key not valid. Please pass a valid API key.", "status": "INVALID_ARGUMENT"}}', "invalid_key"),
        (429, '{"error": {"message": "You exceeded your current quota", "status": "RESOURCE_EXHAUSTED"}}', "quota_exceeded"),
        (403, '{"error": {"message": "Permission denied", "status": "PERMISSION_DENIED"}}', "key_rejected"),
        (400, '{"error": {"message": "Billing account not enabled", "status": "FAILED_PRECONDITION"}}', "key_rejected"),
        (503, '{"error": {"message": "overloaded"}}', "llm_error"),
    ],
)
def test_provider_errors_map_to_actionable_codes(status, body, code):
    err = LLMClient(SERVER, user_api_key="k")._error_for(httpx.Response(status, text=body))
    assert err.code == code
    if code != "llm_error":
        assert "Your Gemini API key" in str(err)


def test_check_key_reports_source():
    class OkLLM:
        model, uses_user_key = "gemini-x", True

        async def generate(self, *args, **kwargs):
            return Ping(ok=True)

    app.dependency_overrides[get_llm] = lambda: OkLLM()
    try:
        res = TestClient(app).post("/api/check-key")
    finally:
        app.dependency_overrides.clear()
    assert res.json() == {"ok": True, "model": "gemini-x", "source": "user"}


def test_llm_error_response_includes_code():
    class BadKeyLLM:
        async def generate(self, *args, **kwargs):
            raise LLMError("Your Gemini API key is invalid.", 401, "invalid_key")

    app.dependency_overrides[get_llm] = lambda: BadKeyLLM()
    try:
        res = TestClient(app).post("/api/check-key")
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 401
    assert res.json()["code"] == "invalid_key"


def test_origins_ignore_trailing_slash():
    s = Settings(_env_file=None, allowed_origins="https://app.vercel.app/, http://localhost:3000")
    assert s.origins == ["https://app.vercel.app", "http://localhost:3000"]
