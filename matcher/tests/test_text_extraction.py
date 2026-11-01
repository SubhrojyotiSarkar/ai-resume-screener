import pytest

from app.core.pipeline import parse_resume_file
from app.core.text_extraction import (
    TextExtractionError,
    UnsupportedFileTypeError,
    detect_file_type,
    extract_text,
)
from tests.helpers import make_docx, make_pdf


def test_extracts_text_from_pdf(resume_texts):
    text = extract_text(make_pdf(resume_texts["strong"]), "resume.pdf")
    assert "PRIYA SHARMA" in text
    assert "B.Tech in Computer Science, IIT Madras, 2018" in text


def test_extracts_text_from_docx(resume_texts):
    text = extract_text(make_docx(resume_texts["partial"]), "resume.docx")
    assert text.splitlines()[0] == "Rahul Verma"
    assert "Spring Boot" in text


def test_detects_type_from_content_not_just_extension(resume_texts):
    assert detect_file_type(make_pdf("hello"), "misnamed.docx") == "pdf"
    with pytest.raises(UnsupportedFileTypeError):
        detect_file_type(b"just some text", "resume.pdf")


@pytest.mark.parametrize("filename", ["resume.txt", "photo.png", "resume.doc", "archive.zip"])
def test_rejects_other_file_types(filename):
    with pytest.raises(UnsupportedFileTypeError):
        extract_text(b"PK\x03\x04 not really a docx" if filename.endswith(".zip") else b"data", filename)


def test_corrupt_files_raise_extraction_error():
    with pytest.raises(TextExtractionError):
        extract_text(b"%PDF-1.4 garbage", "broken.pdf")
    with pytest.raises(TextExtractionError):
        extract_text(b"PK\x03\x04 garbage", "broken.docx")


def test_parse_resume_file_end_to_end(resume_texts):
    parsed = parse_resume_file(make_pdf(resume_texts["strong"]), "priya.pdf")

    assert parsed.name_guess == "Priya Sharma"
    assert parsed.email == "priya.sharma@example.com"
    assert parsed.phone == "+91 98765 43210"
    assert {"python", "fastapi", "react", "typescript", "postgresql", "docker", "aws"} <= set(parsed.skills)
    assert set(parsed.sections) >= {"experience", "education"}
    assert "fastapi" in parsed.clean_text

    document = parsed.to_document()
    assert set(document) == {
        "raw_text", "clean_text", "skills", "email", "phone", "sections", "embedding", "parsed_at"
    }
    assert document["embedding"]["model"] == "BAAI/bge-small-en-v1.5"
    assert len(document["embedding"]["vectors"][0]) == 384


def test_parse_resume_file_rejects_pdf_without_text():
    with pytest.raises(TextExtractionError, match="No extractable text"):
        parse_resume_file(make_pdf(""), "scanned.pdf")
