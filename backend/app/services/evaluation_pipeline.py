"""
LangGraph evaluation pipeline.
Handles both PDF and text submissions.
Steps: fetch/extract → evaluate → store → notify
"""
from __future__ import annotations
import json
from typing import TypedDict, Literal
from langgraph.graph import StateGraph, END


class EvaluationState(TypedDict):
    submission_id: str
    assignment_id: str
    submission_type: str        # "pdf" | "text"
    file_url: str | None
    text_content: str | None    # for text submissions
    assignment_title: str
    assignment_description: str
    rubric: str
    max_marks: int

    # Pipeline outputs
    extracted_text: str | None
    extraction_error: str | None
    ai_score: int | None
    percentage: float | None
    grade: str | None
    strengths: str | None
    areas_of_improvement: str | None
    missing_points: str | None
    suggestions: str | None
    overall_feedback: str | None
    rubric_breakdown: dict | None
    evaluation_error: str | None
    status: str


# ── Nodes ──────────────────────────────────────────────────────────────────────

def fetch_and_extract_node(state: EvaluationState) -> EvaluationState:
    """For PDF: download + extract text. For text: pass through directly."""
    if state["submission_type"] == "text":
        text = state.get("text_content") or ""
        if not text.strip():
            return {**state, "extracted_text": None,
                    "extraction_error": "Empty text submission", "status": "extraction_failed"}
        return {**state, "extracted_text": text, "extraction_error": None}

    # PDF flow
    try:
        import httpx
        response = httpx.get(state["file_url"], timeout=30)
        response.raise_for_status()
        pdf_bytes = response.content
    except Exception as e:
        return {**state, "extracted_text": None,
                "extraction_error": f"Failed to fetch PDF: {e}", "status": "extraction_failed"}

    try:
        from app.services.pdf_processor import extract_text_from_pdf
        text, _ = extract_text_from_pdf(pdf_bytes)
        if not text.strip():
            return {**state, "extracted_text": None,
                    "extraction_error": "Zero characters extracted", "status": "extraction_failed"}
        return {**state, "extracted_text": text, "extraction_error": None}
    except Exception as e:
        return {**state, "extracted_text": None,
                "extraction_error": str(e), "status": "extraction_failed"}


def evaluate_node(state: EvaluationState) -> EvaluationState:
    """Run AI evaluation on the extracted text."""
    if state.get("status") == "extraction_failed":
        return state
    try:
        from app.services.ai_evaluator import evaluate_submission
        result = evaluate_submission(
            extracted_text=state["extracted_text"],
            assignment_title=state["assignment_title"],
            assignment_description=state["assignment_description"],
            rubric=state["rubric"],
            max_marks=state["max_marks"],
        )
        return {
            **state,
            "ai_score": result["score"],
            "percentage": result["percentage"],
            "grade": result["grade"],
            "strengths": result["strengths"],
            "areas_of_improvement": result["areas_of_improvement"],
            "missing_points": result["missing_points"],
            "suggestions": result["suggestions"],
            "overall_feedback": result["overall_feedback"],
            "rubric_breakdown": result["rubric_breakdown"],
            "evaluation_error": None,
            "status": "evaluated",
        }
    except Exception as e:
        return {**state, "ai_score": None, "evaluation_error": str(e), "status": "evaluation_failed"}


def route_after_extraction(state: EvaluationState) -> Literal["evaluate", "end_failed"]:
    return "end_failed" if state.get("status") == "extraction_failed" else "evaluate"


# ── Build graph ────────────────────────────────────────────────────────────────

def build_graph():
    g = StateGraph(EvaluationState)
    g.add_node("fetch_and_extract", fetch_and_extract_node)
    g.add_node("evaluate", evaluate_node)
    g.set_entry_point("fetch_and_extract")
    g.add_conditional_edges(
        "fetch_and_extract",
        route_after_extraction,
        {"evaluate": "evaluate", "end_failed": END},
    )
    g.add_edge("evaluate", END)
    return g.compile()


_graph = None


def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


def run_evaluation(
    submission_id: str,
    assignment_id: str,
    submission_type: str,
    assignment_title: str,
    assignment_description: str,
    rubric: str,
    max_marks: int,
    file_url: str | None = None,
    text_content: str | None = None,
) -> EvaluationState:
    initial: EvaluationState = {
        "submission_id": submission_id,
        "assignment_id": assignment_id,
        "submission_type": submission_type,
        "file_url": file_url,
        "text_content": text_content,
        "assignment_title": assignment_title,
        "assignment_description": assignment_description,
        "rubric": rubric,
        "max_marks": max_marks,
        "extracted_text": None,
        "extraction_error": None,
        "ai_score": None,
        "percentage": None,
        "grade": None,
        "strengths": None,
        "areas_of_improvement": None,
        "missing_points": None,
        "suggestions": None,
        "overall_feedback": None,
        "rubric_breakdown": None,
        "evaluation_error": None,
        "status": "pending",
    }
    return get_graph().invoke(initial)
