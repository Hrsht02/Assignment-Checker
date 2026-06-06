from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.notification import Notification, NotificationType


async def create_notification(
    db: AsyncSession,
    user_id: str,
    type: NotificationType,
    title: str,
    message: str,
    reference_id: str | None = None,
    reference_type: str | None = None,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        reference_id=reference_id,
        reference_type=reference_type,
    )
    db.add(notification)
    await db.flush()
    return notification


async def get_user_notifications(
    db: AsyncSession, user_id: str, skip: int = 0, limit: int = 50
) -> tuple[list[Notification], int]:
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    notifications = result.scalars().all()

    unread_result = await db.execute(
        select(func.count(Notification.id))
        .where(Notification.user_id == user_id, Notification.is_read == False)
    )
    unread_count = unread_result.scalar() or 0
    return list(notifications), unread_count


async def mark_notifications_read(
    db: AsyncSession, user_id: str, notification_ids: list[str] | None = None
) -> None:
    query = select(Notification).where(Notification.user_id == user_id)
    if notification_ids:
        query = query.where(Notification.id.in_(notification_ids))
    else:
        query = query.where(Notification.is_read == False)

    result = await db.execute(query)
    for n in result.scalars().all():
        n.is_read = True
    await db.flush()
