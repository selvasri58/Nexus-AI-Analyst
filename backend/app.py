import os
import io
import json
import traceback
import warnings
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from agent.graph import analyst_graph
from agent.utils import extract_schema_metadata, compute_confidence_score

warnings.filterwarnings("ignore")
load_dotenv()

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"])

_dataset_store: dict = {}


def get_df(session_id: str):
    return _dataset_store.get(session_id)


def store_df(session_id: str, df: pd.DataFrame):
    _dataset_store[session_id] = df


def read_csv_robust(raw_bytes: bytes) -> pd.DataFrame:
    """
    Attempt every combination of encoding and separator.
    Never raises on bad lines — always skips them.
    low_memory is only passed to the C engine.
    """
    encodings = ["utf-8-sig", "utf-8", "latin-1", "cp1252", "iso-8859-1"]
    separators = [",", ";", "\t", "|"]
    last_error = None

    # ── Pass 1: C engine (fast, strict) ──────────────────────────────────────
    for encoding in encodings:
        for sep in separators:
            try:
                buf = io.BytesIO(raw_bytes)
                df = pd.read_csv(
                    buf,
                    encoding=encoding,
                    sep=sep,
                    low_memory=False,   # only valid for C engine
                    engine="c",
                    on_bad_lines="skip",
                )
                if df.shape[0] > 0 and df.shape[1] >= 1:
                    return df
            except Exception as e:
                last_error = e

    # ── Pass 2: Python engine (lenient, no low_memory) ────────────────────────
    for encoding in encodings:
        for sep in separators:
            try:
                buf = io.BytesIO(raw_bytes)
                df = pd.read_csv(
                    buf,
                    encoding=encoding,
                    sep=sep,
                    engine="python",        # no low_memory here
                    on_bad_lines="skip",
                )
                if df.shape[0] > 0 and df.shape[1] >= 1:
                    return df
            except Exception as e:
                last_error = e

    # ── Pass 3: Read raw text, fix it, re-parse ───────────────────────────────
    for encoding in encodings:
        try:
            text = raw_bytes.decode(encoding, errors="replace")
            # Remove null bytes that corrupt pandas
            text = text.replace("\x00", "")
            buf = io.StringIO(text)
            df = pd.read_csv(buf, on_bad_lines="skip", engine="python")
            if df.shape[0] > 0 and df.shape[1] >= 1:
                return df
        except Exception as e:
            last_error = e

    raise ValueError(
        f"Could not parse the CSV after all attempts. "
        f"Last error: {str(last_error)}"
    )


def read_excel_robust(raw_bytes: bytes) -> pd.DataFrame:
    """Try openpyxl then xlrd for maximum Excel compatibility."""
    buf = io.BytesIO(raw_bytes)
    engines = ["openpyxl", "xlrd"]
    last_error = None

    for engine in engines:
        try:
            buf.seek(0)
            df = pd.read_excel(buf, engine=engine)
            if df.shape[0] > 0 and df.shape[1] >= 1:
                return df
        except Exception as e:
            last_error = e

    # Try reading all sheets and pick the largest
    try:
        buf.seek(0)
        xl = pd.ExcelFile(buf)
        best_df = None
        for sheet in xl.sheet_names:
            try:
                df = xl.parse(sheet)
                if best_df is None or df.shape[0] > best_df.shape[0]:
                    best_df = df
            except Exception:
                pass
        if best_df is not None and best_df.shape[0] > 0:
            return best_df
    except Exception as e:
        last_error = e

    raise ValueError(f"Could not read Excel file. Last error: {str(last_error)}")


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Sanitize column names, drop empties, fix dtypes."""
    # Clean column names
    df.columns = [
        str(c).strip().replace(" ", "_").replace("/", "_").replace("-", "_")
        for c in df.columns
    ]

    # Drop completely empty rows and columns
    df = df.dropna(how="all").dropna(axis=1, how="all").reset_index(drop=True)

    # Remove duplicate columns
    df = df.loc[:, ~df.columns.duplicated()]

    # Try to convert numeric-looking object columns
    for col in df.select_dtypes(include="object").columns:
        try:
            converted = pd.to_numeric(df[col], errors="coerce")
            # Only convert if >60% of values parse successfully
            if converted.notna().sum() > len(df) * 0.6:
                df[col] = converted
        except Exception:
            pass

    # Try datetime parsing on remaining object columns
    for col in df.select_dtypes(include="object").columns:
        try:
            parsed = pd.to_datetime(df[col], errors="coerce", dayfirst=False)
            if parsed.notna().sum() > len(df) * 0.5:
                df[col] = parsed
        except Exception:
            pass

    return df


# ── Health check ──────────────────────────────────────────────────────────────
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "groq_key_set": bool(os.environ.get("GROQ_API_KEY"))
    })


# ── File Upload ───────────────────────────────────────────────────────────────
@app.route("/api/upload", methods=["POST"])
def upload_file():
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file provided"}), 400

        file = request.files["file"]
        session_id = request.form.get("session_id", "default")
        filename = file.filename.lower()
        raw_bytes = file.read()

        if not raw_bytes:
            return jsonify({"error": "Uploaded file is empty."}), 400

        # ── Parse the file ────────────────────────────────────────────────────
        if filename.endswith(".csv"):
            try:
                df = read_csv_robust(raw_bytes)
            except ValueError as ve:
                return jsonify({"error": str(ve)}), 400

        elif filename.endswith((".xlsx", ".xls", ".xlsm", ".xlsb")):
            try:
                df = read_excel_robust(raw_bytes)
            except ValueError as ve:
                return jsonify({"error": str(ve)}), 400

        else:
            # Unknown extension — try CSV first, then Excel
            try:
                df = read_csv_robust(raw_bytes)
            except Exception:
                try:
                    df = read_excel_robust(raw_bytes)
                except Exception:
                    return jsonify({
                        "error": "Unsupported file type. Please upload a CSV or Excel file."
                    }), 400

        # ── Validate ──────────────────────────────────────────────────────────
        if df.empty:
            return jsonify({"error": "The uploaded file is empty."}), 400

        # ── Clean ─────────────────────────────────────────────────────────────
        df = clean_dataframe(df)

        if df.shape[1] < 1:
            return jsonify({"error": "No usable columns found in the file."}), 400

        # ── Store & respond ───────────────────────────────────────────────────
        store_df(session_id, df)
        schema_meta = extract_schema_metadata(df)
        confidence = compute_confidence_score(
            df=df, schema_meta=schema_meta, llm_success=True
        )

        return jsonify({
            "success": True,
            "session_id": session_id,
            "filename": file.filename,
            "schema_meta": schema_meta,
            "confidence": confidence,
        })

    except Exception as e:
        print("UPLOAD ERROR:", traceback.format_exc())
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# ── Dashboard Generation ──────────────────────────────────────────────────────
@app.route("/api/dashboard", methods=["POST"])
def generate_dashboard():
    try:
        body = request.get_json(force=True)
        session_id = body.get("session_id", "default")

        df = get_df(session_id)
        if df is None:
            return jsonify({
                "error": "No dataset found. Please upload a file first."
            }), 400

        schema_meta = extract_schema_metadata(df)

        initial_state = {
            "query": "Generate a comprehensive dashboard",
            "mode": "dashboard",
            "df": df,
            "schema_meta": schema_meta,
            "route": "proceed",
        }

        final_state = analyst_graph.invoke(initial_state)
        response = final_state.get("final_response", {})

        if not response:
            return jsonify({
                "type": "error",
                "message": "Pipeline returned empty response. Check your GROQ_API_KEY in the .env file.",
                "charts": [],
            })

        return jsonify(response)

    except Exception as e:
        print("DASHBOARD ERROR:", traceback.format_exc())
        return jsonify({
            "type": "error",
            "message": str(e),
            "traceback": traceback.format_exc(),
            "charts": [],
        }), 500


# ── Chat Query ────────────────────────────────────────────────────────────────
@app.route("/api/chat", methods=["POST"])
def chat_query():
    try:
        body = request.get_json(force=True)
        session_id = body.get("session_id", "default")
        query = body.get("query", "").strip()

        if not query:
            return jsonify({"error": "Query is required"}), 400

        df = get_df(session_id)
        schema_meta = extract_schema_metadata(df) if df is not None else None

        initial_state = {
            "query": query,
            "mode": "chat",
            "df": df,
            "schema_meta": schema_meta,
        }

        final_state = analyst_graph.invoke(initial_state)
        response = final_state.get("final_response", {})

        return jsonify(response)

    except Exception as e:
        print("CHAT ERROR:", traceback.format_exc())
        return jsonify({
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=True, port=port)