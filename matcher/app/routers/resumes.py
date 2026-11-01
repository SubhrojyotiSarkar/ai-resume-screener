from fastapi import APIRouter, Depends

from app.core.security import require_internal_key
from app.db.repository import ResumeRepository, get_repository
from app.schemas.resumes import DeleteResumesRequest, DeleteResumesResponse

router = APIRouter(tags=["resumes"], dependencies=[Depends(require_internal_key)])


# POST rather than DELETE because the ids travel in a JSON body.
@router.post("/resumes/delete", response_model=DeleteResumesResponse)
async def delete_resumes(
    body: DeleteResumesRequest,
    repository: ResumeRepository = Depends(get_repository),
) -> DeleteResumesResponse:
    """Delete parsed resumes, e.g. when the server deletes a job or a failed upload."""
    return DeleteResumesResponse(deleted=await repository.delete_many(body.resume_ids))
