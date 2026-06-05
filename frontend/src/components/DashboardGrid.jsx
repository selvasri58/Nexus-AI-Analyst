import React, { useState, useCallback, useRef } from "react";
import ReactECharts from "echarts-for-react";
import {
  Upload, FileSpreadsheet, AlertCircle, Loader2,
  TrendingUp, Database, Zap, CheckCircle, BarChart3, RefreshCw
} from "lucide-react";
import axios from "axios";

const SESSION_ID = "nexus_session_fixed";

// ── Confidence Score Ring ─────────────────────────────────────────────────────
function ConfidenceRing({ score, breakdown }) {
  const pct = Math.round((score || 0) * 100);
  const circumference = 2 * Math.PI * 54;
  const offset = circumference * (1 - (score || 0));
  const color = pct >= 80 ? "#a3e635" : pct >= 60 ? "#38bdf8" : "#fb923c";

  return (
    <div className="glass-card p-6 flex flex-col items-center gap-4">
      <div className="text-xs font-mono-custom text-slate-500 uppercase tracking-widest">Confidence Score</div>
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
          <circle cx="60" cy="60" r="54" fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={circumference} strokeDashoffset={offset}
            className="score-ring" style={{ filter: `drop-shadow(0 0 8px ${color}60)` }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-display font-800" style={{ color }}>{pct}%</span>
          <span className="text-xs text-slate-500 font-mono-custom">score</span>
        </div>
      </div>
      {breakdown && (
        <div className="w-full space-y-2">
          {[
            { label: "Data Completeness", val: breakdown.data_completeness, color: "#a3e635" },
            { label: "Schema Match",      val: breakdown.schema_match,      color: "#38bdf8" },
            { label: "LLM Certainty",     val: breakdown.llm_certainty,     color: "#a78bfa" },
          ].map(({ label, val, color }) => (
            <div key={label} className="flex justify-between items-center">
              <span className="text-xs text-slate-400">{label}</span>
              <span className="text-xs font-mono-custom" style={{ color }}>{val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Schema Card ───────────────────────────────────────────────────────────────
function SchemaCard({ meta }) {
  if (!meta) return null;
  const { shape, columns } = meta;
  const numericCount  = columns.filter(c => c.dtype.includes("float") || c.dtype.includes("int")).length;
  const catCount      = columns.filter(c => c.dtype.includes("object") || c.dtype.includes("bool")).length;

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="text-xs font-mono-custom text-slate-500 uppercase tracking-widest">Dataset Schema</div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Rows",      val: shape.rows.toLocaleString() },
          { label: "Columns",   val: shape.columns },
          { label: "Numeric",   val: numericCount },
          { label: "Categorical", val: catCount },
        ].map(({ label, val }) => (
          <div key={label} className="bg-obsidian-900/50 rounded-lg p-3 border border-white/5">
            <div className="text-lg font-display font-700 text-acid-400">{val}</div>
            <div className="text-xs text-slate-500">{label}</div>
          </div>
        ))}
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {columns.slice(0, 12).map((col) => (
          <div key={col.name} className="flex items-center justify-between py-1 border-b border-white/[0.03]">
            <span className="text-xs text-slate-300 truncate max-w-[60%]">{col.name}</span>
            <div className="flex items-center gap-2">
              {col.null_pct > 0 && <span className="text-xs text-ember-400">{col.null_pct}% null</span>}
              <span className="tag bg-obsidian-700 text-slate-400">{col.dtype.split("64")[0].split("32")[0]}</span>
            </div>
          </div>
        ))}
        {columns.length > 12 && (
          <div className="text-xs text-slate-600 text-center py-1">+{columns.length - 12} more columns</div>
        )}
      </div>
    </div>
  );
}

// ── ECharts theme ─────────────────────────────────────────────────────────────
const COLORS = ["#a3e635", "#38bdf8", "#a78bfa", "#fb923c", "#34d399", "#f472b6", "#facc15", "#60a5fa"];

function buildOption(chart) {
  const raw = chart.echarts_option || {};
  const isPie     = raw.series?.some(s => s.type === "pie");
  const isScatter = raw.series?.some(s => s.type === "scatter");

  const base = {
    backgroundColor: "transparent",
    color: COLORS,
    title: {
      ...(raw.title || {}),
      textStyle: { color: "#f1f5f9", fontFamily: "Syne, sans-serif", fontSize: 13, fontWeight: 700 },
      left: "center",
    },
    tooltip: {
      ...(raw.tooltip || { trigger: isPie ? "item" : "axis" }),
      backgroundColor: "rgba(10,15,30,0.95)",
      borderColor: "rgba(163,230,53,0.2)",
      borderWidth: 1,
      textStyle: { color: "#f1f5f9", fontSize: 11 },
    },
    series: (raw.series || []).map((s, i) => ({
      ...s,
      itemStyle: { ...(s.itemStyle || {}), borderRadius: s.type === "bar" ? [4, 4, 0, 0] : 0 },
      ...(s.type === "line" ? { smooth: true, areaStyle: { opacity: 0.07 }, lineStyle: { width: 2 }, symbol: "circle", symbolSize: 4 } : {}),
      ...(s.type === "pie" ? {
        radius: ["35%", "65%"],
        center: ["50%", "55%"],
        label: { show: true, color: "#94a3b8", fontSize: 10 },
        labelLine: { show: true },
      } : {}),
    })),
  };

  if (isPie) {
    return {
      ...base,
      legend: { ...(raw.legend || {}), bottom: 5, textStyle: { color: "#94a3b8", fontSize: 10 }, type: "scroll" },
      grid: undefined,
    };
  }

  if (isScatter) {
    return {
      ...base,
      xAxis: { type: "value", axisLabel: { color: "#64748b", fontSize: 10 }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.04)" } } },
      yAxis: { type: "value", axisLabel: { color: "#64748b", fontSize: 10 }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.04)" } } },
      grid: { top: 50, right: 20, bottom: 40, left: 50, containLabel: true },
    };
  }

  return {
    ...base,
    legend: { ...(raw.legend || {}), textStyle: { color: "#94a3b8", fontSize: 10 }, top: 30 },
    xAxis: {
      ...(raw.xAxis || {}),
      axisLabel: { color: "#64748b", fontSize: 10, rotate: raw.xAxis?.data?.length > 8 ? 30 : 0 },
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.04)" } },
    },
    yAxis: {
      ...(raw.yAxis || {}),
      axisLabel: { color: "#64748b", fontSize: 10 },
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.04)" } },
    },
    grid: { top: 60, right: 20, bottom: 50, left: 55, containLabel: true },
  };
}

// ── Chart Card ────────────────────────────────────────────────────────────────
function ChartCard({ chart, index }) {
  const isPie = chart.echarts_option?.series?.some(s => s.type === "pie");
  const option = buildOption(chart);

  return (
    <div className="glass-card overflow-hidden animate-fade-up"
      style={{ animationDelay: `${index * 80}ms`, animationFillMode: "both" }}>
      <div className="p-4" style={{ height: isPie ? 340 : 300 }}>
        <ReactECharts
          option={option}
          style={{ height: "100%", width: "100%" }}
          notMerge
          lazyUpdate={false}
          opts={{ renderer: "canvas" }}
        />
      </div>
      {chart.insight && (
        <div className="px-5 pb-4 border-t border-white/[0.04] pt-3">
          <p className="text-xs text-slate-400 leading-relaxed">{chart.insight}</p>
        </div>
      )}
    </div>
  );
}

// ── Upload Zone ───────────────────────────────────────────────────────────────
function UploadZone({ onUploadSuccess, isLoading, setIsLoading }) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError]       = useState(null);
  const fileRef                 = useRef();

  const handleFile = async (file) => {
    if (!file) return;
    const validExt = file.name.match(/\.(csv|xlsx|xls|xlsm)$/i);
    if (!validExt) { setError("Please upload a CSV or Excel file"); return; }
    setError(null);
    setIsLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("session_id", SESSION_ID);
      const res = await axios.post("/api/upload", form);
      onUploadSuccess(res.data);
    } catch (e) {
      setError(e.response?.data?.error || "Upload failed. Is the backend running?");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
      <div className="mb-10 text-center">
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-acid-400/10 border border-acid-400/30 flex items-center justify-center">
            <BarChart3 size={20} className="text-acid-400" />
          </div>
          <h1 className="text-4xl font-display font-800 text-white">NEXUS</h1>
        </div>
        <p className="text-slate-500 text-sm">AI-Powered Data Analyst · LangGraph + Groq + Llama 3</p>
      </div>

      <div
        className={`relative w-full max-w-lg border-2 border-dashed rounded-2xl p-12 flex flex-col items-center gap-5 cursor-pointer transition-all duration-300 ${
          dragOver ? "border-acid-400 bg-acid-400/5 acid-glow" : "border-white/10 hover:border-acid-400/40"}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.xlsm" className="hidden"
          onChange={(e) => handleFile(e.target.files[0])} />
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${
          isLoading ? "bg-plasma-500/10 border border-plasma-500/30" : "bg-acid-400/10 border border-acid-400/20"}`}>
          {isLoading ? <Loader2 size={28} className="text-plasma-400 animate-spin" /> : <Upload size={28} className="text-acid-400" />}
        </div>
        <div className="text-center">
          <p className="text-white font-display font-600 text-lg mb-1">
            {isLoading ? "Processing dataset…" : "Drop your dataset here"}
          </p>
          <p className="text-slate-500 text-sm">CSV or Excel · Any encoding</p>
        </div>
        {!isLoading && (
          <div className="flex gap-2">
            {["CSV", "XLSX", "XLS"].map(ext => (
              <span key={ext} className="tag bg-obsidian-800 text-slate-500 border border-white/5">{ext}</span>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 text-ember-400 text-sm bg-ember-400/10 border border-ember-400/20 rounded-lg px-4 py-3">
          <AlertCircle size={15} />{error}
        </div>
      )}

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        {[
          { icon: <Zap size={12} />, text: "LangGraph Agentic Pipeline" },
          { icon: <Database size={12} />, text: "Deterministic Computation" },
          { icon: <TrendingUp size={12} />, text: "Auto Chart Generation" },
        ].map(({ icon, text }) => (
          <div key={text} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-obsidian-800 border border-white/5 text-xs text-slate-400">
            <span className="text-acid-400">{icon}</span>{text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main DashboardGrid ────────────────────────────────────────────────────────
export default function DashboardGrid({ uploadData, onUploadData }) {
  const [isLoading,    setIsLoading]    = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [error,        setError]        = useState(null);

  const generateDashboard = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await axios.post("/api/dashboard", { session_id: SESSION_ID });
      setDashboardData(res.data);
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.message || "Dashboard generation failed");
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const handleUploadSuccess = useCallback((data) => {
    onUploadData(data);
    // Auto-generate after upload
    setTimeout(() => generateDashboard(), 300);
  }, [generateDashboard, onUploadData]);

  if (!uploadData) {
    return <UploadZone onUploadSuccess={handleUploadSuccess} isLoading={isLoading} setIsLoading={setIsLoading} />;
  }

  const { schema_meta, confidence, filename } = uploadData;

  return (
    <div className="min-h-screen p-6 space-y-6 animate-fade-in">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileSpreadsheet size={16} className="text-acid-400" />
            <span className="font-mono-custom text-sm text-acid-400">{filename}</span>
          </div>
          <h2 className="text-2xl font-display font-700 text-white">Automated Dashboard</h2>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={generateDashboard} disabled={isGenerating}
            className="btn-ghost px-4 py-2 rounded-lg text-sm flex items-center gap-2">
            <RefreshCw size={14} className={isGenerating ? "animate-spin" : ""} />
            Regenerate
          </button>
          <label className="btn-acid px-4 py-2 rounded-lg text-sm cursor-pointer flex items-center gap-2">
            <Upload size={14} />New File
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden"
              onChange={(e) => {
                if (!e.target.files[0]) return;
                const form = new FormData();
                form.append("file", e.target.files[0]);
                form.append("session_id", SESSION_ID);
                setIsLoading(true);
                axios.post("/api/upload", form)
                  .then(r => handleUploadSuccess(r.data))
                  .catch(err => setError(err.response?.data?.error))
                  .finally(() => setIsLoading(false));
              }} />
          </label>
        </div>
      </div>

      {/* Metadata strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <ConfidenceRing score={confidence?.score || 0} breakdown={confidence?.breakdown} />
        <SchemaCard meta={schema_meta} />
        {dashboardData?.overall_insight && (
          <div className="glass-card p-6 md:col-span-2 space-y-3">
            <div className="text-xs font-mono-custom text-slate-500 uppercase tracking-widest">AI Insight</div>
            <p className="text-slate-300 text-sm leading-relaxed">{dashboardData.overall_insight}</p>
          </div>
        )}
      </div>

      {/* Loading */}
      {isGenerating && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-2 border-acid-400/20 animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 size={24} className="text-acid-400 animate-spin" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-white font-display font-600">Generating Dashboard</p>
            <p className="text-slate-500 text-sm">Running LangGraph pipeline…</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !isGenerating && (
        <div className="flex items-center gap-3 bg-ember-400/10 border border-ember-400/20 rounded-xl p-4 text-ember-400">
          <AlertCircle size={18} />
          <div>
            <p className="font-600 text-sm">Generation Failed</p>
            <p className="text-xs opacity-80">{error}</p>
          </div>
        </div>
      )}

      {/* Charts grid */}
      {!isGenerating && dashboardData?.charts?.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {dashboardData.charts.map((chart, i) => (
            <ChartCard key={chart.id || i} chart={chart} index={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isGenerating && !error && dashboardData && (!dashboardData.charts || dashboardData.charts.length === 0) && (
        <div className="text-center py-20 text-slate-500">
          <BarChart3 size={40} className="mx-auto mb-3 opacity-30" />
          <p>No charts generated. Try clicking Regenerate.</p>
          {dashboardData.message && <p className="text-sm mt-2">{dashboardData.message}</p>}
        </div>
      )}

      {/* Initial state — uploaded but not yet generated */}
      {!isGenerating && !error && !dashboardData && uploadData && (
        <div className="text-center py-20 text-slate-500">
          <BarChart3 size={40} className="mx-auto mb-3 opacity-30" />
          <p>Click <strong className="text-acid-400">Regenerate</strong> to generate charts.</p>
        </div>
      )}
    </div>
  );
}

export { SESSION_ID };