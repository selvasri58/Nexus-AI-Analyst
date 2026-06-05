# NEXUS — AI Data Analyst

> **Agentic, full-stack data analysis platform** powered by LangGraph, Groq (Llama 3.1-70B), Flask, and React.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────┐
│                   FRONTEND (React)                │
│                                                   │
│  Page 1: DashboardGrid   Page 2: ChatInterface   │
│  ┌─────────────────┐     ┌──────────────────┐    │
│  │ Upload Zone     │     │ Chat Stream      │    │
│  │ Confidence Ring │     │ Inline ECharts   │    │
│  │ Schema Card     │     │ Insight Bubbles  │    │
│  │ Multi-Chart Grid│     │ Suggested Queries│    │
│  └─────────────────┘     └──────────────────┘    │
└──────────────┬───────────────────┬───────────────┘
               │  /api/upload      │  /api/chat
               │  /api/dashboard   │
┌──────────────▼───────────────────▼───────────────┐
│               FLASK BACKEND (Python)              │
│                                                   │
│  ┌─────────────── LangGraph DAG ───────────────┐ │
│  │                                             │ │
│  │  [Node 1] Routing & Input Guardrails        │ │
│  │       │ proceed              │ refusal       │ │
│  │       ▼                     ▼ END           │ │
│  │  [Node 2] Schema Processing                 │ │
│  │  (metadata only — NEVER raw rows to LLM)   │ │
│  │       │                                     │ │
│  │       ▼                                     │ │
│  │  [Node 3] Code Generation + Sandbox Exec   │ │
│  │  (LLM writes Python; Python computes math) │ │
│  │       │ success/retry loop                  │ │
│  │       ▼                                     │ │
│  │  [Node 4] Chart JSON + Insight Synthesis   │ │
│  │  (LLM structures; never computes)          │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  Confidence Score:                                │
│  C = (0.35 × Dc) + (0.40 × Sm) + (0.25 × Lp)   │
└───────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Backend Setup

```bash
cd backend

# Copy and fill in your Groq API key
cp .env.example .env
# Edit .env: GROQ_API_KEY=gsk_...

# Install dependencies
pip install -r requirements.txt

# Start Flask
python app.py
# → Running on http://localhost:5000
```

Get a free Groq API key at [console.groq.com](https://console.groq.com).

### 2. Frontend Setup

```bash
cd frontend

npm install
npm run dev
# → Running on http://localhost:5173
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Features

### Page 1: Dashboard Generator
- **Drag-and-drop upload** for CSV/XLSX files (up to 100MB)
- **Automatic schema detection**: dates, numerics, categoricals
- **Animated Confidence Score ring** with Dc/Sm/Lp breakdown
- **Multi-chart grid** with ECharts: bar, line, pie, scatter, histogram
- **AI-generated insight** paragraph per chart + executive summary
- **Regenerate** button to re-run the pipeline

### Page 2: Conversational Chat-to-Chart
- **Natural language queries** about your uploaded data
- **Inline chart rendering** directly in chat bubbles
- **Suggested starter queries** based on your dataset
- **Refusal guardrail**: off-topic questions are politely blocked
- **Self-correcting code execution**: up to 2 retry loops on error

### Security
- LLM output is **strict JSON only** — no raw HTML/JS/CSS permitted
- Regex scan rejects `<script>`, `<html>`, `javascript:` in LLM responses
- Code execution in **sandboxed environment** with restricted `__builtins__`
- Only metadata (never raw rows) is passed into LLM context window
- Flask endpoints wrapped in `try/except` — bad data cannot crash the server

---

## Confidence Score Formula

```
C = (0.35 × Dc) + (0.40 × Sm) + (0.25 × Lp)
```

| Component | Weight | Description |
|-----------|--------|-------------|
| `Dc` — Data Completeness | 35% | Fraction of fully non-null rows |
| `Sm` — Schema Match | 40% | Heuristic match of columns to charting dimensions (time, numeric, categorical) |
| `Lp` — LLM Certainty | 25% | 0.90 if code executed successfully, 0.35 on failure |

---

## LangGraph Node Summary

| Node | Role | LLM Used? |
|------|------|-----------|
| Node 1: Routing Guardrail | Classifies query relevance; short-circuits if irrelevant | No |
| Node 2: Schema Processing | Extracts column metadata, builds chart plan | No |
| Node 3: Code Generation + Sandbox | Generates Pandas code, executes deterministically | **Yes (writes code only)** |
| Node 4: Chart Synthesis | Structures ECharts JSON from computed results + writes insight | **Yes (structures + writes)** |

**Core Philosophy**: The LLM never computes numbers. It writes Python code that computes numbers. Math is always deterministic.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Backend health check + Groq key status |
| `POST` | `/api/upload` | Upload CSV/XLSX, returns schema metadata + confidence score |
| `POST` | `/api/dashboard` | Generate full multi-chart dashboard |
| `POST` | `/api/chat` | Single query → chart + insight |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Charts | Apache ECharts (via echarts-for-react) |
| Backend | Flask 3 + Flask-CORS |
| Agent Orchestration | LangGraph 0.2 |
| LLM | Groq API · `llama-3.1-70b-versatile` |
| Data Processing | Pandas + NumPy |
| Fonts | Syne (display) · DM Sans (body) · JetBrains Mono (code) |

---

## Project Structure

```
├── backend/
│   ├── app.py                  Flask server + API routes
│   ├── requirements.txt        Python dependencies
│   └── agent/
│       ├── __init__.py
│       ├── graph.py            LangGraph DAG definition
│       ├── nodes.py            Node logic (guardrail, schema, codegen, synthesis)
│       └── utils.py            Sandbox executor + confidence score + metadata extractor
└── frontend/
    ├── package.json
    ├── vite.config.js          Proxy /api → localhost:5000
    ├── tailwind.config.js
    ├── index.html
    └── src/
        ├── App.jsx             Global state hub + layout
        ├── index.css           Tailwind + custom design tokens
        ├── main.jsx
        └── components/
            ├── DashboardGrid.jsx   Page 1: upload + charts
            ├── ChatInterface.jsx   Page 2: conversational analyst
            └── ViewToggle.jsx      Navigation component
```
