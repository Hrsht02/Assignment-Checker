"""
APScheduler setup for periodic tasks:
- Deadline-triggered evaluation
- 24-hour reminder emails
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

scheduler = AsyncIOScheduler(timezone="UTC")


def start_scheduler():
    """Register and start all periodic jobs."""
    scheduler.add_job(
        _trigger_deadline_evaluations,
        IntervalTrigger(minutes=2),
        id="deadline_evaluations",
        replace_existing=True,
        misfire_grace_time=120,
    )
    scheduler.add_job(
        _trigger_deadline_reminders,
        IntervalTrigger(minutes=10),
        id="deadline_reminders",
        replace_existing=True,
        misfire_grace_time=300,
    )
    scheduler.start()


async def _trigger_deadline_evaluations():
    """Find assignments whose deadlines just passed and trigger evaluation."""
    from datetime import datetime, timezone
    from app.database import AsyncSessionLocal
    from app.models.assignment import Assignment, AssignmentStatus
    from app.models.submission import Submission, SubmissionStatus
    from app.models.notification import NotificationType
    from app.services import notification as notif_svc
    from app.services.email import send_deadline_reached_email
    from app.models.user import User
    from app.tasks.evaluation_tasks import evaluate_submission_task
    from app.tasks.report_tasks import generate_marks_report_task
    from sqlalchemy import select

    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        # Find active assignments past deadline
        result = await db.execute(
            select(Assignment).where(
                Assignment.status == AssignmentStatus.ACTIVE,
                Assignment.deadline <= now,
            )
        )
        expired = result.scalars().all()

        for assignment in expired:
            # Mark as closed
            assignment.status = AssignmentStatus.CLOSED

            # Find unevaluated submissions
            subs_result = await db.execute(
                select(Submission).where(
                    Submission.assignment_id == assignment.id,
                    Submission.status == SubmissionStatus.SUBMITTED,
                )
            )
            pending_subs = subs_result.scalars().all()

            if pending_subs:
                for sub in pending_subs:
                    from app.tasks.evaluation_tasks import safe_delay
                    safe_delay(evaluate_submission_task, str(sub.id))

                # Notify professor
                prof_result = await db.execute(
                    select(User).where(User.id == assignment.created_by)
                )
                professor = prof_result.scalar_one_or_none()

                await notif_svc.create_notification(
                    db, assignment.created_by,
                    NotificationType.DEADLINE_REACHED,
                    "Assignment Deadline Reached",
                    f"The deadline for '{assignment.title}' has passed. "
                    f"Evaluating {len(pending_subs)} submission(s).",
                    reference_id=assignment.id, reference_type="assignment"
                )

                if professor:
                    await send_deadline_reached_email(
                        professor.email, professor.name, assignment.title
                    )

            # Always generate report after deadline
            from app.tasks.evaluation_tasks import safe_delay
            safe_delay(generate_marks_report_task, str(assignment.id))

        await db.commit()


async def _trigger_deadline_reminders():
    """Dispatch the Celery task for 24-hour reminders."""
    from app.tasks.evaluation_tasks import check_deadline_reminders, safe_delay
    safe_delay(check_deadline_reminders)
