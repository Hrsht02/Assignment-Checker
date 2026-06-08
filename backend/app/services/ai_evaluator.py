"""
AI evaluation using Gemini 2.5 Flash.
Supports rubric-based and rubric-free evaluation.
Generates marks, grade, and structured feedback.
"""
from __future__ import annotations
import json
import re
from typing import TypedDict
from app.config import get_settings

settings = get_settings()


class EvaluationResult(TypedDict):
    strengths: str
    areas_of_improvement: str
    missing_points: str
    suggestions: str
    overall_feedback: str
    score: int
    percentage: float
    grade: str
    detailed_feedback: str
    rubric_breakdown: dict   # {criterion: {"score": x, "max": y, "comment": "..."}}


def _get_gemini():
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

    If rubric is provided, evaluate according to its criteria.
    If rubric is empty/generic, AI intelligently creates its own criteria.
    """
    model = _get_gemini()

    rubric_section = f"""Evaluation Rubric:
{rubric}

Evaluate STRICTLY according to the rubric criteria above.
Break down the score by each rubric criterion.""" if rubric and rubric.strip() else """No rubric provided.
Create your own fair evaluation criteria appropriate for this assignment.
State the criteria you are using in your rubric_breakdown."""

    prompt = f"""You are an expert academic evaluator. Evaluate the following student submission carefully and objectively.

Assignment Title: {assignment_title}

Assignment Description / Questions:
{assignment_description}

{rubric_section}

Maximum Total Marks: {max_marks}

Student Submission:
---
{extracted_text[:10000]}
---

Respond ONLY with a valid JSON object in EXACTLY this format (no extra text, no markdown):
{{
  "strengths": "2-4 sentences describing what the student did well.",
  "areas_of_improvement": "2-4 sentences describing specific weaknesses.",
  "missing_points": "List specific concepts or points that are missing or incomplete.",
  "suggestions": "Actionable suggestions for the student to improve.",
  "overall_feedback": "A comprehensive 150-250 word evaluation covering accuracy, depth, clarity, and completeness.",
  "score": <integer 0 to {max_marks}>,
  "rubric_breakdown": {{
    "<criterion_name>": {{
      "max_score": <integer>,
      "obtained_score": <integer>,
      "comment": "Brief comment on this criterion."
    }}
  }}
}}

Rules:
- score MUST be an integer between 0 and {max_marks} (inclusive)
- rubric_breakdown scores must sum to the total score
- Be fair, objective, and consistent
"""

    response = model.generate_content(prompt)
    raw = response.text.strip()

    # Strip markdown fences
    raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.MULTILINE)
    raw = re.sub(r'\s*```$', '', raw, flags=re.MULTILINE)
    raw = raw.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Try to extract JSON from the response
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if match:
            data = json.loads(match.group())
        else:
            raise ValueError(f"Gemini returned non-JSON response: {raw[:500]}")

    score = max(0, min(int(data.get("score", 0)), max_marks))
    percentage = round(score / max_marks * 100, 1) if max_marks > 0 else 0.0
    grade = _grade(percentage)

    return EvaluationResult(
        strengths=str(data.get("strengths", "Not evaluated.")),
        areas_of_improvement=str(data.get("areas_of_improvement", "Not evaluated.")),
        missing_points=str(data.get("missing_points", "")),
        suggestions=str(data.get("suggestions", "")),
        overall_feedback=str(data.get("overall_feedback", "")),
        score=score,
        percentage=percentage,
        grade=grade,
        detailed_feedback=str(data.get("overall_feedback", "")),
        rubric_breakdown=data.get("rubric_breakdown", {}),
    )


def _grade(pct: float) -> str:
    if pct >= 90: return "A+"
    if pct >= 80: return "A"
    if pct >= 70: return "B+"
    if pct >= 60: return "B"
    if pct >= 50: return "C"
    if pct >= 40: return "D"
    return "F"
