"""Turn an uploaded resume file into a parsed document ready for storage."""

from dataclasses import dataclass, field
from datetime import datetime, timezone

import numpy as np

from app.core.cleaning import clean_text
from app.core.embeddings import MODEL_NAME, Embedder, embed_text, get_embedder
from app.core.parsing import extract_email, extract_phone, extract_sections, guess_name
from app.core.skills import get_skill_matcher
from app.core.text_extraction import TextExtractionError, extract_text


@dataclass(frozen=True)
class ParsedResume:
    raw_text: str
    clean_text: str
    skills: list[str]
    email: str | None
    phone: str | None
    name_guess: str | None
    sections: dict[str, str]
    embeddings: np.ndarray
    parsed_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_document(self) -> dict:
        """The shape stored in the `parsed_resumes` collection."""
        return {
            "raw_text": self.raw_text,
            "clean_text": self.clean_text,
            "skills": self.skills,
            "email": self.email,
            "phone": self.phone,
            "sections": self.sections,
            # Stored with the model name so a model change invalidates old vectors.
            "embedding": {"model": MODEL_NAME, "vectors": self.embeddings.round(6).tolist()},
            "parsed_at": self.parsed_at,
        }


def parse_resume_file(data: bytes, filename: str, embedder: Embedder | None = None) -> ParsedResume:
    raw_text = extract_text(data, filename)
    if not raw_text.strip():
        raise TextExtractionError("No extractable text found (scanned PDFs are not supported yet)")

    return ParsedResume(
        raw_text=raw_text,
        clean_text=clean_text(raw_text),
        skills=get_skill_matcher().extract(raw_text),
        email=extract_email(raw_text),
        phone=extract_phone(raw_text),
        name_guess=guess_name(raw_text),
        sections=extract_sections(raw_text),
        embeddings=embed_text(raw_text, embedder or get_embedder()),
    )
