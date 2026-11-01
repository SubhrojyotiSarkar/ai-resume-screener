import numpy as np
import pytest

from app.core.cleaning import clean_text
from app.core.embeddings import embed_text, get_embedder, normalize_rows
from app.core.scoring import (
    ResumeForScoring,
    compute_lexical_scores,
    match_skills,
    resolve_required_skills,
    score_resumes,
)
from app.core.skills import get_skill_matcher

REQUIRED = ["Python", "React", "TypeScript", "PostgreSQL", "Docker", "AWS", "FastAPI"]


def to_resume(resume_id: str, text: str, embeddings: np.ndarray | None = None) -> ResumeForScoring:
    return ResumeForScoring(
        id=resume_id,
        raw_text=text,
        clean_text=clean_text(text),
        skills=get_skill_matcher().extract(text),
        embeddings=embeddings,
    )


def constant_embedder(texts: list[str]) -> np.ndarray:
    """Every text gets the same vector, so semantic similarity is exactly 1.0."""
    return normalize_rows(np.ones((len(texts), 4), dtype=np.float32))


@pytest.fixture(scope="module")
def results(jd_text, resume_texts) -> dict:
    # Deliberately not in rank order.
    resumes = [to_resume(name, text) for name, text in resume_texts.items()]
    return {r.resume_id: r for r in score_resumes(jd_text, REQUIRED, resumes)}


def test_ranking(results):
    scores = {name: r.match_score for name, r in results.items()}
    assert scores["strong"] > scores["partial"] > scores["weak"]
    assert scores["synonym"] > scores["weak"] > 0
    assert scores["strong"] >= 70  # all required skills plus a close description
    assert scores["weak"] < 40 and scores["unrelated"] < 40


def test_semantic_score_rescues_resumes_with_different_wording(results):
    # TF-IDF barely registers the synonym resume; embeddings recognise it as relevant.
    synonym, weak = results["synonym"], results["weak"]
    assert synonym.lexical_score < 15
    assert synonym.semantic_score > 40
    assert synonym.semantic_score > weak.semantic_score + 30


def test_results_keep_input_order(jd_text, resume_texts):
    resumes = [to_resume(name, resume_texts[name]) for name in ("weak", "strong")]
    assert [r.resume_id for r in score_resumes(jd_text, REQUIRED, resumes)] == ["weak", "strong"]


def test_matched_and_missing_skills(results):
    strong = results["strong"]
    assert strong.matched_skills == ["python", "react", "typescript", "postgresql", "docker", "aws", "fastapi"]
    assert strong.missing_skills == []
    assert strong.skill_score == 100.0

    partial = results["partial"]
    assert partial.matched_skills == ["react", "docker"]
    assert partial.missing_skills == ["python", "typescript", "postgresql", "aws", "fastapi"]
    assert partial.skill_score == round(2 / 7 * 100, 1)


def test_score_formula(results):
    for r in results.values():
        # Components are rounded to 1 dp before these checks, so allow rounding slack.
        assert r.text_score == pytest.approx(0.7 * r.semantic_score + 0.3 * r.lexical_score, abs=0.1)
        assert r.match_score == pytest.approx(0.6 * r.text_score + 0.4 * r.skill_score, abs=0.1)
        assert 0 <= r.match_score <= 100
        assert r.match_score == round(r.match_score, 1)


def test_formula_with_fake_embedder():
    resume = to_resume("r1", "python developer")
    [result] = score_resumes("python developer", ["python", "rust"], [resume], embedder=constant_embedder)
    assert result.semantic_score == 100.0
    assert result.skill_score == 50.0
    expected_text = 0.7 * 1.0 + 0.3 * (result.lexical_score / 100)
    assert result.match_score == round((0.6 * expected_text + 0.4 * 0.5) * 100, 1)


def test_precomputed_embeddings_are_used(jd_text, resume_texts):
    text = resume_texts["strong"]
    stored = embed_text(text, get_embedder())
    [with_stored] = score_resumes(jd_text, REQUIRED, [to_resume("a", text, stored)])
    [computed] = score_resumes(jd_text, REQUIRED, [to_resume("a", text)])
    assert with_stored == computed

    # Stored vectors take precedence over recomputing from text.
    opposite = -stored
    [flipped] = score_resumes(jd_text, REQUIRED, [to_resume("a", text, opposite)])
    assert flipped.semantic_score == 0.0


def test_empty_required_skills_falls_back_to_jd_skills(jd_text):
    from_jd = resolve_required_skills([], jd_text, get_skill_matcher())
    assert {"python", "react", "typescript", "postgresql", "docker", "aws", "fastapi", "git"} <= set(from_jd)


def test_required_skills_are_canonicalized_and_deduplicated(jd_text):
    resolved = resolve_required_skills(["ReactJS", "react", " Postgres ", "Figma Plugins"], jd_text, get_skill_matcher())
    assert resolved == ["react", "postgresql", "figma plugins"]


def test_custom_and_ambiguous_skills_match_resume_text():
    resume = to_resume("r1", "Wrote Figma plugins and backend services in Go.")
    matched, missing = match_skills(["figma plugins", "go", "rust"], resume)
    assert matched == ["figma plugins", "go"]
    assert missing == ["rust"]


def test_lexical_scores_handle_identical_and_empty_documents():
    assert compute_lexical_scores("python api", ["python api"])[0] == pytest.approx(1.0)
    assert compute_lexical_scores("", ["", ""]) == [0.0, 0.0]
    assert compute_lexical_scores("python", []) == []


def test_no_required_skills_anywhere_gives_zero_skill_score():
    [result] = score_resumes("We value kindness.", [], [to_resume("r1", "Kind person.")], embedder=constant_embedder)
    assert result.skill_score == 0.0
    assert result.matched_skills == result.missing_skills == []
