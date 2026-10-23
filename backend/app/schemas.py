from typing import Literal

from pydantic import BaseModel, Field

Section = Literal["summary", "skills", "experience"]
ALL_SECTIONS: tuple[Section, ...] = ("summary", "skills", "experience")


class Experience(BaseModel):
    title: str = ""
    company: str = ""
    location: str = ""
    dates: str = ""
    bullets: list[str] = Field(default_factory=list)


class Education(BaseModel):
    degree: str = ""
    institution: str = ""
    dates: str = ""
    details: str = ""


class ExtraSection(BaseModel):
    """Any section that isn't summary/skills/experience/education (projects, certifications...)."""

    heading: str
    items: list[str] = Field(default_factory=list)


class Resume(BaseModel):
    name: str = ""
    headline: str = ""
    contact: list[str] = Field(default_factory=list)
    summary: str = ""
    skills: list[str] = Field(default_factory=list)
    experience: list[Experience] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    extra_sections: list[ExtraSection] = Field(default_factory=list)


class Tailoring(BaseModel):
    """What the LLM returns."""

    resume: Resume
    matched_skills: list[str] = Field(default_factory=list)
    missing_keywords: list[str] = Field(default_factory=list)
    changes: list[str] = Field(default_factory=list)


class AtsCheck(BaseModel):
    label: str
    passed: bool
    tip: str = ""


class Scores(BaseModel):
    match_before: int
    match_after: int
    ats: int
    ats_checks: list[AtsCheck]


class CustomizeResponse(BaseModel):
    original_text: str
    tailored_text: str
    tailoring: Tailoring
    scores: Scores
    provider: str
    model: str


class CoverLetterRequest(BaseModel):
    job_description: str
    resume: Resume


class CoverLetterResponse(BaseModel):
    cover_letter: str


class ExportRequest(BaseModel):
    resume: Resume
    format: Literal["pdf", "docx", "txt"]
