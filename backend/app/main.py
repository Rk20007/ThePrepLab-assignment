import logging
import re
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from . import exporters, prompts, scoring
from .config import Settings, get_settings
from .llm import LLMClient, LLMError
from .parsers import SUPPORTED_EXTENSIONS, ResumeParseError, extract_text
from .schemas import (
    ALL_SECTIONS,
    CoverLetterRequest,
    CoverLetterResponse,
    CustomizeResponse,
    ExportRequest,
    Scores,
    Section,
    Tailoring,
)

logging.basicConfig(level=logging.INFO)

settings = get_settings()
app = FastAPI(title="Resume Customizer API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.exception_handler(LLMError)
async def llm_error_handler(_: Request, exc: LLMError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": str(exc)})


def get_llm(s: Annotated[Settings, Depends(get_settings)]) -> LLMClient:
    return LLMClient(s)


def validate_job_description(text: str, s: Settings) -> str:
    text = text.strip()
    if not text:
        raise HTTPException(422, "Please paste a job description.")
    if len(text) < s.jd_min_chars:
        raise HTTPException(422, f"The job description looks too short (minimum {s.jd_min_chars} characters).")
    if len(text) > s.jd_max_chars:
        raise HTTPException(422, f"The job description is too long (maximum {s.jd_max_chars:,} characters).")
    return text


def parse_sections(raw: str) -> list[Section]:
    requested = [s.strip().lower() for s in raw.split(",") if s.strip()]
    invalid = [s for s in requested if s not in ALL_SECTIONS]
    if invalid:
        raise HTTPException(422, f"Unknown section(s): {', '.join(invalid)}.")
    sections = [s for s in ALL_SECTIONS if s in requested]
    if not sections:
        raise HTTPException(422, "Choose at least one section to customize.")
    return sections


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "provider": settings.llm_provider}


@app.post("/api/customize", response_model=CustomizeResponse)
async def customize(
    job_description: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    llm: Annotated[LLMClient, Depends(get_llm)],
    s: Annotated[Settings, Depends(get_settings)],
    sections: Annotated[str, Form()] = ",".join(ALL_SECTIONS),
) -> CustomizeResponse:
    jd = validate_job_description(job_description, s)
    chosen = parse_sections(sections)

    filename = file.filename or ""
    if not filename.lower().endswith(SUPPORTED_EXTENSIONS):
        raise HTTPException(415, "Unsupported file type. Please upload a PDF or DOCX file.")
    data = await file.read(s.max_upload_bytes + 1)
    if len(data) > s.max_upload_bytes:
        raise HTTPException(413, f"File is too large. The maximum size is {s.max_upload_mb} MB.")
    if not data:
        raise HTTPException(422, "The uploaded file is empty.")

    try:
        resume_text = extract_text(filename, data)
    except ResumeParseError as exc:
        raise HTTPException(422, str(exc)) from exc
    resume_text = resume_text[: s.resume_max_chars]

    tailoring = await llm.generate(
        prompts.TAILOR_SYSTEM_PROMPT,
        prompts.build_tailor_prompt(jd, resume_text, chosen),
        Tailoring,
    )

    tailored_text = exporters.to_text(tailoring.resume)
    match_after = scoring.match_score(jd, tailored_text)
    ats, checks = scoring.ats_score(tailoring.resume, match_after)
    return CustomizeResponse(
        original_text=resume_text,
        tailored_text=tailored_text,
        tailoring=tailoring,
        scores=Scores(
            match_before=scoring.match_score(jd, resume_text),
            match_after=match_after,
            ats=ats,
            ats_checks=checks,
        ),
        provider=llm.provider,
        model=llm.model,
    )


@app.post("/api/cover-letter", response_model=CoverLetterResponse)
async def cover_letter(
    req: CoverLetterRequest,
    llm: Annotated[LLMClient, Depends(get_llm)],
    s: Annotated[Settings, Depends(get_settings)],
) -> CoverLetterResponse:
    jd = validate_job_description(req.job_description, s)
    return await llm.generate(
        prompts.COVER_LETTER_SYSTEM_PROMPT,
        prompts.build_cover_letter_prompt(jd, req.resume.model_dump_json(indent=1)),
        CoverLetterResponse,
        temperature=0.6,
    )


_EXPORT_TYPES = {
    "pdf": ("application/pdf", exporters.to_pdf),
    "docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", exporters.to_docx),
    "txt": ("text/plain; charset=utf-8", lambda r: exporters.to_text(r).encode("utf-8")),
}


@app.post("/api/export")
async def export(req: ExportRequest) -> Response:
    media_type, render = _EXPORT_TYPES[req.format]
    slug = re.sub(r"[^A-Za-z0-9]+", "-", req.resume.name).strip("-") or "resume"
    return Response(
        content=render(req.resume),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{slug}-tailored.{req.format}"'},
    )
