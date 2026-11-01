from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from pymongo import AsyncMongoClient

from app.core.cleaning import get_nlp
from app.core.config import get_settings
from app.core.embeddings import get_embedder
from app.core.skills import get_skill_matcher
from app.db.repository import COLLECTION_NAME, MongoResumeRepository
from app.routers import health, parse, resumes, score


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    # The client connects lazily, so startup doesn't block on Mongo being reachable.
    client = AsyncMongoClient(settings.mongo_url, serverSelectionTimeoutMS=5000, tz_aware=True)
    app.state.repository = MongoResumeRepository(client[settings.mongo_db][COLLECTION_NAME])

    # Load the models and skill dictionary up front so the first request isn't slow.
    await run_in_threadpool(get_nlp)
    await run_in_threadpool(get_embedder)
    get_skill_matcher()

    yield
    await client.close()


def create_app() -> FastAPI:
    # Fail fast on startup if required configuration is missing.
    get_settings()

    app = FastAPI(title="Resume Matcher", version="0.2.0", lifespan=lifespan)
    app.include_router(health.router)
    app.include_router(parse.router)
    app.include_router(score.router)
    app.include_router(resumes.router)
    return app


app = create_app()
