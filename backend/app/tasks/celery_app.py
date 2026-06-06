from celery import Celery
from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "academic_platform",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.tasks.evaluation_tasks",
        "app.tasks.report_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_soft_time_limit=600,
    task_time_limit=660,
    # Don't raise on broker connection failure at import time
    broker_connection_retry_on_startup=False,
    broker_connection_max_retries=0,
)
