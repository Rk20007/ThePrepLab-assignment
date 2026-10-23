import io

import pytest
from docx import Document
from fastapi.testclient import TestClient

from app.llm import LLMError
from app.main import app, get_llm
from app.schemas import Experience, Resume, Tailoring

JD = (
    "We are hiring a Senior Backend Engineer to build Python and FastAPI microservices on AWS. "
    "You will design RESTful APIs, work with PostgreSQL and Docker, and mentor engineers. "
    "Experience with Kubernetes and CI/CD pipelines is a plus."
)

RESUME_LINES = [
    "Jane Doe",
    "jane@example.com | +1 555 123 4567",
    "Summary: Backend engineer with 6 years of experience building Python services.",
    "Experience: Acme Corp, Software Engineer, 2019-2024",
    "- Built REST services in Python and Flask serving 2M requests per day",
    "- Migrated deployments to Docker, cutting release time by 40%",
    "Skills: Python, Flask, PostgreSQL, Docker, Git",
]

TAILORED = Tailoring(
    resume=Resume(
        name="Jane Doe",
        contact=["jane@example.com", "+1 555 123 4567"],
        summary="Backend engineer with 6 years of experience building Python services and RESTful APIs "
        "with PostgreSQL and Docker, focused on reliable, scalable systems and fast delivery for teams.",
        skills=["Python", "RESTful APIs", "PostgreSQL", "Docker", "Flask", "Git"],
        experience=[
            Experience(
                title="Software Engineer",
                company="Acme Corp",
                dates="2019-2024",
                bullets=[
                    "Built RESTful APIs in Python serving 2M requests per day",
                    "Migrated deployments to Docker, cutting release time by 40%",
                ],
            )
        ],
    ),
    matched_skills=["Python", "PostgreSQL", "Docker"],
    missing_keywords=["FastAPI", "AWS", "Kubernetes"],
    changes=["Aligned summary with backend focus."],
)


class FakeLLM:
    provider, model = "fake", "fake-1"

    def __init__(self, result=TAILORED, error: LLMError | None = None):
        self.result, self.error, self.calls = result, error, []

    async def generate(self, system, prompt, schema, temperature=0.4):
        self.calls.append(prompt)
        if self.error:
            raise self.error
        return self.result


@pytest.fixture
def fake_llm():
    llm = FakeLLM()
    app.dependency_overrides[get_llm] = lambda: llm
    yield llm
    app.dependency_overrides.clear()


client = TestClient(app)


def make_docx() -> bytes:
    doc = Document()
    for line in RESUME_LINES:
        doc.add_paragraph(line)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def post_customize(jd=JD, filename="resume.docx", data=None, sections=None):
    form = {"job_description": jd}
    if sections is not None:
        form["sections"] = sections
    return client.post(
        "/api/customize",
        data=form,
        files={"file": (filename, data if data is not None else make_docx())},
    )


def test_customize_happy_path(fake_llm):
    res = post_customize()
    assert res.status_code == 200, res.text
    body = res.json()
    assert "Acme Corp" in body["original_text"]
    assert body["tailoring"]["missing_keywords"] == ["FastAPI", "AWS", "Kubernetes"]
    assert 0 <= body["scores"]["match_before"] <= body["scores"]["match_after"] <= 100
    assert 0 <= body["scores"]["ats"] <= 100
    assert "Jane Doe" in body["tailored_text"]


def test_section_selection_reaches_prompt(fake_llm):
    assert post_customize(sections="skills").status_code == 200
    assert "WITHOUT rewording" in fake_llm.calls[0]
    assert "summary, experience" in fake_llm.calls[0]


@pytest.mark.parametrize(
    ("kwargs", "status", "fragment"),
    [
        ({"jd": "   "}, 422, "paste a job description"),
        ({"jd": "too short"}, 422, "too short"),
        ({"filename": "resume.txt"}, 415, "PDF or DOCX"),
        ({"filename": "resume.pdf", "data": b"not a pdf at all"}, 422, "isn't a valid PDF"),
        ({"data": b""}, 422, "empty"),
        ({"data": b"x" * (5 * 1024 * 1024 + 1)}, 413, "too large"),
        ({"sections": "hobbies"}, 422, "Unknown section"),
    ],
)
def test_customize_validation(fake_llm, kwargs, status, fragment):
    res = post_customize(**kwargs)
    assert res.status_code == status
    assert fragment in res.json()["detail"]
    assert fake_llm.calls == []


def test_llm_failure_is_reported_cleanly():
    app.dependency_overrides[get_llm] = lambda: FakeLLM(error=LLMError("rate limited", 429))
    try:
        res = post_customize()
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 429
    assert res.json() == {"detail": "rate limited"}


@pytest.mark.parametrize(("fmt", "magic"), [("pdf", b"%PDF"), ("docx", b"PK"), ("txt", b"Jane Doe")])
def test_export(fmt, magic):
    res = client.post("/api/export", json={"resume": TAILORED.resume.model_dump(), "format": fmt})
    assert res.status_code == 200
    assert res.content.startswith(magic)
    assert f"Jane-Doe-tailored.{fmt}" in res.headers["content-disposition"]


def test_pdf_cid_glyphs_become_bullets():
    from app.parsers import _normalize

    assert _normalize("(cid:127) Built APIs\n(cid:127) Shipped") == "• Built APIs\n• Shipped"
