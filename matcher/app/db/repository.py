"""Storage for parsed resumes. Routers depend on the `ResumeRepository` protocol so tests can swap in a fake."""

from typing import Any, Protocol

from bson import ObjectId
from fastapi import Request
from pymongo.asynchronous.collection import AsyncCollection

COLLECTION_NAME = "parsed_resumes"


class ResumeRepository(Protocol):
    async def insert(self, document: dict[str, Any]) -> str: ...

    async def get_many(self, ids: list[str]) -> list[dict[str, Any]]:
        """Return the documents that exist for `ids`, each with `_id` as a string."""
        ...

    async def delete_many(self, ids: list[str]) -> int:
        """Delete documents by id; returns how many existed."""
        ...


class MongoResumeRepository:
    def __init__(self, collection: AsyncCollection):
        self._collection = collection

    async def insert(self, document: dict[str, Any]) -> str:
        result = await self._collection.insert_one(document)
        return str(result.inserted_id)

    async def get_many(self, ids: list[str]) -> list[dict[str, Any]]:
        cursor = self._collection.find(
            {"_id": {"$in": [ObjectId(i) for i in ids]}},
            projection={"raw_text": 1, "clean_text": 1, "skills": 1, "embedding": 1},
        )
        return [{**doc, "_id": str(doc["_id"])} async for doc in cursor]

    async def delete_many(self, ids: list[str]) -> int:
        result = await self._collection.delete_many({"_id": {"$in": [ObjectId(i) for i in ids]}})
        return result.deleted_count


def get_repository(request: Request) -> ResumeRepository:
    return request.app.state.repository
