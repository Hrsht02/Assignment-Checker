"""
LangGraph-based evaluation workflow orchestrator.
State machine: extract → evaluate → store → notify
"""
from __future__ import annotations
import uuid
import httpx
from typing import TypedDict, Literal

from langgraph.graph import StateGraph, END

from app.config import get_settings

settings = get_settings()


# ── State ────────────────────────────────────────────────────────────────────


class EvaluationState(TypedDict):
    submission_id: str
    assignment_id: str
    file_url: str
    assignment_title: str
    assignment_description: str
    rubric: str
    max_marks: int

    # Populated during execution
    pdf_bytes: bytes | None
    extracted_text: str | None
    extraction_error: str | None

    ai_score: int | None
    strengths: str | None
    areas_of_improvement: str | None
    detailed_feedback: str | None
    evaluation_error: str | None

    status: str  # "pending" | "evaluated" | "extraction_failed" | "evaluation_failed"


# ── Nodes ─────────────────────────────────────────────────────────────────────


def fetch_pdf_node(state: EvaluationState) -> EvaluationState:
    """Download the PDF from R2."""
    try:
        response = httpx.get(state["file_url"], timeout=30)
        response.raise_for_status()
        return {**state, "pdf_bytes": response.content}
    except Exception as e:
        return {**state, "pdf_bytes": None, "extraction_error": str(e)}


def extract_text_node(state: EvaluationState) -> EvaluationState:
    """Extract text from the PDF bytes."""
    if not state.get("pdf_bytes"):
        return {
            **state,
            "extracted_text": None,
            "extraction_error": "Failed to fetch PDF",
            "status": "extraction_failed",
        }
    try:
        from app.services.pdf_processor import extract_text_from_pdf
        text, _ = extract_text_from_pdf(state["pdf_bytes"])
        if not text.strip():
            return {
                **state,
                "extracted_text": None,
                "extraction_error": "Zero characters extracted",
                "status": "extraction_failed",
            }
        return {**state, "extracted_text": text, "extraction_error": None}
    except Exception as e:
        return {
            **state,
            "extracted_text": None,
            "extraction_error": str(e),
            "status": "extraction_failed",
        }


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
            "strengths": result["strengths"],
            "areas_of_improvement": result["areas_of_improvement"],
            "detailed_feedback": result["detailed_feedback"],
            "evaluation_error": None,
            "status": "evaluated",
        }
    except Exception as e:
        return {
            **state,
            "ai_score": None,
            "evaluation_error": str(e),
            "status": "evaluation_failed",
        }


def route_after_extraction(
    state: EvaluationState,
) -> Literal["evaluate", "end_failed"]:
    if state.get("status") == "extraction_failed":
        return "end_failed"
    return "evaluate"


# ── Build Graph ───────────────────────────────────────────────────────────────


def build_evaluation_graph() -> StateGraph:
    graph = StateGraph(EvaluationState)

    graph.add_node("fetch_pdf", fetch_pdf_node)
    graph.add_node("extract_text", extract_text_node)
    graph.add_node("evaluate", evaluate_node)

    graph.set_entry_point("fetch_pdf")
    graph.add_edge("fetch_pdf", "extract_text")
    graph.add_conditional_edges(
        "extract_text",
        route_after_extraction,
        {"evaluate": "evaluate", "end_failed": END},
    )
    graph.add_edge("evaluate", END)

    return graph.compile()


_compiled_graph = None


def get_evaluation_graph():
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_evaluation_graph()
    return _compiled_graph


def run_evaluation(
    submission_id: str,
    assignment_id: str,
    file_url: str,
    assignment_title: str,
    assignment_description: str,
    rubric: str,
    max_marks: int,
) -> EvaluationState:
    """Run the full evaluation pipeline and return the final state."""
    graph = get_evaluation_graph()

    initial_state: EvaluationState = {
        "submission_id": submission_id,
        "assignment_id": assignment_id,
        "file_url": file_url,
        "assignment_title": assignment_title,
        "assignment_description": assignment_description,
        "rubric": rubric,
        "max_marks": max_marks,
        "pdf_bytes": None,
        "extracted_text": None,
        "extraction_error": None,
        "ai_score": None,
        "strengths": None,
        "areas_of_improvement": None,
        "detailed_feedback": None,
        "evaluation_error": None,
        "status": "pending",
    }

    result = graph.invoke(initial_state)
    return result
