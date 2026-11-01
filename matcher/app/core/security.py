import hmac

from fastapi import Depends, Header, HTTPException, status

from app.core.config import Settings, get_settings


async def require_internal_key(
    x_internal_key: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    """Reject requests that don't carry the shared server-to-matcher secret."""
    if not x_internal_key or not hmac.compare_digest(x_internal_key, settings.internal_api_key):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing internal key")
