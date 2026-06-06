from app.config import get_settings

settings = get_settings()


async def send_email(to: str, subject: str, html: str) -> None:
    """Send email via Resend. Prints to console when key is not configured (dev)."""
    if not settings.RESEND_API_KEY:
        print(f"[Email DEV] To: {to} | Subject: {subject}")
        return
    try:
        import resend as _resend_module
        _resend_module.api_key = settings.RESEND_API_KEY
        _resend_module.Emails.send({"from": settings.FROM_EMAIL, "to": to, "subject": subject, "html": html})
    except Exception as e:
        print(f"[Email Error] Failed to send to {to}: {e}")


async def send_welcome_email(to: str, name: str, email: str, password: str) -> None:
    html = f"""
    <h2>Welcome to AI Academic Platform</h2>
    <p>Hello {name},</p>
    <p>Your account has been created. Here are your login credentials:</p>
    <ul>
      <li><strong>Email:</strong> {email}</li>
      <li><strong>Password:</strong> {password}</li>
    </ul>
    <p>Please log in and change your password immediately.</p>
    """
    await send_email(to, "Welcome to AI Academic Platform", html)


async def send_assignment_posted_email(
    to: str, student_name: str, assignment_title: str, deadline: str, subject: str
) -> None:
    html = f"""
    <h2>New Assignment Posted</h2>
    <p>Hello {student_name},</p>
    <p>A new assignment has been posted in <strong>{subject}</strong>:</p>
    <p><strong>{assignment_title}</strong></p>
    <p>Submission deadline: <strong>{deadline}</strong></p>
    <p>Please log in to view and submit your assignment.</p>
    """
    await send_email(to, f"New Assignment: {assignment_title}", html)


async def send_submission_receipt_email(
    to: str, student_name: str, assignment_title: str, submitted_at: str
) -> None:
    html = f"""
    <h2>Submission Received</h2>
    <p>Hello {student_name},</p>
    <p>Your submission for <strong>{assignment_title}</strong> has been received.</p>
    <p>Submitted at: {submitted_at}</p>
    <p>You will be notified once your assignment is evaluated.</p>
    """
    await send_email(to, f"Submission Received: {assignment_title}", html)


async def send_deadline_reminder_email(
    to: str, student_name: str, assignment_title: str, deadline: str
) -> None:
    html = f"""
    <h2>Assignment Deadline Reminder</h2>
    <p>Hello {student_name},</p>
    <p>This is a reminder that the deadline for <strong>{assignment_title}</strong> is in 24 hours.</p>
    <p>Deadline: <strong>{deadline}</strong></p>
    <p>Please submit your assignment before the deadline.</p>
    """
    await send_email(to, f"Deadline Reminder: {assignment_title}", html)


async def send_marks_published_email(
    to: str, student_name: str, assignment_title: str, score: int, max_marks: int
) -> None:
    html = f"""
    <h2>Marks Published</h2>
    <p>Hello {student_name},</p>
    <p>Your marks for <strong>{assignment_title}</strong> have been published.</p>
    <p>Score: <strong>{score}/{max_marks}</strong></p>
    <p>Log in to view detailed feedback.</p>
    """
    await send_email(to, f"Marks Published: {assignment_title}", html)


async def send_submission_rejected_email(
    to: str, student_name: str, assignment_title: str, reason: str
) -> None:
    html = f"""
    <h2>Submission Rejected</h2>
    <p>Hello {student_name},</p>
    <p>Your submission for <strong>{assignment_title}</strong> has been rejected.</p>
    <p><strong>Reason:</strong> {reason}</p>
    """
    await send_email(to, f"Submission Rejected: {assignment_title}", html)


async def send_resubmission_request_email(
    to: str,
    student_name: str,
    assignment_title: str,
    reason: str,
    similarity_score: float,
    resubmission_deadline: str,
) -> None:
    html = f"""
    <h2>Resubmission Required</h2>
    <p>Hello {student_name},</p>
    <p>Your submission for <strong>{assignment_title}</strong> requires resubmission.</p>
    <p><strong>Reason:</strong> {reason}</p>
    <p><strong>Similarity Score:</strong> {similarity_score:.1%}</p>
    <p><strong>Resubmission Deadline:</strong> {resubmission_deadline}</p>
    <p>You have one final attempt to resubmit.</p>
    """
    await send_email(to, f"Resubmission Required: {assignment_title}", html)


async def send_report_email(
    to: str, name: str, assignment_title: str, role: str = "professor"
) -> None:
    html = f"""
    <h2>Marks Report Generated</h2>
    <p>Hello {name},</p>
    <p>The marks report for <strong>{assignment_title}</strong> has been generated.</p>
    <p>Please log in to view and download the report.</p>
    """
    await send_email(to, f"Marks Report: {assignment_title}", html)


async def send_deadline_reached_email(
    to: str, professor_name: str, assignment_title: str
) -> None:
    html = f"""
    <h2>Assignment Deadline Reached</h2>
    <p>Hello {professor_name},</p>
    <p>The deadline for <strong>{assignment_title}</strong> has passed.</p>
    <p>AI evaluation is now in progress for pending submissions.</p>
    """
    await send_email(to, f"Deadline Reached: {assignment_title}", html)


async def send_evaluation_complete_email(
    to: str, professor_name: str, assignment_title: str
) -> None:
    html = f"""
    <h2>Evaluation Complete</h2>
    <p>Hello {professor_name},</p>
    <p>All submissions for <strong>{assignment_title}</strong> have been evaluated.</p>
    <p>Please log in to review marks and publish results.</p>
    """
    await send_email(to, f"Evaluation Complete: {assignment_title}", html)
