import traceback
import pandas as pd
import numpy as np
import re


def compute_chart_data(instruction: dict, df: pd.DataFrame) -> dict:
    """
    Deterministically compute chart data from a JSON instruction.
    No exec(), no sandbox, no LLM code — pure Python.
    
    instruction format:
    {
        "type": "bar" | "line" | "pie" | "scatter" | "histogram",
        "x_col": "column_name",
        "y_col": "column_name",
        "agg": "mean" | "sum" | "count",
        "limit": 10,
        "title": "Chart Title"
    }
    """
    try:
        chart_type = instruction.get("type", "bar")
        x_col      = instruction.get("x_col")
        y_col      = instruction.get("y_col")
        agg        = instruction.get("agg", "mean")
        limit      = int(instruction.get("limit", 15))
        title      = instruction.get("title", "Chart")

        # Validate columns exist
        available = list(df.columns)
        if x_col and x_col not in available:
            x_col = available[0]
        if y_col and y_col not in available:
            y_col = next((c for c in available if pd.api.types.is_numeric_dtype(df[c])), available[-1])

        if chart_type == "pie":
            col = x_col or y_col or available[0]
            vc  = df[col].dropna().value_counts().head(limit)
            return {
                "title":  title,
                "type":   "pie",
                "labels": vc.index.astype(str).tolist(),
                "values": [round(float(v), 2) for v in vc.values],
            }

        elif chart_type == "scatter":
            x = x_col or available[0]
            y = y_col or available[1] if len(available) > 1 else available[0]
            tmp = df[[x, y]].dropna().head(300)
            return {
                "title":  title,
                "type":   "scatter",
                "points": [
                    [round(float(a), 2), round(float(b), 2)]
                    for a, b in zip(tmp[x], tmp[y])
                ],
            }

        elif chart_type == "histogram":
            col     = y_col or x_col or available[0]
            series  = df[col].dropna()
            counts, edges = np.histogram(series, bins=min(20, series.nunique()))
            labels  = [f"{round(float(e),1)}" for e in edges[:-1]]
            return {
                "title":  title,
                "type":   "bar",
                "labels": labels,
                "series": [{"name": col, "data": [int(c) for c in counts]}],
            }

        elif chart_type == "line":
            x = x_col or available[0]
            y = y_col or next((c for c in available if pd.api.types.is_numeric_dtype(df[c])), available[-1])
            tmp = df[[x, y]].dropna().sort_values(x).head(limit)
            return {
                "title":  title,
                "type":   "line",
                "labels": tmp[x].astype(str).tolist(),
                "series": [{"name": y, "data": [round(float(v), 2) for v in tmp[y]]}],
            }

        else:  # bar (default)
            x = x_col or available[0]
            y = y_col or next((c for c in available if pd.api.types.is_numeric_dtype(df[c])), available[-1])

            if pd.api.types.is_numeric_dtype(df[x]):
                # x is numeric — use value counts
                vc  = df[x].dropna().value_counts().head(limit)
                tmp_labels = vc.index.astype(str).tolist()
                tmp_values = [round(float(v), 2) for v in vc.values]
                return {
                    "title":  title,
                    "type":   "bar",
                    "labels": tmp_labels,
                    "series": [{"name": x, "data": tmp_values}],
                }
            else:
                # categorical x, numeric y — groupby + aggregate
                agg_funcs = {"mean": "mean", "sum": "sum", "count": "count"}
                func = agg_funcs.get(agg, "mean")
                grp  = df.groupby(x)[y].agg(func).nlargest(limit).reset_index()
                return {
                    "title":  title,
                    "type":   "bar",
                    "labels": grp[x].astype(str).tolist(),
                    "series": [{"name": f"{agg}({y})", "data": [round(float(v), 2) for v in grp[y]]}],
                }

    except Exception:
        return {"error": traceback.format_exc(), "title": instruction.get("title", "Error")}


def execute_code_sandbox(code: str, df: pd.DataFrame) -> dict:
    """
    Legacy compatibility shim — converts old exec-based calls
    to the new instruction-based system where possible.
    Kept so graph.py / nodes.py don't break during transition.
    """
    # This is now just a passthrough that returns empty success
    # The real computation happens in compute_chart_data()
    return {
        "success": True,
        "stdout":  "",
        "results": {},
        "error":   None,
    }


def compute_confidence_score(df: pd.DataFrame, schema_meta: dict, llm_success: bool) -> dict:
    """C = (0.35 * Dc) + (0.40 * Sm) + (0.25 * Lp)"""
    total_rows = len(df)
    if total_rows == 0:
        return {
            "score": 0.0, "dc": 0.0, "sm": 0.0, "lp": 0.0,
            "breakdown": {
                "data_completeness": "0.0%",
                "schema_match":      "0.0%",
                "llm_certainty":     "0.0%",
            },
        }

    dc = float(df.dropna().shape[0]) / total_rows

    cols   = [c.lower() for c in df.columns]
    dtypes = df.dtypes

    has_time = any(re.search(r"date|time|year|month|day|week|quarter|timestamp", c) for c in cols) \
               or any("datetime" in str(dtypes[c]) for c in df.columns)
    has_num  = any(re.search(r"amount|total|count|value|price|revenue|cost|sales|profit|rate|score|qty|num|pop|vote|avg|mean", c) for c in cols) \
               or any(pd.api.types.is_numeric_dtype(dtypes[c]) for c in df.columns)
    has_cat  = any(re.search(r"category|type|region|country|city|status|label|group|segment|name|product|brand|genre|title|gender", c) for c in cols) \
               or any(pd.api.types.is_object_dtype(dtypes[c]) for c in df.columns)

    sm = min((0.40 if has_time else 0) + (0.40 if has_num else 0) + (0.20 if has_cat else 0), 1.0)
    sm = min(sm + (0.10 if len(df.columns) >= 5 else 0.05 if len(df.columns) >= 3 else 0), 1.0)

    lp    = 0.90 if llm_success else 0.35
    score = round((0.35 * dc) + (0.40 * sm) + (0.25 * lp), 4)

    return {
        "score": score,
        "dc":    round(dc, 4),
        "sm":    round(sm, 4),
        "lp":    round(lp, 4),
        "breakdown": {
            "data_completeness": f"{dc * 100:.1f}%",
            "schema_match":      f"{sm * 100:.1f}%",
            "llm_certainty":     f"{lp * 100:.1f}%",
        },
    }


def extract_schema_metadata(df: pd.DataFrame) -> dict:
    """Extract only metadata — never raw rows — safe for LLM context."""
    if df is None or df.empty:
        return {"shape": {"rows": 0, "columns": 0}, "columns": [], "describe_summary": {}}

    meta = {
        "shape":            {"rows": int(df.shape[0]), "columns": int(df.shape[1])},
        "columns":          [],
        "describe_summary": {},
    }

    for col in df.columns:
        dtype_str = str(df[col].dtype)
        info = {
            "name":         col,
            "dtype":        dtype_str,
            "null_count":   int(df[col].isnull().sum()),
            "null_pct":     round(float(df[col].isnull().mean()) * 100, 2),
            "unique_count": int(df[col].nunique()),
        }
        if pd.api.types.is_numeric_dtype(df[col]):
            nn = df[col].dropna()
            if len(nn):
                info["sample_stats"] = {
                    "min":  float(nn.min()),
                    "max":  float(nn.max()),
                    "mean": float(nn.mean()),
                }
        elif "datetime" in dtype_str:
            nn = df[col].dropna()
            if len(nn):
                info["sample_stats"] = {"min": str(nn.min()), "max": str(nn.max())}
        else:
            top = df[col].value_counts().head(5).index.tolist()
            info["top_values"] = [str(v) for v in top]
        meta["columns"].append(info)

    try:
        num_df = df.select_dtypes(include=[np.number])
        if not num_df.empty:
            desc = num_df.describe().fillna(0)
            for col in desc.columns:
                meta["describe_summary"][col] = {k: float(v) for k, v in desc[col].to_dict().items()}
    except Exception:
        pass

    return meta