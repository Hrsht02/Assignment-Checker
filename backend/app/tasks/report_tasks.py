"""
Celery tasks for report generation.
"""
import asyncio
import uuid
import io
import csv

from app.tasks.celery_app import celery_app


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="generate_marks_report")
def generate_marks_report_task(assignment_id: str):
    _run_async(_generate_marks_report_async(assignment_id))


async def _generate_marks_report_async(assignment_id: str):
    from app.database import AsyncSessionLocal
    from app.models.assignment import Assignment
    from app.models.submission import Submission, SubmissionStatus
    from app.models.evaluation import EvaluationReport
    from app.models.marks import MarksOverride
    from app.models.academic import SectionEnrollment
    from app.models.user import User
    from app.models.report import MarksReport
    from app.models.notification import NotificationType
    from app.services import notification as notif_svc
    from app.services.email import send_report_email
    from app.services.storage import upload_bytes
    from sqlalchemy import select
    import openpyxl
    from reportlab.lib.pagesizes import letter, landscape
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Assignment).where(Assignment.id == uuid.UUID(assignment_id))
        )
        assignment = result.scalar_one_or_none()
        if not assignment:
            return

        # Get all enrolled students
        enrolled_result = await db.execute(
            select(SectionEnrollment).where(
                SectionEnrollment.section_id == assignment.section_id
            )
        )
        enrollments = enrolled_result.scalars().all()

        # Build report rows
        rows = []
        for enrollment in enrollments:
            student_result = await db.execute(
                select(User).where(User.id == enrollment.student_id)
            )
            student = student_result.scalar_one_or_none()
            if not student:
                continue

            # Get submission
            sub_result = await db.execute(
                select(Submission).where(
                    Submission.assignment_id == assignment.id,
                    Submission.student_id == student.id,
                    Submission.status != SubmissionStatus.REJECTED,
                ).order_by(Submission.submitted_at.desc())
            )
            submission = sub_result.scalar_one_or_none()

            if not submission:
                rows.append({
                    "name": student.name,
                    "roll_number": student.roll_number or "N/A",
                    "email": student.email,
                    "marks": "Not Submitted",
                    "submission_time": "N/A",
                    "status": "Not Submitted",
                })
                continue

            # Get final score
            override_result = await db.execute(
                select(MarksOverride).where(
                    MarksOverride.submission_id == submission.id
                )
            )
            override = override_result.scalar_one_or_none()

            eval_result = await db.execute(
                select(EvaluationReport).where(
                    EvaluationReport.submission_id == submission.id
                )
            )
            eval_report = eval_result.scalar_one_or_none()

            if override:
                marks = str(override.revised_score)
            elif eval_report:
                marks = str(eval_report.ai_score)
            else:
                marks = "Pending"

            rows.append({
                "name": student.name,
                "roll_number": student.roll_number or "N/A",
                "email": student.email,
                "marks": marks,
                "submission_time": submission.submitted_at.strftime("%Y-%m-%d %H:%M UTC"),
                "status": submission.status.value,
            })

        # ── Generate CSV ───────────────────────────────────────────────────
        csv_buffer = io.StringIO()
        writer = csv.DictWriter(
            csv_buffer,
            fieldnames=["name", "roll_number", "email", "marks", "submission_time", "status"]
        )
        writer.writeheader()
        writer.writerows(rows)
        csv_bytes = csv_buffer.getvalue().encode("utf-8")

        # ── Generate Excel ─────────────────────────────────────────────────
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Marks Report"
        headers = ["Student Name", "Roll Number", "Email", "Marks", "Submission Time", "Status"]
        ws.append(headers)
        for row in rows:
            ws.append([
                row["name"], row["roll_number"], row["email"],
                row["marks"], row["submission_time"], row["status"]
            ])
        excel_buffer = io.BytesIO()
        wb.save(excel_buffer)
        excel_bytes = excel_buffer.getvalue()

        # ── Generate PDF ───────────────────────────────────────────────────
        pdf_buffer = io.BytesIO()
        doc = SimpleDocTemplate(pdf_buffer, pagesize=landscape(letter))
        styles = getSampleStyleSheet()
        elements = []
        elements.append(Paragraph(
            f"Marks Report: {assignment.title}", styles["Title"]
        ))

        table_data = [headers] + [
            [r["name"], r["roll_number"], r["email"],
             r["marks"], r["submission_time"], r["status"]]
            for r in rows
        ]
        table = Table(table_data, repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 12),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
            ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
            ("GRID", (0, 0), (-1, -1), 1, colors.black),
        ]))
        elements.append(table)
        doc.build(elements)
        pdf_bytes = pdf_buffer.getvalue()

        # ── Upload to R2 ───────────────────────────────────────────────────
        base_key = f"reports/{assignment_id}"
        max_retries = 3
        pdf_key = pdf_url = excel_key = excel_url = csv_key = csv_url = None

        for attempt in range(max_retries):
            try:
                pdf_key, pdf_url = await upload_bytes(
                    pdf_bytes, f"{base_key}/report.pdf", "application/pdf"
                )
                excel_key, excel_url = await upload_bytes(
                    excel_bytes, f"{base_key}/report.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                )
                csv_key, csv_url = await upload_bytes(
                    csv_bytes, f"{base_key}/report.csv", "text/csv"
                )
                break
            except RuntimeError:
                if attempt == max_retries - 1:
                    return  # All retries exhausted — don't mark report as available

        # Save report record
        # Check if a report already exists for this assignment
        existing_report_result = await db.execute(
            select(MarksReport).where(MarksReport.assignment_id == assignment.id)
        )
        existing_report = existing_report_result.scalar_one_or_none()

        if existing_report:
            existing_report.pdf_url = pdf_url
            existing_report.excel_url = excel_url
            existing_report.csv_url = csv_url
            existing_report.pdf_key = pdf_key
            existing_report.excel_key = excel_key
            existing_report.csv_key = csv_key
        else:
            marks_report = MarksReport(
                assignment_id=assignment.id,
                pdf_url=pdf_url,
                excel_url=excel_url,
                csv_url=csv_url,
                pdf_key=pdf_key,
                excel_key=excel_key,
                csv_key=csv_key,
            )
            db.add(marks_report)

        await db.commit()

        # Notify professor and admin
        from app.models.user import User, UserRole
        prof_result = await db.execute(
            select(User).where(User.id == assignment.created_by)
        )
        professor = prof_result.scalar_one_or_none()

        if professor:
            await notif_svc.create_notification(
                db, professor.id,
                NotificationType.REPORT_GENERATED,
                "Marks Report Ready",
                f"The marks report for '{assignment.title}' is now available.",
                reference_id=assignment.id, reference_type="assignment"
            )
            await send_report_email(professor.email, professor.name, assignment.title)

        # Notify all admins
        admin_result = await db.execute(
            select(User).where(User.role == UserRole.ADMIN, User.status == "active")
        )
        admins = admin_result.scalars().all()
        for admin in admins:
            await notif_svc.create_notification(
                db, admin.id,
                NotificationType.REPORT_GENERATED,
                "Marks Report Ready",
                f"The marks report for '{assignment.title}' has been generated.",
                reference_id=assignment.id, reference_type="assignment"
            )

        await db.commit()
