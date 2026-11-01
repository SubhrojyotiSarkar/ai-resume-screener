"""Heuristic extraction of contact details, name and sections from resume text."""

import re

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
# Loose candidate match; digit count is validated afterwards.
PHONE_RE = re.compile(r"(?<![\w(])(?:\+|\()?\d[\d\s().-]{7,}\d(?![\w])")
YEAR_RANGE_RE = re.compile(r"^(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}$")

SECTION_HEADINGS: dict[str, list[str]] = {
    "summary": ["summary", "professional summary", "profile", "objective", "career objective", "about me"],
    "experience": [
        "experience",
        "work experience",
        "professional experience",
        "employment history",
        "work history",
    ],
    "education": ["education", "academic background", "education and training", "qualifications"],
    "skills": ["skills", "technical skills", "key skills", "core competencies"],
    "projects": ["projects", "personal projects", "academic projects", "key projects"],
    "certifications": ["certifications", "certificates", "licenses and certifications"],
}
_HEADING_TO_SECTION = {h: section for section, headings in SECTION_HEADINGS.items() for h in headings}

_NAME_SKIP_WORDS = {"resume", "curriculum", "vitae", "cv"}
_NAME_WORD_RE = re.compile(r"^[A-Za-z][A-Za-z.'-]*$")


def extract_email(text: str) -> str | None:
    match = EMAIL_RE.search(text)
    return match.group(0).lower() if match else None


def extract_phone(text: str) -> str | None:
    for match in PHONE_RE.finditer(text):
        candidate = match.group(0).strip()
        digits = re.sub(r"\D", "", candidate)
        if 10 <= len(digits) <= 15 and not YEAR_RANGE_RE.match(candidate):
            return candidate
    return None


def _heading_key(line: str) -> str:
    return re.sub(r"[^a-z ]", "", line.lower()).strip()


def guess_name(text: str, max_lines: int = 8) -> str | None:
    """Guess the candidate's name: the first short, letters-only line near the top of the resume."""
    for line in text.splitlines()[:max_lines]:
        # "Jane Doe | Software Engineer" -> "Jane Doe"
        candidate = re.split(r"\s*[|•·,–—]\s*", line.strip())[0].strip()
        words = candidate.split()
        if not 2 <= len(words) <= 4:
            continue
        if not all(_NAME_WORD_RE.match(w) for w in words):
            continue
        if {w.lower() for w in words} & _NAME_SKIP_WORDS or _heading_key(candidate) in _HEADING_TO_SECTION:
            continue
        return candidate.title() if candidate.isupper() else candidate
    return None


def extract_sections(text: str) -> dict[str, str]:
    """Split resume text into known sections, keyed by section name."""
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for line in text.splitlines():
        stripped = line.strip()
        key = _heading_key(stripped)
        if len(stripped) <= 40 and key in _HEADING_TO_SECTION:
            current = _HEADING_TO_SECTION[key]
            sections.setdefault(current, [])
        elif current and stripped:
            sections[current].append(stripped)
    return {name: "\n".join(lines) for name, lines in sections.items() if lines}
