"""Score resumes against a job description.

    text_score = 0.7 * semantic + 0.3 * lexical
    final      = 0.6 * text_score + 0.4 * skill_score        (all reported 0-100)

- semantic: calibrated embedding similarity between the JD and the resume
  (see `app.core.embeddings`). Captures meaning: "built HTTP endpoints in
  Flask" is close to "design REST APIs in Python".
- lexical: cosine similarity of TF-IDF vectors of the cleaned texts, with the
  vectorizer fitted on the JD plus the batch. Rewards the JD's exact wording.
- skill_score: |required skills found in the resume| / max(|required|, 1).
  If no required skills are given, they are extracted from the JD.
"""

from dataclasses import dataclass

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.core.cleaning import clean_text
from app.core.embeddings import Embedder, calibrate, embed_text, get_embedder, semantic_similarity
from app.core.skills import SkillMatcher, get_skill_matcher, ngrams, normalize, tokenize

SEMANTIC_WEIGHT = 0.7
LEXICAL_WEIGHT = 0.3
TEXT_WEIGHT = 0.6
SKILL_WEIGHT = 0.4


@dataclass(frozen=True)
class ResumeForScoring:
    id: str
    raw_text: str
    clean_text: str
    skills: list[str]
    # Precomputed chunk embeddings from parse time; computed on the fly when None.
    embeddings: np.ndarray | None = None


@dataclass(frozen=True)
class ScoreResult:
    resume_id: str
    match_score: float
    text_score: float
    skill_score: float
    semantic_score: float
    lexical_score: float
    matched_skills: list[str]
    missing_skills: list[str]


def compute_lexical_scores(jd_clean: str, resume_cleans: list[str]) -> list[float]:
    """Cosine similarity (0-1) between the JD and each resume in TF-IDF space."""
    if not resume_cleans:
        return []
    vectorizer = TfidfVectorizer(ngram_range=(1, 2), stop_words="english")
    try:
        matrix = vectorizer.fit_transform([jd_clean, *resume_cleans])
    except ValueError:
        # Empty vocabulary: no document has any usable terms.
        return [0.0] * len(resume_cleans)
    similarities = cosine_similarity(matrix[0:1], matrix[1:]).ravel()
    return [float(min(max(s, 0.0), 1.0)) for s in similarities]


def resolve_required_skills(required: list[str], job_description: str, matcher: SkillMatcher) -> list[str]:
    """Canonicalize and de-duplicate required skills, falling back to skills found in the JD."""
    resolved: list[str] = []
    for skill in required:
        canonical = matcher.canonicalize(skill)
        if canonical and canonical not in resolved:
            resolved.append(canonical)
    return resolved or matcher.extract(job_description)


def match_skills(required: list[str], resume: ResumeForScoring) -> tuple[list[str], list[str]]:
    """Split required skills into (matched, missing) for one resume, preserving order.

    A skill matches if it was extracted from the resume via the dictionary, or if
    its name appears verbatim in the resume text. The second check covers skills
    outside the dictionary (e.g. "figma plugins") and ambiguous names the
    dictionary deliberately skips, like "go", which count when a recruiter asks for them.
    """
    if not required:
        return [], []
    resume_skills = set(resume.skills)
    keys = {skill: normalize(skill) for skill in required}
    resume_grams = ngrams(tokenize(resume.raw_text), max(len(k.split()) for k in keys.values()))

    matched, missing = [], []
    for skill in required:
        found = skill in resume_skills or keys[skill] in resume_grams
        (matched if found else missing).append(skill)
    return matched, missing


def _to_percent(value: float) -> float:
    return round(value * 100, 1)


def score_resumes(
    job_description: str,
    required_skills: list[str],
    resumes: list[ResumeForScoring],
    matcher: SkillMatcher | None = None,
    embedder: Embedder | None = None,
) -> list[ScoreResult]:
    """Score each resume against the JD. Results are in the same order as `resumes`."""
    matcher = matcher or get_skill_matcher()
    embedder = embedder or get_embedder()

    required = resolve_required_skills(required_skills, job_description, matcher)
    lexical_scores = compute_lexical_scores(clean_text(job_description), [r.clean_text for r in resumes])
    jd_vectors = embed_text(job_description, embedder)

    results = []
    for resume, lexical in zip(resumes, lexical_scores, strict=True):
        resume_vectors = resume.embeddings if resume.embeddings is not None else embed_text(resume.raw_text, embedder)
        semantic = calibrate(semantic_similarity(jd_vectors, resume_vectors))
        text_score = SEMANTIC_WEIGHT * semantic + LEXICAL_WEIGHT * lexical

        matched, missing = match_skills(required, resume)
        skill_score = len(matched) / max(len(required), 1)
        final = TEXT_WEIGHT * text_score + SKILL_WEIGHT * skill_score

        results.append(
            ScoreResult(
                resume_id=resume.id,
                match_score=_to_percent(final),
                text_score=_to_percent(text_score),
                skill_score=_to_percent(skill_score),
                semantic_score=_to_percent(semantic),
                lexical_score=_to_percent(lexical),
                matched_skills=matched,
                missing_skills=missing,
            )
        )
    return results
