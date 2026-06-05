import json
import re
import os
import traceback
import pandas as pd
from groq import Groq
from .utils import compute_chart_data, compute_confidence_score, extract_schema_metadata


def get_groq_client():
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        raise ValueError("GROQ_API_KEY not found. Check your .env file.")
    return Groq(api_key=api_key)


REFUSAL_RESPONSE = {
    "type": "refusal",
    "message": "I am your data analyst assistant. I can only answer questions related to your uploaded data.",
}

IRRELEVANT_KEYWORDS = [
    "weather", "stock market", "recipe", "music", "sport",
    "joke", "poem", "who is", "what is the capital", "translate",
    "history of", "politics", "religion",
]

# Queries that should return text summaries, NOT charts
TEXT_ONLY_PATTERNS = [
    r"what (is|are|does) (this|the) (data|dataset|file|csv)",
    r"(tell|explain|describe|summarize|summary) (me )?(about|the|this)",
    r"what (kind|type|sort) of data",
    r"how many (rows|columns|records|entries|features)",
    r"what columns",
    r"give me (a |an )?(overview|summary|description|intro)",
    r"(overview|introduction|about this)",
    r"(hi|hello|hey|thanks|thank you|good|great|nice|ok|okay|sure|yes|no|what\?)",
    r"^(what|who|where|when|why|how)\s*\?*$",
]


def is_text_only_query(query: str) -> bool:
    """Return True if this query needs a text answer, not a chart."""
    q = query.lower().strip()
    for pattern in TEXT_ONLY_PATTERNS:
        if re.search(pattern, q):
            return True
    # Very short queries (under 4 words) that aren't asking for a chart
    words = q.split()
    chart_words = ["show", "plot", "chart", "graph", "compare", "top", "distribution",
                   "trend", "histogram", "scatter", "bar", "pie", "line", "correlation",
                   "average", "mean", "sum", "total", "count", "highest", "lowest",
                   "best", "worst", "most", "least", "ranking", "versus", "vs"]
    if len(words) <= 3 and not any(w in q for w in chart_words):
        return True
    return False


# ── Node 1: Routing ───────────────────────────────────────────────────────────
TEXT_ONLY_PATTERNS = [
    "what is this", "what is the data", "what are the columns",
    "tell me about", "describe", "summarize", "summary", "overview",
    "how many rows", "how many columns", "what columns", "about this",
    "hi", "hello", "hey", "thanks", "thank you", "ok", "okay",
    "what kind of data", "what type of data", "give me an overview",
]

def is_text_only(query):
    q = query.lower().strip()
    if any(p in q for p in TEXT_ONLY_PATTERNS):
        return True
    chart_words = ["show", "plot", "chart", "compare", "top", "distribution",
                   "trend", "histogram", "scatter", "bar", "pie", "average",
                   "mean", "sum", "total", "count", "highest", "lowest", "vs"]
    if len(q.split()) <= 3 and not any(w in q for w in chart_words):
        return True
    return False

def routing_guardrail_node(state: dict) -> dict:
    query       = (state.get("query") or "").lower().strip()
    schema_meta = state.get("schema_meta")
    mode        = state.get("mode", "dashboard")

    if not schema_meta and mode == "chat":
        if any(kw in query for kw in IRRELEVANT_KEYWORDS):
            return {**state, "route": "refusal", "final_response": REFUSAL_RESPONSE}
        return {**state, "route": "refusal", "final_response": {
            "type": "refusal",
            "message": "Please upload a CSV or Excel dataset first.",
        }}

    if schema_meta and any(kw in query for kw in IRRELEVANT_KEYWORDS):
        return {**state, "route": "refusal", "final_response": REFUSAL_RESPONSE}

    # Flag text-only queries right here at the routing stage
    if mode == "chat" and is_text_only(query):
        return {**state, "route": "text_only"}

    return {**state, "route": "proceed"}


# ── Node 2: Schema → Chart Plan ───────────────────────────────────────────────
def schema_processing_node(state: dict) -> dict:
    schema_meta = state.get("schema_meta", {})
    columns     = schema_meta.get("columns", [])
    query       = (state.get("query") or "").lower().strip()

    numeric_cols     = [c["name"] for c in columns if any(t in c["dtype"] for t in ["float", "int"])]
    categorical_cols = [c["name"] for c in columns if any(t in c["dtype"] for t in ["object", "category", "bool"])]
    datetime_cols    = [c["name"] for c in columns if "datetime" in c["dtype"]]

    # Flag text-only queries so Node 3 skips chart computation
    needs_text_only = is_text_only_query(query) and state.get("mode") == "chat"

    chart_plan = []

    if datetime_cols and numeric_cols:
        chart_plan.append({
            "type": "line", "x_col": datetime_cols[0], "y_col": numeric_cols[0],
            "title": f"Trend over {datetime_cols[0]}", "agg": "mean", "limit": 50,
        })

    if categorical_cols and numeric_cols:
        chart_plan.append({
            "type": "bar", "x_col": categorical_cols[0], "y_col": numeric_cols[0],
            "title": f"Top {categorical_cols[0]} by {numeric_cols[0]}", "agg": "mean", "limit": 15,
        })
        if len(numeric_cols) >= 2:
            chart_plan.append({
                "type": "bar", "x_col": categorical_cols[0], "y_col": numeric_cols[1],
                "title": f"Top {categorical_cols[0]} by {numeric_cols[1]}", "agg": "sum", "limit": 15,
            })

    if categorical_cols:
        chart_plan.append({
            "type": "pie", "x_col": categorical_cols[0],
            "title": f"Distribution of {categorical_cols[0]}", "limit": 10,
        })

    if len(numeric_cols) >= 2:
        chart_plan.append({
            "type": "scatter", "x_col": numeric_cols[0], "y_col": numeric_cols[1],
            "title": f"{numeric_cols[0]} vs {numeric_cols[1]}", "limit": 200,
        })

    if numeric_cols:
        chart_plan.append({
            "type": "histogram", "y_col": numeric_cols[0],
            "title": f"Distribution of {numeric_cols[0]}", "limit": 20,
        })

    if len(categorical_cols) > 1 and numeric_cols:
        chart_plan.append({
            "type": "bar", "x_col": categorical_cols[1], "y_col": numeric_cols[0],
            "title": f"{numeric_cols[0]} by {categorical_cols[1]}", "agg": "mean", "limit": 15,
        })

    if not chart_plan and columns:
        all_cols = [c["name"] for c in columns]
        chart_plan.append({
            "type": "bar",
            "x_col": all_cols[0],
            "y_col": all_cols[1] if len(all_cols) > 1 else all_cols[0],
            "title": "Dataset Overview", "agg": "count", "limit": 15,
        })

    print(f"\n[SCHEMA] numeric={numeric_cols}, categorical={categorical_cols}, datetime={datetime_cols}")
    print(f"[PLAN] {len(chart_plan)} charts planned | text_only={needs_text_only}")

    return {
        **state,
        "chart_plan":        chart_plan,
        "numeric_cols":      numeric_cols,
        "categorical_cols":  categorical_cols,
        "datetime_cols":     datetime_cols,
        "needs_text_only":   needs_text_only,
    }


# ── Node 3: Computation ───────────────────────────────────────────────────────
def code_generation_node(state: dict) -> dict:
    df               = state.get("df")
    chart_plan       = state.get("chart_plan", [])
    mode             = state.get("mode", "dashboard")
    query            = state.get("query", "")
    needs_text_only  = state.get("needs_text_only", False)
    numeric_cols     = state.get("numeric_cols", [])
    categorical_cols = state.get("categorical_cols", [])
    datetime_cols    = state.get("datetime_cols", [])

    results = {}

    # ── Text-only path: build a data summary, skip chart computation ──────────
    if needs_text_only and mode == "chat":
        print("[COMPUTE] Text-only query detected — skipping chart computation")
        return {
            **state,
            "generated_code": "text_only",
            "exec_result":    {"success": True, "results": {}, "error": None},
            "code_success":   True,
            "text_only_answer": _generate_text_answer(query, state.get("schema_meta", {}), df),
        }

    # ── Dashboard: compute all charts ─────────────────────────────────────────
    if mode == "dashboard":
        for plan in chart_plan[:6]:
            title = plan.get("title", "Chart")
            print(f"[COMPUTE] {title} ...")
            data = compute_chart_data(plan, df)
            if "error" not in data:
                results[title] = data
                print(f"[COMPUTE] OK — {title}")
            else:
                print(f"[COMPUTE] FAILED — {title}: {data['error'][:100]}")

    # ── Chat: compute single chart ────────────────────────────────────────────
    else:
        instruction = _query_to_instruction(query, numeric_cols, categorical_cols, datetime_cols)
        print(f"[CHAT COMPUTE] instruction={instruction}")
        data = compute_chart_data(instruction, df)
        if "error" not in data:
            results["chart_data"] = data
        else:
            print(f"[CHAT COMPUTE ERROR] {data['error']}")

    print(f"[COMPUTE] Results: {list(results.keys())}")

    return {
        **state,
        "generated_code": "deterministic",
        "exec_result":    {"success": bool(results), "results": results, "error": None},
        "code_success":   bool(results),
    }


def _generate_text_answer(query: str, schema_meta: dict, df) -> str:
    """
    Use Groq to generate a natural language answer about the dataset.
    Never returns a chart — pure text only.
    """
    try:
        client = get_groq_client()

        columns   = schema_meta.get("columns", [])
        shape     = schema_meta.get("shape", {})
        col_names = [c["name"] for c in columns]
        num_cols  = [c["name"] for c in columns if any(t in c["dtype"] for t in ["float", "int"])]
        cat_cols  = [c["name"] for c in columns if "object" in c["dtype"]]
        dt_cols   = [c["name"] for c in columns if "datetime" in c["dtype"]]

        # Build a stats summary for context
        stats_lines = []
        if df is not None:
            for col in num_cols[:4]:
                try:
                    s = df[col].dropna()
                    stats_lines.append(f"  {col}: min={s.min():.2f}, max={s.max():.2f}, mean={s.mean():.2f}")
                except Exception:
                    pass
            for col in cat_cols[:3]:
                try:
                    top = df[col].value_counts().head(3).index.tolist()
                    stats_lines.append(f"  {col}: top values = {top}")
                except Exception:
                    pass

        stats_str = "\n".join(stats_lines) if stats_lines else "  (no stats available)"

        system_prompt = f"""You are a data analyst assistant. Answer questions about the uploaded dataset concisely and helpfully.

Dataset info:
- Rows: {shape.get('rows', 'unknown'):,}
- Columns: {shape.get('columns', 'unknown')}
- Column names: {col_names}
- Numeric columns: {num_cols}
- Categorical columns: {cat_cols}
- Date/time columns: {dt_cols}

Key statistics:
{stats_str}

Rules:
- Answer in 2-5 sentences maximum
- Be specific and use actual numbers from the stats above
- Do NOT suggest charts or visualizations
- Do NOT say "I cannot" — always answer based on the metadata above
- If asked about the data topic, infer it from the column names"""

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": query},
            ],
            temperature=0.3,
            max_tokens=200,
        )
        return response.choices[0].message.content.strip()

    except Exception as e:
        print(f"[TEXT ANSWER ERROR] {e}")
        cols = schema_meta.get("columns", [])
        shape = schema_meta.get("shape", {})
        col_names = [c["name"] for c in cols]
        return (
            f"This dataset has {shape.get('rows', '?'):,} rows and {shape.get('columns', '?')} columns. "
            f"The columns are: {', '.join(col_names)}."
        )


def _query_to_instruction(query: str, numeric_cols: list, categorical_cols: list, datetime_cols: list) -> dict:
    """Map a natural language query to a chart instruction."""
    q = query.lower()

    if any(w in q for w in ["trend", "over time", "timeline", "by date", "by year", "by month"]):
        chart_type = "line"
        x = datetime_cols[0] if datetime_cols else (categorical_cols[0] if categorical_cols else None)
    elif any(w in q for w in ["distribution", "spread", "histogram", "range"]):
        chart_type = "histogram"
        x = None
    elif any(w in q for w in ["proportion", "share", "percentage", "pie", "ratio"]):
        chart_type = "pie"
        x = categorical_cols[0] if categorical_cols else None
    elif any(w in q for w in ["correlation", "scatter", "relationship"]):
        chart_type = "scatter"
        x = numeric_cols[0] if len(numeric_cols) >= 2 else None
    else:
        chart_type = "bar"
        x = categorical_cols[0] if categorical_cols else None

    # Find y column — prefer one mentioned in query
    y = numeric_cols[0] if numeric_cols else None
    for col in numeric_cols:
        if col.lower() in q:
            y = col
            break

    # Find x column — prefer one mentioned in query
    if x is None:
        x = categorical_cols[0] if categorical_cols else (numeric_cols[0] if numeric_cols else None)
    for col in (categorical_cols + datetime_cols):
        if col.lower() in q:
            x = col
            break

    agg = "sum" if any(w in q for w in ["total", "sum"]) else "mean"

    return {
        "type":  chart_type,
        "x_col": x,
        "y_col": y,
        "agg":   agg,
        "limit": 15,
        "title": query[:60],
    }


# ── Node 4: Format results as ECharts JSON or plain text ─────────────────────
def chart_synthesis_node(state: dict) -> dict:
    exec_result     = state.get("exec_result", {})
    mode            = state.get("mode", "chat")
    query           = state.get("query", "")
    schema_meta     = state.get("schema_meta", {})
    df              = state.get("df")
    needs_text_only = state.get("needs_text_only", False)
    text_answer     = state.get("text_only_answer", "")

    # ── Text-only response ────────────────────────────────────────────────────
    if needs_text_only and mode == "chat":
        confidence = compute_confidence_score(df=df, schema_meta=schema_meta, llm_success=True)
        return {
            **state,
            "final_response": {
                "type":       "text",
                "message":    text_answer,
                "confidence": confidence,
            },
        }

    # ── Chart response ────────────────────────────────────────────────────────
    computed = exec_result.get("results", {}) if exec_result else {}

    if not computed:
        return {
            **state,
            "final_response": {
                "type":    "error",
                "message": "No data could be computed. Try rephrasing your question.",
                "charts":  [],
            },
        }

    charts = []
    for title, data in computed.items():
        option = _data_to_echarts(title, data)
        if option:
            charts.append({
                "id":             title.replace(" ", "_").lower(),
                "title":          title,
                "echarts_option": option,
                "insight":        _generate_insight(title, data),
            })

    # LLM overall summary (dashboard only)
    overall_insight = ""
    if mode == "dashboard":
        try:
            client  = get_groq_client()
            summary = json.dumps(
                {k: _summarize_data(v) for k, v in computed.items()},
                default=str
            )[:2000]
            resp = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content":
                    f"Write a 2-sentence executive summary of this dataset analysis. "
                    f"Be specific with numbers. Data: {summary}"}],
                temperature=0.3,
                max_tokens=150,
            )
            overall_insight = resp.choices[0].message.content.strip()
        except Exception as e:
            overall_insight = f"Dashboard generated with {len(charts)} charts."
            print(f"[INSIGHT ERROR] {e}")

    confidence = compute_confidence_score(
        df=df, schema_meta=schema_meta,
        llm_success=state.get("code_success", False),
    )

    print(f"[SYNTHESIS] {len(charts)} charts ready")

    if mode == "dashboard":
        return {
            **state,
            "final_response": {
                "type":            "dashboard",
                "charts":          charts,
                "overall_insight": overall_insight,
                "confidence":      confidence,
                "schema_meta":     schema_meta,
            },
        }
    else:
        return {
            **state,
            "final_response": {
                "type":       "chat",
                "chart":      charts[0] if charts else {},
                "confidence": confidence,
            },
        }


def _data_to_echarts(title: str, data: dict) -> dict:
    """Convert computed data dict to ECharts option directly."""
    try:
        chart_type = data.get("type", "bar")
        base = {
            "title":   {"text": title, "textStyle": {"fontSize": 13}},
            "tooltip": {"trigger": "axis"},
        }

        if chart_type == "pie":
            pie_data = [
                {"name": str(n), "value": float(v)}
                for n, v in zip(data.get("labels", []), data.get("values", []))
            ]
            return {**base, "tooltip": {"trigger": "item"},
                    "series": [{"type": "pie", "data": pie_data, "radius": "60%"}]}

        elif chart_type == "scatter":
            return {
                **base,
                "xAxis":  {"type": "value"},
                "yAxis":  {"type": "value"},
                "series": [{"type": "scatter", "data": data.get("points", [])}],
            }

        else:
            labels = data.get("labels", [])
            series = data.get("series", [])
            s_type = "line" if chart_type == "line" else "bar"
            return {
                **base,
                "legend":  {"data": [s["name"] for s in series]},
                "xAxis":   {"type": "category", "data": labels},
                "yAxis":   {"type": "value"},
                "series":  [{"name": s["name"], "type": s_type, "data": s["data"]} for s in series],
            }
    except Exception:
        return {}


def _generate_insight(title: str, data: dict) -> str:
    """Generate a quick insight string from computed data."""
    try:
        chart_type = data.get("type", "bar")
        if chart_type == "pie":
            labels, values = data.get("labels", []), data.get("values", [])
            if labels and values:
                total = sum(values)
                pct   = round(values[0] / total * 100, 1) if total else 0
                return f"{labels[0]} is the largest category at {pct}% of the total."
        elif chart_type in ("bar", "line"):
            series, labels = data.get("series", []), data.get("labels", [])
            if series and labels:
                vals  = series[0]["data"]
                name  = series[0]["name"]
                top_i = vals.index(max(vals))
                return f"Highest {name}: {labels[top_i]} with {max(vals):,.2f}."
        elif chart_type == "scatter":
            pts = data.get("points", [])
            if pts:
                return f"Scatter plot shows {len(pts)} data points."
        return ""
    except Exception:
        return ""


def _summarize_data(data: dict) -> dict:
    """Tiny summary of computed data for the LLM insight prompt."""
    try:
        t = data.get("type", "bar")
        if t == "pie":
            return {"top_label": data["labels"][0], "top_value": data["values"][0]} if data.get("labels") else {}
        elif t in ("bar", "line"):
            s    = data.get("series", [{}])[0]
            vals = s.get("data", [])
            return {"series": s.get("name"), "max": max(vals) if vals else 0, "min": min(vals) if vals else 0}
        return {}
    except Exception:
        return {}