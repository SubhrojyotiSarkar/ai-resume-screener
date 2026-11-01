"""Extract plain text from PDF and DOCX files."""

import io
from typing import Literal

import docx
import pdfplumber

FileType = Literal["pdf", "docx"]

MAX_PDF_PAGES = 20


class UnsupportedFileTypeError(ValueError):
    """The file is not a PDF or DOCX."""


class TextExtractionError(ValueError):
    """The file looked valid but its text could not be read."""


def detect_file_type(data: bytes, filename: str) -> FileType:
    """Identify the file by its content (magic bytes), using the extension to tell DOCX from other zips."""
    name = filename.lower()
    if data.startswith(b"%PDF"):
        return "pdf"
    if data.startswith(b"PK\x03\x04") and name.endswith(".docx"):
        return "docx"
    raise UnsupportedFileTypeError("Only PDF and DOCX files are supported")


def _extract_pdf(data: bytes) -> str:
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        pages = pdf.pages[:MAX_PDF_PAGES]
        return "\n".join(page.extract_text() or "" for page in pages)


def _extract_docx(data: bytes) -> str:
    document = docx.Document(io.BytesIO(data))
    parts = [p.text for p in document.paragraphs]
    for table in document.tables:
        for row in table.rows:
            parts.append(" | ".join(cell.text for cell in row.cells))
    return "\n".join(parts)


def _normalize_whitespace(text: str) -> str:
    lines = (" ".join(line.split()) for line in text.replace("\x00", "").splitlines())
    return "\n".join(line for line in lines if line)


def extract_text(data: bytes, filename: str) -> str:
    """Return the text of a PDF or DOCX file, one line per non-empty line of the source."""
    file_type = detect_file_type(data, filename)
    try:
        raw = _extract_pdf(data) if file_type == "pdf" else _extract_docx(data)
    except Exception as exc:  # pdfminer and python-docx raise many different parser errors
        raise TextExtractionError(f"Could not read {file_type.upper()} file") from exc
    return _normalize_whitespace(raw)
