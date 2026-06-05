from typing import TypedDict, Optional, Any
from langgraph.graph import StateGraph, END
from .nodes import (
    routing_guardrail_node,
    schema_processing_node,
    code_generation_node,
    chart_synthesis_node,
)


class AgentState(TypedDict, total=False):
    query: Optional[str]
    mode: str
    df: Any
    schema_meta: Optional[dict]
    route: str
    chart_plan: list
    numeric_cols: list
    categorical_cols: list
    datetime_cols: list
    needs_text_only: bool
    text_only_answer: str
    generated_code: Optional[str]
    exec_result: Optional[dict]
    code_success: bool
    final_response: Optional[dict]
    error: Optional[str]


def route_decision(state: AgentState) -> str:
    return state.get("route", "proceed")


def text_only_node(state: AgentState) -> AgentState:
    """Handle text-only queries directly without chart computation."""
    from .nodes import _generate_text_answer
    answer = _generate_text_answer(
        state.get("query", ""),
        state.get("schema_meta", {}),
        state.get("df"),
    )
    from .utils import compute_confidence_score
    confidence = compute_confidence_score(
        df=state.get("df"),
        schema_meta=state.get("schema_meta", {}),
        llm_success=True,
    )
    return {
        **state,
        "final_response": {
            "type":       "text",
            "message":    answer,
            "confidence": confidence,
        },
    }


def build_graph() -> StateGraph:
    workflow = StateGraph(AgentState)

    workflow.add_node("routing_guardrail", routing_guardrail_node)
    workflow.add_node("text_only",         text_only_node)
    workflow.add_node("schema_processing", schema_processing_node)
    workflow.add_node("code_generation",   code_generation_node)
    workflow.add_node("chart_synthesis",   chart_synthesis_node)

    workflow.set_entry_point("routing_guardrail")

    workflow.add_conditional_edges(
        "routing_guardrail",
        route_decision,
        {
            "proceed":   "schema_processing",
            "refusal":   END,
            "text_only": "text_only",
        },
    )

    workflow.add_edge("text_only",         END)
    workflow.add_edge("schema_processing", "code_generation")
    workflow.add_edge("code_generation",   "chart_synthesis")
    workflow.add_edge("chart_synthesis",   END)

    return workflow.compile()


analyst_graph = build_graph()