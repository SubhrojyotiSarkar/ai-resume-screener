from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool

from app.core.pipeline import parse_resume_file
from app.core.security import require_internal_key
from app.core.text_extraction import TextExtractionError, UnsupportedFileTypeError
from app.db.repository import ResumeRepository, get_repository
from app.schemas.parse import ParseResponse

MAX_UPLOAD_BYTES = 5 * 1024 * 1024

router = APIRouter(tags=["parse"], dependencies=[Depends(require_internal_key)])


@router.post("/parse", response_model=ParseResponse, status_code=status.HTTP_201_CREATED)
async def parse_resume(
    file: UploadFile = File(...),
    repository: ResumeRepository = Depends(get_repository),
) -> ParseResponse:
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "File exceeds the 5 MB limit")
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is empty")

    try:
        # Text extraction and spaCy are CPU-bound; keep them off the event loop.
        parsed = await run_in_threadpool(parse_resume_file, data, file.filename or "")
    except UnsupportedFileTypeError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    except TextExtractionError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc

    mongo_id = await repository.insert(parsed.to_document())
    return ParseResponse(
        mongo_id=mongo_id,
        skills=parsed.skills,
        email=parsed.email,
        name_guess=parsed.name_guess,
    )
