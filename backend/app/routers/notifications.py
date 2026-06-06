from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.notification import NotificationListResponse
from app.services.notification import (
    get_user_notifications, mark_notifications_read
)
from app.dependencies import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListResponse)
async def get_notifications(
    skip: int = 0,
    limit: int = Query(default=50, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notifications, unread_count = await get_user_notifications(
        db, current_user.id, skip, limit
    )
    from app.schemas.notification import NotificationResponse
    return NotificationListResponse(
        notifications=[NotificationResponse.model_validate(n) for n in notifications],
        unread_count=unread_count,
    )


@router.post("/read-all")
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await mark_notifications_read(db, current_user.id)
    await db.commit()
    return {"message": "All notifications marked as read"}


@router.post("/read")
async def mark_selected_read(
    notification_ids: list[str],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await mark_notifications_read(db, current_user.id, notification_ids)
    await db.commit()
    return {"message": "Notifications marked as read"}
