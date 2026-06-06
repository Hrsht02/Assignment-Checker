"""
AI evaluation using Gemini 2.5 Flash via LangGraph workflow.
"""
from __future__ import annotations
import json
from typing import TypedDict
from app.config import get_settings

settings = get_settings()


class EvaluationResult(TypedDict):
    strengths: str
    areas_of_improvement: str
    score: int
    detailed_feedback: str


def _get_gemini_client():
    import google.generativeai as genai
    genai.configure(api_key=settings.GEMINI_API_KEY)
    return genai.GenerativeModel("gemini-2.5-flash-preview-05-20")


def evaluate_submission(
    extracted_text: str,
    assignment_title: str,
    assignment_description: str,
    rubric: str,
    max_marks: int,
) -> EvaluationResult:
    """
    Evaluate a student submission using Gemini 2.5 Flash.
    Returns structured evaluation result.
    """
    model = _get_gemini_client()

    prompt = f"""You are an academic evaluator. Evaluate the following student submission.

Assignment Title: {assignment_title}

Assignment Description:
{assignment_description}

Evaluation Rubric:
{rubric}

Maximum Marks: {max_marks}

Student Submission:
{extracted_text[:8000]}  

Please evaluate and respond ONLY with valid JSON in this exact format:
{{
  "strengths": "Describe specific strengths of the submission in 2-4 sentences.",
  "areas_of_improvement": "Describe specific areas that need improvement in 2-4 sentences.",
  "score": <integer between 0 and {max_marks}>,
  "detailed_feedback": "Provide comprehensive feedback of 100-300 words covering content accuracy, clarity, completeness, and alignment with the rubric."
}}

Ensure the score is a non-negative integer not exceeding {max_marks}.
"""

    response = model.generate_content(prompt)
    raw = response.text.strip()

    # Strip markdown code fences if present
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1]) if lines[-1] == "```" else "\n".join(lines[1:])

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Gemini returned invalid JSON: {e}\nRaw: {raw[:500]}")

    score = int(data.get("score", 0))
    score = max(0, min(score, max_marks))

    return EvaluationResult(
        strengths=str(data.get("strengths", "")),
        areas_of_improvement=str(data.get("areas_of_improvement", "")),
        score=score,
        detailed_feedback=str(data.get("detailed_feedback", "")),
    )
