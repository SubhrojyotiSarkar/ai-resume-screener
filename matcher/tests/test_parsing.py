import pytest

from app.core.cleaning import clean_text
from app.core.parsing import extract_email, extract_phone, extract_sections, guess_name


def test_extract_email():
    assert extract_email("Contact: Jane.Doe+jobs@Example.co.in today") == "jane.doe+jobs@example.co.in"
    assert extract_email("no email here") is None


@pytest.mark.parametrize(
    "text, expected",
    [
        ("Phone: +91 98765 43210", "+91 98765 43210"),
        ("Call (555) 123-4567", "(555) 123-4567"),
        ("Mobile: 9876543210", "9876543210"),
        ("+1-202-555-0143 (work)", "+1-202-555-0143"),
    ],
)
def test_extract_phone(text, expected):
    assert extract_phone(text) == expected


def test_extract_phone_ignores_years_and_short_numbers():
    assert extract_phone("Engineer 2018 - 2022, scored 95 / 100") is None


def test_guess_name(resume_texts):
    assert guess_name(resume_texts["strong"]) == "Priya Sharma"  # all caps is title-cased
    assert guess_name(resume_texts["partial"]) == "Rahul Verma"


def test_guess_name_skips_headers_and_splits_on_separators():
    assert guess_name("Curriculum Vitae\nJane Doe | Data Scientist") == "Jane Doe"
    assert guess_name("jane@example.com\n+91 98765 43210") is None


def test_extract_sections(resume_texts):
    sections = extract_sections(resume_texts["strong"])
    assert set(sections) == {"summary", "skills", "experience", "education"}
    assert sections["education"] == "B.Tech in Computer Science, IIT Madras, 2018"
    assert "TalentStack" in sections["experience"]


def test_clean_text_lowercases_removes_stopwords_and_lemmatizes():
    cleaned = clean_text("I was Developing scalable services, and managing the databases!").split()
    assert {"develop", "scalable", "service", "manage", "database"} <= set(cleaned)
    assert not {"i", "was", "and", "the", ",", "!"} & set(cleaned)


def test_clean_text_drops_emails_and_urls():
    assert clean_text("jane@example.com https://example.com python") == "python"
