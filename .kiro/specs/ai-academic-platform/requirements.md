# Requirements Document

## Introduction

This document defines the requirements for an AI-Powered Assignment Evaluation and Academic Management Platform. The platform automates assignment distribution, submission, AI-driven evaluation, plagiarism detection, grading, and result management for educational institutions. It serves three user roles — Admin, Professor, and Student — and is designed to handle an initial scale of 500–1000 students. The system integrates Gemini 2.5 Flash for AI grading, Sentence Transformers with FAISS for similarity detection, PyMuPDF/PaddleOCR for PDF processing, LangGraph for workflow orchestration, PostgreSQL for persistence, Cloudflare R2 for file storage, and Resend for email delivery.

---

## Glossary

- **Platform**: The AI-Powered Assignment Evaluation and Academic Management Platform described in this document.
- **Admin**: An institutional administrator with full access to user management, academic structure, and reporting.
- **Professor**: A faculty member assigned to one or more semesters and subjects by an Admin.
- **Student**: An enrolled learner assigned to a semester and course.
- **Semester**: A time-bounded academic period created and managed by the Admin.
- **Section**: A subdivision of a Semester grouping students under a shared subject or course.
- **Assignment**: An academic task created by a Professor, consisting of a title, description, question paper (PDF or typed), maximum marks, submission deadline, and evaluation rubric.
- **Submission**: A PDF document uploaded by a Student in response to an Assignment before the deadline.
- **Rubric**: A set of criteria and mark distributions defined by a Professor to guide AI and manual evaluation.
- **AI_Evaluator**: The AI evaluation engine powered by Gemini 2.5 Flash that extracts, analyzes, and scores student submissions.
- **Similarity_Detector**: The plagiarism and similarity detection component using Sentence Transformers and FAISS.
- **Evaluation_Report**: The AI-generated report containing strengths, areas of improvement, final score, and feedback for a Submission.
- **Marks_Report**: A structured report listing student names, roll numbers, emails, marks, submission time, and submission status for an Assignment.
- **Notification_Service**: The system component responsible for sending email and in-platform notifications via Resend.
- **Workflow_Orchestrator**: The LangGraph-based component managing the multi-step AI evaluation pipeline.
- **PDF_Processor**: The component using PyMuPDF and PaddleOCR to extract text content from uploaded PDFs.
- **Storage_Service**: The Cloudflare R2-backed component that stores uploaded PDFs and generated reports.
- **Resubmission**: A second and final Submission attempt granted to a Student after an Assignment rejection or plagiarism flag.
- **Similarity_Score**: A numeric value (0–100%) representing the semantic similarity between two Submissions computed by the Similarity_Detector.
- **Similarity_Threshold**: The Similarity_Score above which a Submission is flagged for Professor review (default: 95%).

---

## Requirements

### Requirement 1: User Account Management

**User Story:** As an Admin, I want to create and manage Professor and Student accounts, so that only authorized users can access the Platform.

#### Acceptance Criteria

1. WHEN an Admin submits a new Professor account form with a valid name (1–100 characters), a valid email address, and the Professor role, THE Platform SHALL create the account and set its status to active.
2. WHEN an Admin submits a new Student account form with a valid name (1–100 characters), a valid roll number (alphanumeric, 3–20 characters), a valid email address, and a Semester enrollment, THE Platform SHALL create the account and set its status to active.
3. WHEN a Professor or Student account is created by the Admin, THE Notification_Service SHALL send a welcome email containing the account's login credentials to the account holder's registered email address within 60 seconds.
4. WHEN an Admin submits a create-account form with a missing required field or an email address that does not match a valid email format, THE Platform SHALL return a validation error identifying each invalid field and SHALL NOT create the account.
5. WHEN an Admin attempts to create an account using an email address already registered on the Platform, THE Platform SHALL return a duplicate-email error and SHALL NOT create the account.
6. WHEN an Admin approves a pending self-registration request, THE Platform SHALL activate the account and grant role-appropriate access within 10 seconds.
7. WHEN an Admin rejects a pending self-registration request, THE Notification_Service SHALL send an email to the applicant containing the Admin-provided rejection reason within 60 seconds.
8. WHEN an Admin updates the role or permissions of an existing account, THE Platform SHALL apply the new role and permissions and terminate all active sessions for that account within 60 seconds.
9. WHEN an Admin deactivates an account, THE Platform SHALL set its status to inactive and revoke all active sessions for that account within 60 seconds.
10. WHEN an Admin reactivates a previously deactivated account, THE Platform SHALL set its status to active and restore role-appropriate access within 10 seconds.

---

### Requirement 2: Academic Structure Management

**User Story:** As an Admin, I want to create and manage semesters, sections, and enrollments, so that the academic structure reflects the institution's organization.

#### Acceptance Criteria

1. THE Admin SHALL create a Semester by specifying a unique name (1–100 characters), a start date, and an end date.
2. IF an Admin attempts to create a Semester with a start date equal to or later than its end date, THEN THE Platform SHALL return a validation error identifying the date conflict and SHALL NOT create the Semester.
3. THE Admin SHALL create one or more Sections within a Semester by specifying a section name (1–100 characters) and an associated subject name (1–100 characters).
4. THE Admin SHALL assign one or more Professors to a Section; each assignment SHALL associate the Professor with the subject taught in that Section.
5. THE Admin SHALL enroll one or more Students into a Section by selecting from the list of existing Student accounts.
6. WHEN a Student is enrolled in a Section, THE Platform SHALL make all currently active Assignments in that Section immediately visible to the Student.
7. WHEN an Admin removes a Student from a Section, THE Platform SHALL revoke the Student's visibility of all Assignments in that Section within 10 seconds.
8. WHEN an Admin removes a Professor from a Section, THE Platform SHALL revoke the Professor's access to manage or view Assignments in that Section within 10 seconds.
9. IF an Admin attempts to create a Semester using a name that already exists on the Platform, THEN THE Platform SHALL return a duplicate-name validation error and SHALL NOT create the Semester.

---

### Requirement 3: Admin Dashboard and Monitoring

**User Story:** As an Admin, I want a centralized dashboard with institution-wide statistics, so that I can monitor academic activity across all semesters.

#### Acceptance Criteria

1. THE Admin SHALL view the total count of active Students, active Professors, Assignments, and Submissions on the dashboard, updated within 60 seconds of any change to those counts.
2. THE Admin SHALL view the count of Pending Evaluations and the institution-wide average performance score on the dashboard; the average performance score SHALL be computed as the mean of each evaluated Submission's percentage of its Assignment's maximum marks, expressed as a value between 0 and 100.
3. THE Admin SHALL view all Assignments across all Semesters, filterable by Semester, Professor, and submission status.
4. THE Admin SHALL view submission statistics per Assignment, including the count of Submissions with status "Submitted", "Pending Evaluation", and "Evaluated".
5. THE Admin SHALL access Semester-wise performance reports; each report SHALL show, per Section, the submission rate (count of Submissions received divided by count of Students enrolled, expressed as a percentage) and the average marks (mean percentage of maximum marks across all evaluated Submissions in that Section).
6. THE Admin SHALL download any report displayed on the dashboard in PDF, Excel, or CSV format.
7. WHEN a Marks_Report is generated for any Assignment, THE Platform SHALL make the report accessible in the Admin's dashboard and SHALL email it to the Admin's registered email address within 5 minutes.
8. THE Admin SHALL view Professor activity metrics including the total count of Assignments created, total count of evaluations completed, and average evaluation turnaround time per Professor; evaluation turnaround time SHALL be defined as the elapsed time in hours from Submission receipt to Evaluation_Report generation.
9. THE Admin SHALL view per-Student performance trends including the Student's marks expressed as a percentage of maximum marks for each evaluated Assignment over time, and the Student's submission rate defined as the count of Assignments submitted divided by the count of Assignments assigned to that Student.

---

### Requirement 4: Professor Dashboard and Subject Visibility

**User Story:** As a Professor, I want my dashboard to show only my assigned semesters and subjects, so that I have a focused view of my responsibilities.

#### Acceptance Criteria

1. WHILE a Professor is authenticated, THE Platform SHALL display only the Sections and Semesters explicitly assigned to that Professor by the Admin; Sections and Semesters not assigned to the Professor SHALL NOT appear in any dashboard view.
2. WHEN a Professor selects an assigned Section, THE Platform SHALL display the following analytics for that Section: total count of Assignments, total count of enrolled Students, average marks expressed as a percentage (0–100) of maximum marks across all evaluated Submissions, submission rate expressed as a percentage (0–100) of enrolled Students who have submitted at least one Submission, plagiarism rate expressed as a percentage (0–100) of Submissions that were flagged for similarity review, and count of Pending Evaluations.
3. IF a Professor has no Assignments in an assigned Section, THEN THE Platform SHALL display a zero-state indicator for all analytics fields rather than an error.
4. IF a Professor attempts to access a Section not assigned to them, THEN THE Platform SHALL deny access and display an error message indicating the Section is not accessible, without disclosing any data about the Section.

---

### Requirement 5: Assignment Creation and Management

**User Story:** As a Professor, I want to create, edit, and delete assignments for my assigned subjects, so that students receive structured academic tasks.

#### Acceptance Criteria

1. THE Professor SHALL create an Assignment within an assigned Section by providing a title (1–200 characters), a description (1–2000 characters), a maximum marks value (a positive integer between 1 and 1000), a submission deadline (a future date-time), and an evaluation Rubric.
2. WHEN creating an Assignment, THE Professor SHALL attach a question paper either as a single uploaded PDF (maximum 20 MB) or as typed text content (1–10,000 characters); at least one of these two options SHALL be provided.
3. IF a Professor attempts to set an Assignment deadline to a date and time that is not in the future at the time of submission, THEN THE Platform SHALL return a validation error and SHALL NOT create or update the Assignment.
4. THE Professor SHALL edit an existing Assignment's description, deadline, Rubric, or marks distribution only if no Submissions have been received for that Assignment; if Submissions exist, the Professor SHALL only extend the deadline or update the Rubric.
5. WHEN a Professor updates an Assignment's deadline, THE Notification_Service SHALL notify all enrolled Students in that Section of the new deadline via email and in-platform notification within 5 minutes.
6. WHEN a Professor deletes an Assignment that has no Submissions, THE Platform SHALL remove the Assignment and notify all enrolled Students via email within 5 minutes.
7. WHEN a Professor requests to delete an Assignment that has one or more existing Submissions, THE Platform SHALL require explicit confirmation from the Professor before deletion, then remove the Assignment and all associated Submissions, and notify all enrolled Students via email within 5 minutes.
8. WHEN an Assignment is created, THE Platform SHALL make it visible exclusively to Students currently enrolled in the Section to which the Assignment belongs.
9. WHEN an Assignment deadline expires, THE Workflow_Orchestrator SHALL automatically trigger the AI evaluation pipeline for all Submissions with status "Submitted" that have not yet entered the evaluation pipeline.

---

### Requirement 6: Student Assignment Submission

**User Story:** As a Student, I want to view and submit assignments for my enrolled section, so that I can complete my academic work on time.

#### Acceptance Criteria

1. WHILE a Student is authenticated, THE Platform SHALL display all Assignments belonging to the Student's enrolled Section(s) categorized as: Active (deadline has not passed and Student has not submitted), Upcoming (deadline is more than 24 hours away and Student has not submitted), Submitted (Student has submitted and evaluation is not yet complete), and Evaluated (Evaluation_Report has been finalized for the Student's Submission).
2. WHEN a Student selects an Assignment, THE Platform SHALL display the Assignment's title, description, attached question PDF (if any), submission deadline, and maximum marks.
3. WHEN a Student submits a response, THE Platform SHALL accept only a single file with a PDF MIME type and a file size not exceeding 20 MB; any other file type or file exceeding the size limit SHALL be rejected with a validation error identifying the reason.
4. IF a Student attempts to submit after the Assignment deadline has passed, THEN THE Platform SHALL reject the upload and return an error message indicating the deadline has passed.
5. WHEN a valid Submission is received, THE Platform SHALL record the UTC timestamp of receipt, associate the Submission with the Student and the Assignment, and set the submission status to "Submitted" within 5 seconds.
6. WHEN a Submission is successfully stored, THE Notification_Service SHALL send a submission receipt to the Student's registered email address within 60 seconds.
7. WHEN a Student who has already submitted uploads a new PDF for the same Assignment before the deadline, THE Platform SHALL replace the prior Submission with the new file, update the submission timestamp, and set the status back to "Submitted".
8. WHEN a valid Submission PDF is received, THE Storage_Service SHALL persist the file to Cloudflare R2 and return a stable retrieval URL; the Submission record SHALL NOT be created in the database until the Storage_Service confirms successful storage.
9. IF the Storage_Service fails to store an uploaded Submission PDF, THEN THE Platform SHALL return a storage-failure error to the Student, SHALL NOT create a Submission record, and SHALL NOT change the Student's submission status.

---

### Requirement 7: AI Evaluation Engine

**User Story:** As a Professor, I want submitted assignments to be automatically evaluated by the AI Evaluator, so that grading is consistent and turnaround time is reduced.

#### Acceptance Criteria

1. WHEN a Submission's status is set to "Submitted" and it has passed the similarity check without being flagged or rejected, THE Workflow_Orchestrator SHALL enqueue the Submission for AI evaluation within 30 seconds.
2. WHEN the Workflow_Orchestrator begins processing a Submission, THE PDF_Processor SHALL extract all selectable text from the PDF using PyMuPDF; for each page that yields zero selectable characters, THE PDF_Processor SHALL apply PaddleOCR to extract text from that page.
3. WHEN text extraction is complete for a Submission, THE AI_Evaluator SHALL analyze the extracted text against the Assignment description and Rubric using Gemini 2.5 Flash and generate an Evaluation_Report.
4. THE Evaluation_Report SHALL contain at least one identified strength, at least one identified area of improvement, and a final numeric score that is a non-negative integer not exceeding the Assignment's maximum marks.
5. WHEN an Evaluation_Report is generated, THE Platform SHALL store the report, associate it with the Submission, and update the Submission status to "Evaluated" within 10 seconds of report generation.
6. IF the PDF_Processor extracts zero characters from a Submission after applying both PyMuPDF and PaddleOCR to all pages, THEN THE Workflow_Orchestrator SHALL set the Submission status to "Extraction Failed" and send an in-platform notification to the Professor identifying the affected Submission.
7. IF the AI_Evaluator returns an error response for a Submission, THEN THE Workflow_Orchestrator SHALL set the Submission status to "Evaluation Failed" and send an in-platform notification to the Professor identifying the affected Submission.

---

### Requirement 8: Plagiarism and Similarity Detection

**User Story:** As a Professor, I want the system to detect plagiarism among submissions so that academic integrity is maintained without incorrectly penalizing students.

#### Acceptance Criteria

1. WHEN a Submission is received and stored, THE Similarity_Detector SHALL compute a Similarity_Score between the new Submission and each previously accepted Submission for the same Assignment before the Submission enters the AI evaluation pipeline.
2. THE Similarity_Detector SHALL use Sentence Transformers to generate semantic embeddings of each Submission's extracted text and FAISS for approximate nearest-neighbor search to identify the highest Similarity_Score against prior Submissions.
3. IF the Similarity_Detector identifies that the new Submission is a byte-for-byte duplicate of a previously accepted Submission, THEN THE Platform SHALL immediately set the new Submission's status to "Rejected", and THE Notification_Service SHALL notify the Student that the Submission was rejected because it is an exact duplicate of a prior Submission.
4. WHEN a Submission's highest Similarity_Score against any prior accepted Submission exceeds the Similarity_Threshold, THE Platform SHALL set the Submission status to "Similarity Review" and SHALL NOT forward the Submission to the AI evaluation pipeline until a Professor decision is recorded.
5. WHEN a Submission's status is set to "Similarity Review", THE Notification_Service SHALL notify the Professor via email and in-platform notification within 5 minutes, including the Similarity_Score and a reference to the matched prior Submission.
6. WHEN a Professor accepts a flagged Submission, THE Platform SHALL set the Submission status to "Submitted" and enqueue it for the AI evaluation pipeline.
7. WHEN a Professor rejects a flagged Submission, THE Platform SHALL set the Submission status to "Rejected", and THE Notification_Service SHALL send the Student an email notification containing the rejection reason, the Similarity_Score, and a Resubmission deadline set by the Professor at the time of rejection (between 1 and 7 days from the rejection date).
8. WHEN a Student submits a Resubmission within the Resubmission deadline, THE Similarity_Detector SHALL evaluate it against all accepted Submissions and apply the same flagging and rejection rules.
9. IF a Student attempts to upload a Resubmission after the Resubmission deadline has passed, THEN THE Platform SHALL reject the upload and display an error message indicating the Resubmission deadline has expired.
10. IF a Student whose Resubmission was accepted or evaluated attempts to upload any further Submission for the same Assignment, THEN THE Platform SHALL reject the upload and display an error message indicating no further Submissions are permitted.
11. THE Platform SHALL allow the Admin to configure the Similarity_Threshold value at the institutional level; the configured value SHALL apply to all subsequent similarity checks across all Assignments.

---

### Requirement 9: Marks Management and Override

**User Story:** As a Professor, I want to review AI-generated marks and adjust them with remarks, so that final grades reflect my professional judgment.

#### Acceptance Criteria

1. THE Professor SHALL view the Evaluation_Report and the AI-generated score for each Submission in their assigned Sections.
2. THE Professor SHALL accept the AI-generated score for a Submission without modification, recording acceptance as the finalized score.
3. WHEN a Professor modifies the score for a Submission, THE Platform SHALL enforce that the revised score is a non-negative integer not exceeding the Assignment's maximum marks.
4. WHEN a Professor modifies a score, THE Platform SHALL require the Professor to provide a remark of 1–500 non-whitespace characters before the modification is saved.
5. WHEN a Professor modifies a score, THE Platform SHALL record the original AI-generated score, the revised score, the remark, and the UTC timestamp of the modification, and SHALL retain this audit record permanently.
6. THE Professor SHALL trigger a re-evaluation of a Submission by the AI_Evaluator.
7. WHEN a re-evaluation is triggered, THE Workflow_Orchestrator SHALL re-run the full AI evaluation pipeline for the Submission, update the Evaluation_Report with the new output, and clear any previously recorded Professor override (revised score and remark) so the Professor must review the new AI output.

---

### Requirement 10: Report Generation and Distribution

**User Story:** As a Professor, I want marks reports generated automatically when the deadline expires, so that I can review and distribute results without manual compilation.

#### Acceptance Criteria

1. WHEN an Assignment deadline expires, THE Platform SHALL automatically generate a Marks_Report for that Assignment within 10 minutes of deadline expiry.
2. THE Marks_Report SHALL include one row per enrolled Student containing: student name, roll number, email, obtained marks (the finalized score if evaluated, or "Pending" if not yet evaluated, or "Not Submitted" if no Submission was received), submission timestamp (or "N/A" if not submitted), and submission status.
3. THE Marks_Report SHALL be exportable by the Professor in PDF, Excel, and CSV formats.
4. WHEN a Marks_Report is generated, THE Notification_Service SHALL email the report as an attachment to the Professor's registered email address within 5 minutes of report generation.
5. WHEN a Marks_Report is generated, THE Platform SHALL make the report accessible in the Admin's dashboard and email it to the Admin's registered email address within 5 minutes of report generation.
6. THE Professor SHALL manually trigger Marks_Report generation for an Assignment at any time; if a Marks_Report already exists for that Assignment, the manual trigger SHALL regenerate it with the latest data and replace the prior version.

---

### Requirement 11: Student Results and Feedback

**User Story:** As a Student, I want to view my evaluation results and AI feedback after grading, so that I understand my performance and how to improve.

#### Acceptance Criteria

1. WHEN a Professor accepts or modifies the AI-generated score for a Student's Submission, THE Platform SHALL update the Student's Results section to display the finalized score, the strengths and areas of improvement from the Evaluation_Report, and any Professor remarks within 30 seconds.
2. WHILE a Student is authenticated, THE Platform SHALL display the current submission status for each assigned Assignment; the status SHALL be one of: Active, Upcoming, Submitted, Pending Evaluation, Evaluated, Similarity Review, Rejected, Resubmission Requested, Extraction Failed, or Evaluation Failed.
3. WHEN a Professor finalizes the score for a Student's Submission, THE Notification_Service SHALL send the Student an in-platform notification and an email containing the finalized score within 5 minutes.
4. IF a Student's Submission has been processed by the AI_Evaluator but the Professor has not yet finalized the score, THEN THE Platform SHALL display the status as "Pending Evaluation" in the Student's Results section.

---

### Requirement 12: Notification System

**User Story:** As a user of the Platform, I want to receive timely notifications for all relevant academic events, so that I stay informed without manually checking the system.

#### Acceptance Criteria

1. WHEN a new Assignment is posted in a Section, THE Notification_Service SHALL send an in-platform and email notification to all Students enrolled in that Section within 5 minutes of Assignment creation.
2. WHEN a Professor accepts a Student's flagged Submission after similarity review, THE Notification_Service SHALL send the Student an in-platform and email notification confirming that the Submission has been accepted.
3. WHEN an Assignment deadline is exactly 24 hours away and a Student enrolled in that Section has not yet submitted, THE Notification_Service SHALL send that Student a deadline reminder via email.
4. WHEN a Professor finalizes the score for a Submission, THE Notification_Service SHALL send the Student an in-platform and email notification containing the finalized score within 5 minutes.
5. WHEN a Student's Submission is rejected, THE Notification_Service SHALL send the Student an email notification containing the specific rejection reason within 5 minutes.
6. WHEN a Resubmission is requested for a Student, THE Notification_Service SHALL send the Student an email notification containing the rejection reason, the Similarity_Score, and the Resubmission deadline within 5 minutes.
7. WHEN an Assignment deadline is reached and there are Submissions in a pending evaluation state, THE Notification_Service SHALL notify the assigned Professor via email and in-platform notification that the deadline has passed and evaluation is in progress.
8. WHEN all Submissions for an Assignment have reached a terminal status (Evaluated, Extraction Failed, or Evaluation Failed), THE Notification_Service SHALL notify the Professor via email and in-platform notification that evaluation is complete for that Assignment.
9. WHEN a Marks_Report is generated, THE Notification_Service SHALL send the Professor an email and in-platform notification, and SHALL send the Admin an in-platform notification, all within 5 minutes of report generation.

---

### Requirement 13: Submission and Assignment Filtering

**User Story:** As a Professor, I want to filter and search through submissions efficiently, so that I can manage large cohorts without losing track of individual students.

#### Acceptance Criteria

1. WHEN a Professor applies one or more filters to the Submissions list for an Assignment, THE Platform SHALL return only Submissions that satisfy all selected filter criteria simultaneously; supported filters are: student name (partial, case-insensitive text match), roll number (exact match), submission status (exact match from defined status values), and marks range (a lower bound and upper bound each between 0 and the Assignment's maximum marks inclusive); if no Submissions match the applied filters, THE Platform SHALL display a no-results indicator.
2. THE Professor SHALL download any individual Submission PDF from the Submissions list; THE Platform SHALL initiate the file download within 5 seconds of the Professor's request.
3. IF a download request fails (Storage_Service error or network failure), THEN THE Platform SHALL display an error message to the Professor and SHALL NOT silently fail.
4. WHEN a Professor expands a Submission row in the Submissions list, THE Platform SHALL display the Evaluation_Report for that Submission on the current page without navigating away; IF the Evaluation_Report has not yet been generated, THE Platform SHALL display a "Evaluation Pending" indicator in place of the report.
5. WHEN a Professor views the plagiarism report for a Submission that has a Similarity_Score above zero, THE Platform SHALL display the Similarity_Score and a reference to the matched prior Submission; IF the Submission's Similarity_Score is below the Similarity_Threshold and no match was recorded, THE Platform SHALL display "No similarity match found".

---

### Requirement 14: Platform Security and Authorization

**User Story:** As an institution, I want all platform access to be role-restricted, so that users can only perform actions appropriate to their role.

#### Acceptance Criteria

1. THE Platform SHALL enforce role-based access control such that: Admin users can access user management, academic structure, institution-wide reports, and all analytics; Professor users can access only their assigned Sections, Assignments in those Sections, Submissions to those Assignments, and their own analytics; Student users can access only Assignments in their enrolled Sections, their own Submissions, and their own results.
2. WHEN an unauthenticated request is made to any protected resource, THE Platform SHALL reject the request and return an error response indicating authentication is required, without disclosing any resource data.
3. WHEN an authenticated user requests a resource outside their permitted scope, THE Platform SHALL reject the request and return an error response indicating access is not permitted, without disclosing any data about the requested resource.
4. THE Platform SHALL store user passwords such that plaintext passwords are never persisted in the database or transmitted in any internal or external communication.
5. THE Platform SHALL transmit all data between client and server exclusively over HTTPS; any HTTP request SHALL be redirected to HTTPS.
6. WHEN a user's session token expires, THE Platform SHALL reject subsequent requests using that token and require the user to re-authenticate; session tokens SHALL have a maximum lifetime of 24 hours from issuance.
7. WHEN an authenticated user requests data belonging to another user of the same role (e.g., a Student accessing another Student's Submission), THE Platform SHALL reject the request and return an error response indicating access is not permitted.

---

### Requirement 15: File Storage and Integrity

**User Story:** As the Platform, I want all uploaded and generated files to be stored reliably and retrievably, so that submissions and reports are never lost.

#### Acceptance Criteria

1. WHEN a Submission PDF is uploaded, THE Storage_Service SHALL store the file in Cloudflare R2 and return a retrieval URL that does not change after issuance within 5 seconds of receiving the file.
2. WHEN a Marks_Report or Evaluation_Report is generated, THE Storage_Service SHALL persist the file to Cloudflare R2 and return a stable retrieval URL to the calling service confirming successful storage.
3. IF the Storage_Service fails to store an uploaded Submission PDF, THEN THE Platform SHALL return an error to the Student indicating that storage failed, and SHALL NOT create a Submission record in the database.
4. IF the Storage_Service fails to store a generated Marks_Report or Evaluation_Report, THEN THE Platform SHALL log the failure, retry storage up to 3 times, and if all retries fail, SHALL NOT mark the report as available or send report-ready notifications.
5. IF an authenticated user requests a file retrieval URL for a Submission or report they are not authorized to access, THEN THE Platform SHALL deny the request and return an error response indicating access is not permitted, without returning or exposing the file URL.

---

### Requirement 16: Performance and Scalability

**User Story:** As an institution, I want the Platform to remain responsive under load for up to 1000 concurrent students, so that academic operations are not disrupted during peak periods.

#### Acceptance Criteria

1. WHILE the Platform is serving up to 1000 concurrent authenticated users, THE Platform SHALL respond to all read requests (dashboard data, assignment listings, submission listings, results views) within 3 seconds at the 95th percentile.
2. WHEN the number of concurrent authenticated users exceeds 1000, THE Platform SHALL continue to serve requests and SHALL NOT return errors attributable solely to exceeding the target user count; response times MAY degrade beyond the 3-second target under overload, but the Platform SHALL remain available.
3. WHEN a Student submits an Assignment, THE Platform SHALL acknowledge the Submission and return a confirmation response to the Student within 5 seconds, independent of the duration of the AI evaluation pipeline.
4. THE Platform SHALL execute the AI evaluation pipeline and similarity detection asynchronously; the Submission acknowledgment response SHALL be returned to the Student before either pipeline begins processing.
5. WHEN the AI evaluation pipeline for a Submission completes successfully, THE Platform SHALL update the Submission status and send the completion notification within 60 seconds of pipeline completion.
6. IF the AI evaluation pipeline for a Submission does not complete within 10 minutes of being enqueued, THEN THE Workflow_Orchestrator SHALL set the Submission status to "Evaluation Failed" and notify the Professor via in-platform notification.
