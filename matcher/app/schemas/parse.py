from pydantic import BaseModel


class ParseResponse(BaseModel):
    mongo_id: str
    skills: list[str]
    email: str | None
    name_guess: str | None
