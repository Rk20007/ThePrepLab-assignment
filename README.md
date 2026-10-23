# Resume Customizer

An AI-powered web app that tailors a resume to a specific job description. Paste a JD, upload a
PDF or DOCX resume, and get back a rewritten, JD-aligned resume that you can view, compare and
download as PDF, DOCX or TXT.

**Live app:** `<your-vercel-url>` · **API:** `<your-render-url>/docs`

## Features

### Core
- **Job description input**: textarea with a live character count, plus validation for empty, too-short (<100 chars) and too-long (>15k) input.
- **Resume upload**: drag-and-drop or browse for PDF/DOCX. Shows the file name and size, and validates type and size (max 5 MB) on both the client and the server. Text is extracted on the backend with `pdfplumber` and `python-docx` (table-based DOCX templates included).
- **LLM customization**: the model rewrites the summary, puts JD-relevant skills first, and reorders and rephrases experience bullets. It also returns matched skills, **missing keywords**, and a short changelog explaining what it changed.
- **Output**: the tailored resume renders as a clean document, with skills that match the JD highlighted. It downloads as **PDF**, **DOCX** or **TXT**, generated server-side from structured data so the formatting is consistent.
- **Error handling**: clear messages for invalid or corrupted files, scanned PDFs with no text, oversized files, LLM timeouts, rate limits (429), malformed LLM output (retried once automatically) and an unreachable or cold-starting server.

### Bonus
| Feature | How |
|---|---|
| Match score | Frequency-weighted JD keyword coverage, shown **before → after** tailoring |
| ATS score | 9-point weighted checklist (contact info, dated roles, quantified bullets, action verbs, keyword match…) with fix-it tips |
| Diff view | Word-level diff of the original extracted text vs. the tailored resume |
| Multiple versions | Each generation becomes a version (v1, v2…); switch between them to compare |
| Section-wise customization | Choose any of Summary / Skills / Experience; unselected sections are copied verbatim |
| Cover letter | One-click cover letter from the tailored resume + JD; copy or download it |
| Dark mode, responsive | Works from a 375 px phone up to desktop |

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, `diff` |
| Backend | Python 3.13, FastAPI, Pydantic v2, httpx, pdfplumber, python-docx, ReportLab |
| LLM | **Google Gemini `gemini-3.5-flash`** (default) via the REST API in JSON mode. Groq (`llama-3.3-70b-versatile`) is also supported by setting `LLM_PROVIDER=groq` |
| Hosting | Vercel (frontend) + Render (backend) |
| Tests | pytest (API, validation, export and scoring tests with a fake LLM) |

## Architecture

```
┌──────────────── Next.js (Vercel) ────────────────┐
│  JD textarea · file dropzone · section picker    │
│  Results: resume · diff · insights · cover letter│
└───────────────┬──────────────────────────────────┘
                │ REST (multipart / JSON)
┌───────────────▼──────── FastAPI (Render) ────────┐
│ POST /api/customize   parse file → prompt LLM →  │
│                       validate JSON → score      │
│ POST /api/cover-letter                           │
│ POST /api/export      PDF / DOCX / TXT           │
│ GET  /api/health                                 │
└───────────────┬──────────────────────────────────┘
                │ HTTPS (JSON mode)
        ┌───────▼────────┐
        │ Gemini / Groq  │
        └────────────────┘
```

```
backend/app/
  main.py        routes, request validation, error mapping
  parsers.py     PDF/DOCX → text (magic-byte checks, scanned-PDF detection)
  prompts.py     system + user prompts (kept separate from code)
  llm.py         provider-agnostic JSON client, timeouts, retry on bad JSON
  schemas.py     Pydantic models: the contract between LLM, API and UI
  scoring.py     deterministic match score + ATS heuristic
  exporters.py   structured resume → TXT / DOCX / PDF
frontend/src/
  lib/api.ts             typed API client + error handling
  components/            ResumeCustomizer (state), ResultsPanel, ResumeView, DiffView, ...
```

### Prompt engineering
- The **system prompt** sets the persona (recruiter and resume writer) and puts **truthfulness rules** first: never invent employers, titles, metrics or tools. JD requirements the resume doesn't support go into `missing_keywords`, not into the resume. All roles must be kept, and numbers must be preserved exactly.
- Section-specific guidance covers the summary (2–4 sentences that mirror the JD's terminology), skills (JD-relevant first, in the JD's spelling) and experience (reorder by relevance, lead with action verbs, keep the impact).
- The model must return **structured JSON** matching an explicit schema. Gemini's `responseMimeType` / Groq's `json_object` mode enforce this, and Pydantic validates it. Invalid output is retried once.
- The JD and resume are wrapped in XML-style tags to separate data from instructions.
- Sections the user deselects are explicitly *frozen* in the prompt.

### Why compute scores in code, not with the LLM?
LLM-generated "scores" are inconsistent from run to run. A deterministic keyword-coverage score
gives a fair **before vs. after** comparison and identical results for identical inputs.

## Running locally

**Prerequisites:** Python 3.11+, Node 20+, and a free Gemini API key from https://aistudio.google.com/apikey

### Backend
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then set GEMINI_API_KEY
uvicorn app.main:app --reload --port 8000
# API docs at http://localhost:8000/docs
pytest                        # run tests (no API key needed)
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                   # http://localhost:3000
```

## Deployment

**Backend → Render**
1. New → Blueprint → select this repo (it uses [render.yaml](render.yaml)). Or create a Web Service with root dir `backend`, build command `pip install -r requirements.txt`, and start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
2. Set the env vars `GEMINI_API_KEY` and `ALLOWED_ORIGINS=https://<your-app>.vercel.app`.
3. A `Dockerfile` is also included for Cloud Run, Railway or Fly.io.

**Frontend → Vercel**
1. Import the repo and set the **Root Directory** to `frontend`.
2. Set the env var `NEXT_PUBLIC_API_URL=https://<your-api>.onrender.com`, then deploy.

## Known limitations and trade-offs
- **Cold starts**: Render's free tier sleeps after inactivity, so the first request can take about 30–60 s. The UI shows a hint to retry if the server isn't reachable.
- **Scanned/image PDFs** aren't supported (no OCR). The user gets a clear error instead.
- **Layout isn't preserved**: the output is regenerated from structured data in a clean, ATS-friendly template instead of editing the original file's design.
- **Match score is lexical**: it rewards exact keyword overlap and doesn't understand synonyms, which is intentional for ATS realism. The ATS score is a heuristic, not a real ATS.
- **No streaming**: the response is returned as one validated JSON object, which is more reliable for structured output. A progress indicator covers the wait.
- **No persistence or auth**: versions live in browser memory and nothing is stored server-side, which is also a privacy benefit.
- The PDF export uses standard fonts, so some non-Latin characters may not render. DOCX/TXT are unaffected.
- There is no rate limiting on the API; production would add per-IP limits.
#   T h e P r e p L a b - a s s i g n m e n t  
 