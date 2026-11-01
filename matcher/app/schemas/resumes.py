from pydantic import BaseModel, Field, field_validator

from app.schemas.score import validate_object_ids


class DeleteResumesRequest(BaseModel):
    resume_ids: list[str] = Field(min_length=1, max_length=1000)

    @field_validator("resume_ids")
    @classmethod
    def valid_unique_ids(cls, ids: list[str]) -> list[str]:
        return validate_object_ids(ids)


class DeleteResumesResponse(BaseModel):
    deleted: int
