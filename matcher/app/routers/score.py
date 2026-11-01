from typing import Any

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool

from app.core.embeddings import MODEL_NAME
from app.core.scoring import ResumeForScoring, score_resumes
from app.core.security import require_internal_key
from app.db.repository import ResumeRepository, get_repository
from app.schemas.score import ScoreItem, ScoreRequest

router = APIRouter(tags=["score"], dependencies=[Depends(require_internal_key)])


def _stored_embeddings(document: dict[str, Any]) -> np.ndarray | None:
    """Reuse vectors computed at parse time, unless they came from a different model."""
    embedding = document.get("embedding") or {}
    if embedding.get("model") != MODEL_NAME or not embedding.get("vectors"):
        return None
    return np.asarray(embedding["vectors"], dtype=np.float32)


@router.post("/score", response_model=list[ScoreItem])
async def score(
    body: ScoreRequest,
    repository: ResumeRepository = Depends(get_repository),
) -> list[ScoreItem]:
    """Score resumes against a job description. Results follow the order of `resume_ids`."""
    documents = {doc["_id"]: doc for doc in await repository.get_many(body.resume_ids)}
    missing = [i for i in body.resume_ids if i not in documents]
    if missing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Parsed resumes not found: {', '.join(missing)}")

    resumes = [
        ResumeForScoring(
            id=i,
            raw_text=documents[i].get("raw_text", ""),
            clean_text=documents[i].get("clean_text", ""),
            skills=documents[i].get("skills", []),
            embeddings=_stored_embeddings(documents[i]),
        )
        for i in body.resume_ids
    ]
    results = await run_in_threadpool(score_resumes, body.job_description, body.required_skills, resumes)
    return [ScoreItem(**vars(r)) for r in results]
