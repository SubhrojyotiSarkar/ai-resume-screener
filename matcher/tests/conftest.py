import os
from pathlib import Path

# Provide dummy config before the app is imported, so tests never need a real .env.
os.environ["MONGO_URL"] = "mongodb://localhost:27017"
os.environ["INTERNAL_API_KEY"] = "test-internal-key-0123456789"

import pytest  # noqa: E402
from bson import ObjectId  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db.repository import get_repository  # noqa: E402
from app.main import app  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"
INTERNAL_KEY = os.environ["INTERNAL_API_KEY"]


def read_fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


@pytest.fixture(scope="session")
def jd_text() -> str:
    return read_fixture("sample_jd.txt")


@pytest.fixture(scope="session")
def resume_texts() -> dict[str, str]:
    names = ("strong", "synonym", "partial", "weak", "unrelated")
    return {name: read_fixture(f"resume_{name}.txt") for name in names}


class FakeRepository:
    """In-memory stand-in for MongoResumeRepository."""

    def __init__(self):
        self.documents: dict[str, dict] = {}

    async def insert(self, document: dict) -> str:
        doc_id = str(ObjectId())
        self.documents[doc_id] = {**document, "_id": doc_id}
        return doc_id

    async def get_many(self, ids: list[str]) -> list[dict]:
        return [self.documents[i] for i in ids if i in self.documents]

    async def delete_many(self, ids: list[str]) -> int:
        return sum(self.documents.pop(i, None) is not None for i in ids)


@pytest.fixture
def repository() -> FakeRepository:
    return FakeRepository()


@pytest.fixture
def client(repository: FakeRepository):
    app.dependency_overrides[get_repository] = lambda: repository
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"X-Internal-Key": INTERNAL_KEY}
