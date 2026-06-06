from app.tasks.celery_app import celery_app
from app.config import get_settings

settings = get_settings()


def _run_async(coro):
    """Run an async coroutine from a sync Celery task."""
    import asyncio
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _celery_available() -> bool:
    """Return True only if Redis broker is reachable."""
    try:
        celery_app.control.inspect(timeout=1).ping()
        return True
    except Exception:
        return False


def safe_delay(task_fn, *args, **kwargs):
    """
    Dispatch a Celery task only when the broker is reachable.
    In dev (no Redis), silently skips so the API still works.
    """
    try:
        task_fn.delay(*args, **kwargs)
    except Exception as e:
        print(f"[Celery DEV] Task {task_fn.name} skipped (broker unavailable): {e}")


@celery_app.task(name="evaluate_submission", bind=True, max_retries=2)
def evaluate_submission_task(self, submission_id: str):
    """
    Main evaluation task:
    1. Run similarity check
    2. If not flagged/rejected, run AI evaluation
    3. Update submission status and notify
    """
    _run_async(_evaluate_submission_async(submission_id))


async def _evaluate_submission_async(submission_id: str):
    from app.database import AsyncSessionLocal
    from app.models.submission import Submission, SubmissionStatus
    from app.models.assignment import Assignment
    from app.models.evaluation import EvaluationReport
    from app.models.notification import NotificationType
    from app.services import notification as notif_svc
    from app.services import email as email_svc
    from app.services.evaluation_pipeline import run_evaluation
    from app.services.similarity import (
        compute_embedding, find_most_similar, compute_text_hash
    )
    from app.services.pdf_processor import extract_text_from_pdf
    from sqlalchemy import select
    import httpx

    async with AsyncSessionLocal() as db:
        # Load submission with assignment
        result = await db.execute(
            select(Submission)
            .where(Submission.id == uuid.UUID(submission_id))
        )
        submission = result.scalar_one_or_none()
        if not submission:
            return

        result = await db.execute(
            select(Assignment).where(Assignment.id == submission.assignment_id)
        )
        assignment = result.scalar_one_or_none()
        if not assignment:
            return

        # ── 1. Similarity check ───────────────────────────────────────────
        try:
            response = httpx.get(submission.file_url, timeout=30)
            response.raise_for_status()
            pdf_bytes = response.content
        except Exception:
            submission.status = SubmissionStatus.EXTRACTION_FAILED
            await db.commit()
            return

        try:
            extracted_text, _ = extract_text_from_pdf(pdf_bytes)
        except Exception:
            extracted_text = ""

        if not extracted_text.strip():
            submission.status = SubmissionStatus.EXTRACTION_FAILED
            await db.commit()
            # Notify professor
            await notif_svc.create_notification(
                db, assignment.created_by,
                NotificationType.EXTRACTION_FAILED,
                "Extraction Failed",
                f"Text extraction failed for a submission in '{assignment.title}'.",
                reference_id=submission.id, reference_type="submission"
            )
            await db.commit()
            return

        # Get all accepted submissions for this assignment (not this one)
        accepted_result = await db.execute(
            select(Submission).where(
                Submission.assignment_id == submission.assignment_id,
                Submission.id != submission.id,
                Submission.status.in_([
                    SubmissionStatus.SUBMITTED,
                    SubmissionStatus.EVALUATING,
                    SubmissionStatus.EVALUATED,
                ])
            )
        )
        prior_submissions = accepted_result.scalars().all()

        if prior_submissions:
            # Build embeddings for prior submissions
            prior_texts = []
            prior_ids = []
            prior_embeddings = []

            for ps in prior_submissions:
                # Try to get extracted text from evaluation report
                eval_result = await db.execute(
                    select(EvaluationReport).where(EvaluationReport.submission_id == ps.id)
                )
                eval_report = eval_result.scalar_one_or_none()
                prior_text = eval_report.extracted_text if eval_report else None

                if not prior_text:
                    # Extract from PDF
                    try:
                        pr = httpx.get(ps.file_url, timeout=30)
                        pt, _ = extract_text_from_pdf(pr.content)
                        prior_text = pt
                    except Exception:
                        continue

                if prior_text:
                    prior_texts.append(prior_text)
                    prior_ids.append(str(ps.id))
                    prior_embeddings.append(compute_embedding(prior_text))

            if prior_embeddings:
                query_embedding = compute_embedding(extracted_text)
                best_id, best_score = find_most_similar(
                    query_embedding, prior_embeddings, prior_ids
                )

                submission.similarity_score = best_score
                if best_id:
                    submission.matched_submission_id = uuid.UUID(best_id)

                if best_score >= settings.SIMILARITY_THRESHOLD:
                    # Flag for professor review
                    submission.status = SubmissionStatus.SIMILARITY_REVIEW
                    await db.commit()

                    # Notify professor
                    from app.models.user import User
                    prof_result = await db.execute(
                        select(User).where(User.id == assignment.created_by)
                    )
                    professor = prof_result.scalar_one_or_none()

                    await notif_svc.create_notification(
                        db, assignment.created_by,
                        NotificationType.PLAGIARISM_FLAGGED,
                        "Similarity Flagged",
                        f"A submission for '{assignment.title}' has a similarity score of "
                        f"{best_score:.1%}. Please review.",
                        reference_id=submission.id, reference_type="submission"
                    )

                    if professor:
                        from app.services.email import send_email
                        student_result = await db.execute(
                            select(User).where(User.id == submission.student_id)
                        )
                        student = student_result.scalar_one_or_none()
                        await send_email(
                            professor.email,
                            f"Similarity Flagged: {assignment.title}",
                            f"<p>A submission by {student.name if student else 'a student'} "
                            f"for <strong>{assignment.title}</strong> has a similarity score "
                            f"of {best_score:.1%}. Please review in your dashboard.</p>"
                        )

                    await db.commit()
                    return  # Don't proceed to AI evaluation

        # ── 2. AI Evaluation ──────────────────────────────────────────────
        submission.status = SubmissionStatus.EVALUATING
        await db.commit()

        state = run_evaluation(
            submission_id=str(submission.id),
            assignment_id=str(assignment.id),
            file_url=submission.file_url,
            assignment_title=assignment.title,
            assignment_description=assignment.description,
            rubric=assignment.rubric,
            max_marks=assignment.max_marks,
        )

        if state["status"] == "extraction_failed":
            submission.status = SubmissionStatus.EXTRACTION_FAILED
            await db.commit()
            await notif_svc.create_notification(
                db, assignment.created_by,
                NotificationType.EXTRACTION_FAILED,
                "Extraction Failed",
                f"Could not extract text from a submission in '{assignment.title}'.",
                reference_id=submission.id, reference_type="submission"
            )
            await db.commit()
            return

        if state["status"] == "evaluation_failed":
            submission.status = SubmissionStatus.EVALUATION_FAILED
            await db.commit()
            await notif_svc.create_notification(
                db, assignment.created_by,
                NotificationType.EVALUATION_FAILED,
                "Evaluation Failed",
                f"AI evaluation failed for a submission in '{assignment.title}'.",
                reference_id=submission.id, reference_type="submission"
            )
            await db.commit()
            return

        # Store evaluation report
        eval_report = EvaluationReport(
            submission_id=submission.id,
            strengths=state["strengths"] or "",
            areas_of_improvement=state["areas_of_improvement"] or "",
            ai_score=state["ai_score"],
            detailed_feedback=state["detailed_feedback"] or "",
            extracted_text=state.get("extracted_text"),
        )
        db.add(eval_report)
        submission.status = SubmissionStatus.EVALUATED
        await db.commit()

        # Check if all submissions for this assignment are now terminal
        await _check_all_evaluated(db, assignment)
        await db.commit()


async def _check_all_evaluated(db, assignment):
    """Notify professor when all submissions have reached terminal status."""
    from app.models.submission import Submission, SubmissionStatus
    from app.models.notification import NotificationType
    from app.services import notification as notif_svc
    from app.services.email import send_evaluation_complete_email
    from app.models.user import User
    from sqlalchemy import select

    terminal_statuses = [
        SubmissionStatus.EVALUATED,
        SubmissionStatus.EXTRACTION_FAILED,
        SubmissionStatus.EVALUATION_FAILED,
        SubmissionStatus.REJECTED,
    ]
    non_terminal_result = await db.execute(
        select(Submission).where(
            Submission.assignment_id == assignment.id,
            Submission.status.notin_(terminal_statuses),
        )
    )
    non_terminal = non_terminal_result.scalars().all()

    if not non_terminal:
        # All done — notify professor
        await notif_svc.create_notification(
            db, assignment.created_by,
            NotificationType.EVALUATION_COMPLETE,
            "Evaluation Complete",
            f"All submissions for '{assignment.title}' have been evaluated.",
            reference_id=assignment.id, reference_type="assignment"
        )
        prof_result = await db.execute(
            select(User).where(User.id == assignment.created_by)
        )
        professor = prof_result.scalar_one_or_none()
        if professor:
            await send_evaluation_complete_email(
                professor.email, professor.name, assignment.title
            )


@celery_app.task(name="check_deadline_reminders")
def check_deadline_reminders():
    """Send 24-hour deadline reminders to students who haven't submitted."""
    _run_async(_check_deadline_reminders_async())


async def _check_deadline_reminders_async():
    from datetime import datetime, timezone, timedelta
    from app.database import AsyncSessionLocal
    from app.models.assignment import Assignment, AssignmentStatus
    from app.models.academic import SectionEnrollment
    from app.models.submission import Submission, SubmissionStatus
    from app.models.user import User
    from app.models.notification import NotificationType
    from app.services import notification as notif_svc
    from app.services.email import send_deadline_reminder_email
    from sqlalchemy import select

    now = datetime.now(timezone.utc)
    reminder_window_start = now + timedelta(hours=23, minutes=55)
    reminder_window_end = now + timedelta(hours=24, minutes=5)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Assignment).where(
                Assignment.status == AssignmentStatus.ACTIVE,
                Assignment.deadline >= reminder_window_start,
                Assignment.deadline <= reminder_window_end,
            )
        )
        assignments = result.scalars().all()

        for assignment in assignments:
            # Get enrolled students
            enrolled_result = await db.execute(
                select(SectionEnrollment).where(
                    SectionEnrollment.section_id == assignment.section_id
                )
            )
            enrollments = enrolled_result.scalars().all()

            for enrollment in enrollments:
                # Check if student has submitted
                sub_result = await db.execute(
                    select(Submission).where(
                        Submission.assignment_id == assignment.id,
                        Submission.student_id == enrollment.student_id,
                        Submission.status != SubmissionStatus.REJECTED,
                    )
                )
                existing = sub_result.scalar_one_or_none()
                if existing:
                    continue

                # Send reminder
                student_result = await db.execute(
                    select(User).where(User.id == enrollment.student_id)
                )
                student = student_result.scalar_one_or_none()
                if not student:
                    continue

                await notif_svc.create_notification(
                    db, student.id,
                    NotificationType.DEADLINE_REMINDER,
                    "Deadline Reminder",
                    f"The deadline for '{assignment.title}' is in 24 hours.",
                    reference_id=assignment.id, reference_type="assignment"
                )
                await send_deadline_reminder_email(
                    student.email,
                    student.name,
                    assignment.title,
                    assignment.deadline.strftime("%Y-%m-%d %H:%M UTC"),
                )

        await db.commit()
