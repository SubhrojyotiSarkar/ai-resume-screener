from typing import Annotated

from bson import ObjectId
from pydantic import BaseModel, Field, field_validator


def validate_object_ids(ids: list[str]) -> list[str]:
    invalid = [i for i in ids if not ObjectId.is_valid(i)]
    if invalid:
        raise ValueError(f"invalid resume ids: {', '.join(invalid)}")
    return list(dict.fromkeys(ids))  # de-duplicate, keep order


class ScoreRequest(BaseModel):
    job_description: str = Field(min_length=1, max_length=50_000)
    required_skills: list[Annotated[str, Field(max_length=100)]] = Field(default_factory=list, max_length=100)
    resume_ids: list[str] = Field(min_length=1, max_length=500)

    @field_validator("job_description")
    @classmethod
    def job_description_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("job_description must not be blank")
        return value

    @field_validator("required_skills")
    @classmethod
    def strip_skills(cls, skills: list[str]) -> list[str]:
        return [s.strip() for s in skills if s.strip()]

    @field_validator("resume_ids")
    @classmethod
    def valid_unique_ids(cls, ids: list[str]) -> list[str]:
        return validate_object_ids(ids)


class ScoreItem(BaseModel):
    resume_id: str
    match_score: float = Field(ge=0, le=100)
    text_score: float = Field(ge=0, le=100)
    skill_score: float = Field(ge=0, le=100)
    # Components of text_score, exposed for transparency and tuning.
    semantic_score: float = Field(ge=0, le=100)
    lexical_score: float = Field(ge=0, le=100)
    matched_skills: list[str]
    missing_skills: list[str]
