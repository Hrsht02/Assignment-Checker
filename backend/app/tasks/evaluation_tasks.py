"""
Celery tasks for AI evaluation, similarity detection, and deadline reminders.
"""
import asyncio
from app.tasks.celery_app import celery_app
from app.config import get_settings

settings = get_settings()


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def safe_delay(task_fn, *args, **kwargs):
    """Dispatch Celery task, silently skip if broker unavailable (dev mode)."""
    try:
        task_fn.delay(*args, **kwargs)
    except Exception as e:
        print(f"[Celery DEV] Task {getattr(task_fn, 'name', str(task_fn))} skipped: {e}")


# ── Main evaluation task ──────────────────────────────────────────────────────

@celery_app.task(name="evaluate_submission", bind=True, max_retries=2)
def evaluate_submission_task(self, submission_id: str):
    _run_async(_evaluate_async(submission_id))


async def _evaluate_async(submission_id: str):
    import json
    from app.database import AsyncSessionLocal
    from app.models.submission import Submission, SubmissionStatus, SubmissionType
    from app.models.assignment import Assignment
    from app.models.evaluation import EvaluationReport
    from app.models.notification import NotificationType
    from app.services import notification as notif_svc
    from app.services.evaluation_pipeline import run_evaluation
    from app.services.similarity import compute_embedding, find_most_similar
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        sub = (await db.execute(select(Submission).where(Submission.id == submission_id))).scalar_one_or_none()
        if not sub:
            return

        a = await db.get(Assignment, sub.assignment_id)
        if not a:
            return

        # ── Step 1: Get text content for similarity check ─────────────────
        if sub.submission_type == SubmissionType.TEXT:
            content_text = sub.text_content or ""
        else:
            # PDF — extract text first for similarity
            content_text = await _get_text_for_submission(sub)

        if not content_text.strip():
            sub.status = SubmissionStatus.EXTRACTION_FAILED
            await db.commit()
            await notif_svc.create_notification(
                db, a.created_by, NotificationType.EXTRACTION_FAILED,
                "Extraction Failed",
                f"Could not extract text from a submission for '{a.title}'.",
                reference_id=sub.id, reference_type="submission",
            )
            await db.commit()
            return

        # ── Step 2: Similarity check ──────────────────────────────────────
        prior_subs = (await db.execute(
            select(Submission).where(
                Submission.assignment_id == sub.assignment_id,
                Submission.id != sub.id,
                Submission.status.in_([
                    SubmissionStatus.SUBMITTED, SubmissionStatus.EVALUATING, SubmissionStatus.EVALUATED,
                ])
            )
        )).scalars().all()

        if prior_subs:
            prior_embeddings, prior_ids = [], []
            for ps in prior_subs:
                pt = await _get_text_for_submission(ps)
                if pt:
                    prior_embeddings.append(compute_embedding(pt))
                    prior_ids.append(ps.id)

            if prior_embeddings:
                query_emb = compute_embedding(content_text)
                best_id, best_score = find_most_similar(query_emb, prior_embeddings, prior_ids)
                sub.similarity_score = best_score
                if best_id:
                    sub.matched_submission_id = best_id

                if best_score >= settings.SIMILARITY_THRESHOLD:
                    sub.status = SubmissionStatus.SIMILARITY_REVIEW
                    await db.commit()

                    from app.models.user import User
                    professor = await db.get(User, a.created_by)
                    await notif_svc.create_notification(
                        db, a.created_by, NotificationType.PLAGIARISM_FLAGGED,
                        "Similarity Flagged",
                        f"Submission for '{a.title}' has {best_score:.1%} similarity. Please review.",
                        reference_id=sub.id, reference_type="submission",
                    )
                    if professor:
                        from app.services.email import send_email
                        await send_email(
                            professor.email,
                            f"Similarity Alert: {a.title}",
                            f"<p>A submission has {best_score:.1%} similarity. Please review in your dashboard.</p>",
                        )
                    await db.commit()
                    return

        # ── Step 3: AI Evaluation ─────────────────────────────────────────
        sub.status = SubmissionStatus.EVALUATING
        await db.commit()

        state = run_evaluation(
            submission_id=sub.id,
            assignment_id=a.id,
            submission_type=sub.submission_type.value,
            assignment_title=a.title,
            assignment_description=a.description,
            rubric=a.rubric or "",
            max_marks=a.max_marks,
            file_url=sub.file_url,
            text_content=sub.text_content,
        )

        if state["status"] == "extraction_failed":
            sub.status = SubmissionStatus.EXTRACTION_FAILED
            await db.commit()
            await notif_svc.create_notification(
                db, a.created_by, NotificationType.EXTRACTION_FAILED,
                "Extraction Failed",
                f"Text extraction failed for '{a.title}' submission.",
                reference_id=sub.id, reference_type="submission",
            )
            await db.commit()
            return

        if state["status"] == "evaluation_failed":
            sub.status = SubmissionStatus.EVALUATION_FAILED
            await db.commit()
            await notif_svc.create_notification(
                db, a.created_by, NotificationType.EVALUATION_FAILED,
                "Evaluation Failed",
                f"AI evaluation failed for '{a.title}' submission.",
                reference_id=sub.id, reference_type="submission",
            )
            await db.commit()
            return

        # ── Step 4: Store report ──────────────────────────────────────────
        # Remove old report if re-evaluating
        old_report = (await db.execute(
            select(EvaluationReport).where(EvaluationReport.submission_id == sub.id)
        )).scalar_one_or_none()
        if old_report:
            await db.delete(old_report)
            await db.flush()

        report = EvaluationReport(
            submission_id=sub.id,
            ai_score=state["ai_score"] or 0,
            percentage=state.get("percentage") or 0.0,
            grade=state.get("grade") or "F",
            strengths=state.get("strengths") or "",
            areas_of_improvement=state.get("areas_of_improvement") or "",
            missing_points=state.get("missing_points") or "",
            suggestions=state.get("suggestions") or "",
            overall_feedback=state.get("overall_feedback") or "",
            detailed_feedback=state.get("overall_feedback") or "",
            rubric_breakdown=json.dumps(state.get("rubric_breakdown") or {}),
            extracted_text=state.get("extracted_text"),
        )
        db.add(report)
        sub.status = SubmissionStatus.EVALUATED
        await db.commit()

        # ── Step 5: Notify student ────────────────────────────────────────
        from app.models.user import User
        student = await db.get(User, sub.student_id)
        await notif_svc.create_notification(
            db, sub.student_id, NotificationType.EVALUATION_COMPLETE,
            "Assignment Evaluated",
            f"Your submission for '{a.title}' has been evaluated. Score: {state['ai_score']}/{a.max_marks}",
            reference_id=a.id, reference_type="assignment",
        )
        if student:
            from app.services.email import send_email
            await send_email(
                student.email,
                f"Evaluation Complete: {a.title}",
                f"<p>Your submission for <strong>{a.title}</strong> has been evaluated.</p>"
                f"<p>Score: <strong>{state['ai_score']}/{a.max_marks}</strong> ({state.get('grade', '')})</p>"
                f"<p>Log in to view detailed feedback.</p>",
            )
        await db.commit()

        # Check if all submissions for this assignment are done
        await _check_all_evaluated(db, a)
        await db.commit()


async def _get_text_for_submission(sub) -> str:
    """Get extracted text for a submission (PDF or text type)."""
    from app.models.submission import SubmissionType
    if sub.submission_type == SubmissionType.TEXT:
        return sub.text_content or ""
    if not sub.file_url:
        return ""
    try:
        import httpx
        from app.services.pdf_processor import extract_text_from_pdf
        r = httpx.get(sub.file_url, timeout=30)
        text, _ = extract_text_from_pdf(r.content)
        return text
    except Exception:
        return ""


async def _check_all_evaluated(db, assignment):
    from app.models.submission import Submission, SubmissionStatus
    from app.models.notification import NotificationType
    from app.services import notification as notif_svc
    from app.services.email import send_evaluation_complete_email
    from app.models.user import User
    from sqlalchemy import select

    terminal = [
        SubmissionStatus.EVALUATED, SubmissionStatus.EXTRACTION_FAILED,
        SubmissionStatus.EVALUATION_FAILED, SubmissionStatus.REJECTED,
    ]
    pending = (await db.execute(
        select(Submission).where(
            Submission.assignment_id == assignment.id,
            Submission.status.notin_(terminal),
        )
    )).scalars().all()

    if not pending:
        professor = await db.get(User, assignment.created_by)
        await notif_svc.create_notification(
            db, assignment.created_by, NotificationType.EVALUATION_COMPLETE,
            "All Submissions Evaluated",
            f"All submissions for '{assignment.title}' have been evaluated.",
            reference_id=assignment.id, reference_type="assignment",
        )
        if professor:
            await send_evaluation_complete_email(professor.email, professor.name, assignment.title)


# ── Deadline reminder task ────────────────────────────────────────────────────

@celery_app.task(name="check_deadline_reminders")
def check_deadline_reminders():
    _run_async(_deadline_reminders_async())


async def _deadline_reminders_async():
    from datetime import datetime, timezone, timedelta
    from app.database import AsyncSessionLocal
    from app.models.assignment import Assignment, AssignmentStatus
    from app.models.academic import StudentEnrollment
    from app.models.submission import Submission, SubmissionStatus
    from app.models.user import User
    from app.models.notification import NotificationType
    from app.services import notification as notif_svc
    from app.services.email import send_deadline_reminder_email
    from sqlalchemy import select

    now = datetime.now(timezone.utc)
    window_start = now + timedelta(hours=23, minutes=55)
    window_end = now + timedelta(hours=24, minutes=5)

    async with AsyncSessionLocal() as db:
        assignments = (await db.execute(
            select(Assignment).where(
                Assignment.status == AssignmentStatus.ACTIVE,
                Assignment.deadline >= window_start,
                Assignment.deadline <= window_end,
            )
        )).scalars().all()

        for a in assignments:
            enrollments = (await db.execute(
                select(StudentEnrollment).where(StudentEnrollment.semester_id == a.semester_id)
            )).scalars().all()

            for enr in enrollments:
                existing = (await db.execute(
                    select(Submission).where(
                        Submission.assignment_id == a.id,
                        Submission.student_id == enr.student_id,
                        Submission.status != SubmissionStatus.REJECTED,
                    )
                )).scalar_one_or_none()
                if existing:
                    continue

                student = await db.get(User, enr.student_id)
                if not student:
                    continue

                await notif_svc.create_notification(
                    db, student.id, NotificationType.DEADLINE_REMINDER,
                    "Deadline Reminder",
                    f"'{a.title}' deadline is in 24 hours.",
                    reference_id=a.id, reference_type="assignment",
                )
                await send_deadline_reminder_email(
                    student.email, student.name, a.title,
                    a.deadline.strftime("%Y-%m-%d %H:%M UTC"),
                )

        await db.commit()
