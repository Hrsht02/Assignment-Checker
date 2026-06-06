from datetime import datetime
from pydantic import BaseModel
from app.models.notification import NotificationType


class NotificationResponse(BaseModel):
    id: str
    user_id: str
    type: NotificationType
    title: str
    message: str
    is_read: bool
    reference_id: str | None
    reference_type: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationListResponse(BaseModel):
    notifications: list[NotificationResponse]
    unread_count: int
