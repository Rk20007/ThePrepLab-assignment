"""Deterministic (non-LLM) scoring: JD keyword match and an ATS-friendliness heuristic.

These are computed in code rather than by the LLM so they are reproducible and comparable
between the original and tailored resume.
"""

import re
from collections import Counter

from .schemas import AtsCheck, Resume

_STOPWORDS = set(
    """
a about above across after again against all also am an and any are as at be because been before being
below between both but by can could did do does doing down during each either etc few for from further
had has have having he her here hers him his how i if in into is it its itself just least less like
may me more most must my no nor not now of off on once only or other our ours out over own per plus
same she should so some such than that the their them then there these they this those through to too
under until up upon us very via was we well were what when where which while who whom why will with
within without would yet you your yours
ability able across apply applicant applicants based benefits best candidate candidates company
day days degree demonstrated desired environment equal etc excellent experience experiences familiarity
full good great help ideal including job join knowledge looking new nice opportunity part plus
position preferred proficiency proficient qualifications related required requirements responsibilities
role salary skills strong team teams time understanding using work working world year years
""".split()
)

_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9+#./-]*[a-z0-9+#]|[a-z]")
_WEAK_STARTS = ("responsible for", "worked on", "helped", "assisted", "duties included", "tasked with")


def extract_keywords(job_description: str, limit: int = 30) -> list[tuple[str, int]]:
    """Most frequent meaningful terms in the JD, as (term, count)."""
    tokens = [t.strip("./-") for t in _TOKEN_RE.findall(job_description.lower())]
    counts = Counter(
        t for t in tokens if len(t) > 1 and t not in _STOPWORDS and not t.isdigit()
    )
    return counts.most_common(limit)


def _contains(text: str, term: str) -> bool:
    return re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", text) is not None


def match_score(job_description: str, resume_text: str) -> int:
    """Frequency-weighted share of JD keywords that appear in the resume (0-100)."""
    keywords = extract_keywords(job_description)
    if not keywords:
        return 0
    text = resume_text.lower()
    total = sum(count for _, count in keywords)
    hit = sum(count for term, count in keywords if _contains(text, term))
    return round(100 * hit / total)


def ats_score(resume: Resume, keyword_match: int) -> tuple[int, list[AtsCheck]]:
    contact = " ".join(resume.contact)
    bullets = [b for job in resume.experience for b in job.bullets]
    summary_words = len(resume.summary.split())
    weak = [b for b in bullets if b.lower().lstrip("•-* ").startswith(_WEAK_STARTS)]
    quantified = [b for b in bullets if re.search(r"\d", b)]
    long_bullets = [b for b in bullets if len(b.split()) > 40]

    checks: list[tuple[int, AtsCheck]] = [
        (10, AtsCheck(
            label="Email address present",
            passed=bool(re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", contact)),
            tip="Add an email address to your contact line.",
        )),
        (5, AtsCheck(
            label="Phone number present",
            passed=bool(re.search(r"\+?\d[\d\s().-]{7,}", contact)),
            tip="Add a phone number to your contact line.",
        )),
        (10, AtsCheck(
            label="Professional summary (25-100 words)",
            passed=25 <= summary_words <= 100,
            tip="Keep the summary to 2-4 focused sentences.",
        )),
        (10, AtsCheck(
            label="Dedicated skills section (6+ skills)",
            passed=len(resume.skills) >= 6,
            tip="List your core tools and skills in a dedicated section.",
        )),
        (10, AtsCheck(
            label="Every role has dates",
            passed=bool(resume.experience) and all(j.dates.strip() for j in resume.experience),
            tip="ATS systems compute experience from dates; add them to every role.",
        )),
        (10, AtsCheck(
            label="Bullets start with action verbs",
            passed=bool(bullets) and len(weak) <= len(bullets) * 0.1,
            tip='Replace "Responsible for..." with verbs like Built, Led, Reduced.',
        )),
        (15, AtsCheck(
            label="Achievements are quantified",
            passed=bool(bullets) and len(quantified) >= len(bullets) * 0.3,
            tip="Add numbers (%, $, users, time saved) to at least a third of your bullets.",
        )),
        (5, AtsCheck(
            label="Bullets are concise",
            passed=not long_bullets,
            tip="Keep each bullet under ~40 words.",
        )),
        (25, AtsCheck(
            label="Strong keyword match with JD (60%+)",
            passed=keyword_match >= 60,
            tip="Add the missing keywords you genuinely have experience with.",
        )),
    ]
    total = sum(weight for weight, _ in checks)
    earned = sum(weight for weight, check in checks if check.passed)
    return round(100 * earned / total), [check for _, check in checks]
