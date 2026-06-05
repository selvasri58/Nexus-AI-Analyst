import React, { useState, useRef, useEffect } from "react";
import ReactECharts from "echarts-for-react";
import { Send, Bot, User, AlertCircle, Loader2, Sparkles, Database, ChevronRight, MessageSquare } from "lucide-react";
import axios from "axios";
import { SESSION_ID } from "./DashboardGrid";

const COLORS = ["#a3e635", "#38bdf8", "#a78bfa", "#fb923c", "#34d399", "#f472b6"];

function buildChatOption(chartData) {
  if (!chartData?.echarts_option) return null;
  const raw   = chartData.echarts_option;
  const isPie = raw.series?.some(s => s.type === "pie");
  const isScat= raw.series?.some(s => s.type === "scatter");

  const base = {
    backgroundColor: "transparent",
    color: COLORS,
    title: { ...(raw.title || {}), textStyle: { color: "#f1f5f9", fontFamily: "Syne,sans-serif", fontSize: 12, fontWeight: 700 }, left: "center" },
    tooltip: { ...(raw.tooltip || { trigger: isPie ? "item" : "axis" }), backgroundColor: "rgba(10,15,30,0.95)", borderColor: "rgba(163,230,53,0.2)", borderWidth: 1, textStyle: { color: "#f1f5f9", fontSize: 11 } },
    series: (raw.series || []).map(s => ({
      ...s,
      itemStyle: { ...(s.itemStyle || {}), borderRadius: s.type === "bar" ? [3,3,0,0] : 0 },
      ...(s.type === "line"    ? { smooth: true, areaStyle: { opacity: 0.06 }, lineStyle: { width: 2 }, symbol: "circle", symbolSize: 4 } : {}),
      ...(s.type === "pie"     ? { radius: ["30%","60%"], center: ["50%","48%"], label: { show: true, color: "#94a3b8", fontSize: 10 }, labelLine: { show: true } } : {}),
    })),
  };

  if (isPie)  return { ...base, legend: { bottom: 0, textStyle: { color: "#94a3b8", fontSize: 9 }, type: "scroll" } };
  if (isScat) return { ...base, xAxis: { type: "value", axisLabel: { color: "#64748b", fontSize: 9 }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.04)" } } }, yAxis: { type: "value", axisLabel: { color: "#64748b", fontSize: 9 }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.04)" } } }, grid: { top: 40, right: 10, bottom: 30, left: 40, containLabel: true } };

  return {
    ...base,
    legend: { ...(raw.legend || {}), textStyle: { color: "#94a3b8", fontSize: 9 }, top: 25 },
    xAxis: { ...(raw.xAxis || {}), axisLabel: { color: "#64748b", fontSize: 9, rotate: raw.xAxis?.data?.length > 8 ? 30 : 0 }, axisLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.04)" } } },
    yAxis: { ...(raw.yAxis || {}), axisLabel: { color: "#64748b", fontSize: 9 }, axisLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.04)" } } },
    grid: { top: 50, right: 10, bottom: 40, left: 45, containLabel: true },
  };
}

function InlineChart({ chartData }) {
  if (!chartData) return null;
  const isPie  = chartData.echarts_option?.series?.some(s => s.type === "pie");
  const option = buildChatOption(chartData);
  if (!option) return null;
  return (
    <div className="mt-3 rounded-xl overflow-hidden border border-white/[0.06] bg-obsidian-900/50">
      <ReactECharts option={option} style={{ height: isPie ? 280 : 220 }} notMerge lazyUpdate={false} opts={{ renderer: "canvas" }} />
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser    = message.role === "user";
  const isRefusal = message.type === "refusal";
  const isError   = message.type === "error";

  return (
    <div className={`flex gap-3 animate-fade-up ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center border ${
        isUser      ? "bg-acid-400/10 border-acid-400/30"
        : isRefusal || isError ? "bg-ember-400/10 border-ember-400/30"
        : "bg-plasma-500/10 border-plasma-500/30"}`}>
        {isUser ? <User size={14} className="text-acid-400" /> : <Bot size={14} className={isRefusal || isError ? "text-ember-400" : "text-plasma-400"} />}
      </div>

      {/* Content */}
      <div className={`max-w-[85%] space-y-2 ${isUser ? "items-end flex flex-col" : ""}`}>
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser             ? "bg-acid-400/10 border border-acid-400/20 text-white rounded-tr-sm"
          : isRefusal || isError ? "bg-ember-400/10 border border-ember-400/20 text-ember-300 rounded-tl-sm"
          : "glass-panel text-slate-200 rounded-tl-sm"}`}>
          {isRefusal || isError
            ? <div className="flex items-start gap-2"><AlertCircle size={14} className="text-ember-400 mt-0.5 flex-shrink-0" /><span>{message.content}</span></div>
            : <span style={{ whiteSpace: "pre-wrap" }}>{message.content}</span>}
        </div>

        {/* Chart bubble (only for chart-type responses) */}
        {!isUser && message.type === "chart" && message.chart && (
          <div className="w-full glass-panel rounded-2xl rounded-tl-sm p-1">
            <InlineChart chartData={message.chart} />
            {message.chart.insight && (
              <div className="px-4 pb-3 pt-2">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles size={11} className="text-acid-400" />
                  <span className="text-xs font-mono-custom text-acid-400 uppercase tracking-wider">Insight</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{message.chart.insight}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 animate-fade-in">
      <div className="w-8 h-8 rounded-xl bg-plasma-500/10 border border-plasma-500/30 flex items-center justify-center flex-shrink-0">
        <Bot size={14} className="text-plasma-400" />
      </div>
      <div className="glass-panel rounded-2xl rounded-tl-sm px-5 py-3.5 flex items-center gap-1.5">
        {[0,1,2].map(i => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i*150}ms` }} />
        ))}
      </div>
    </div>
  );
}

function getSuggestions(uploadData) {
  const defaults = [
    "What is this dataset about?",
    "How many rows and columns does it have?",
    "What are the column names?",
  ];
  if (!uploadData?.schema_meta?.columns) return defaults;

  const cols     = uploadData.schema_meta.columns;
  const numCols  = cols.filter(c => c.dtype.includes("float") || c.dtype.includes("int")).map(c => c.name);
  const catCols  = cols.filter(c => c.dtype.includes("object")).map(c => c.name);
  const dateCols = cols.filter(c => c.dtype.includes("datetime")).map(c => c.name);

  const suggestions = [
    "What is this dataset about?",
  ];
  if (catCols[0] && numCols[0]) suggestions.push(`Show top 10 ${catCols[0]} by ${numCols[0]}`);
  if (catCols[0])               suggestions.push(`Distribution of ${catCols[0]}`);
  if (numCols[0])               suggestions.push(`Distribution of ${numCols[0]}`);
  if (dateCols[0] && numCols[0]) suggestions.push(`Trend of ${numCols[0]} over time`);
  if (numCols[0] && numCols[1]) suggestions.push(`${numCols[0]} vs ${numCols[1]} scatter`);

  return suggestions.slice(0, 5);
}

// ── Main ChatInterface ────────────────────────────────────────────────────────
export default function ChatInterface({ uploadData }) {
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef();
  const inputRef  = useRef();

  useEffect(() => {
    if (uploadData) {
      setMessages([{
        id: "welcome", role: "assistant", type: "text",
        content: `Dataset loaded: ${uploadData.filename} — ${uploadData.schema_meta?.shape?.rows?.toLocaleString()} rows, ${uploadData.schema_meta?.shape?.columns} columns.\n\nAsk me anything — I'll answer factual questions in text, and show a chart for analytical questions.`,
      }]);
    } else {
      setMessages([{
        id: "welcome", role: "assistant", type: "text",
        content: "Upload a CSV or Excel file from the Dashboard tab, then come back here to ask questions about your data.",
      }]);
    }
  }, [uploadData?.filename]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessage = async (queryText) => {
    const query = (queryText || input).trim();
    if (!query || isLoading) return;

    setMessages(prev => [...prev, { id: Date.now().toString(), role: "user", content: query, type: "text" }]);
    setInput("");
    setIsLoading(true);

    try {
      const res  = await axios.post("/api/chat", { query, session_id: SESSION_ID });
      const data = res.data;

      let assistantMsg = { id: (Date.now()+1).toString(), role: "assistant" };

      if (data.type === "refusal") {
        assistantMsg = { ...assistantMsg, content: data.message, type: "refusal" };

      } else if (data.type === "error") {
        assistantMsg = { ...assistantMsg, content: data.message || "Analysis failed.", type: "error" };

      } else if (data.type === "text") {
        // Pure text answer — no chart rendered
        assistantMsg = { ...assistantMsg, content: data.message, type: "text" };

      } else if (data.type === "chat" && data.chart) {
        assistantMsg = {
          ...assistantMsg,
          content: data.chart.insight || "Here is the analysis:",
          chart:   data.chart,
          type:    "chart",
        };

      } else {
        assistantMsg = { ...assistantMsg, content: JSON.stringify(data, null, 2), type: "text" };
      }

      setMessages(prev => [...prev, assistantMsg]);
    } catch (e) {
      setMessages(prev => [...prev, {
        id: (Date.now()+1).toString(), role: "assistant", type: "error",
        content: e.response?.data?.error || "Network error. Is the backend running?",
      }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const suggestions = getSuggestions(uploadData);

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-4xl mx-auto px-4">
      {/* Header */}
      <div className="flex items-center justify-between py-4 border-b border-white/[0.05] mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-plasma-500/10 border border-plasma-500/30 flex items-center justify-center">
            <Bot size={18} className="text-plasma-400" />
          </div>
          <div>
            <p className="font-display font-700 text-white text-sm">Nexus Analyst</p>
            <p className="text-xs text-slate-500">Text answers · Chart analysis · Groq Llama 3.3</p>
          </div>
        </div>
        {uploadData && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-acid-400/5 border border-acid-400/20">
            <Database size={12} className="text-acid-400" />
            <span className="text-xs font-mono-custom text-acid-400">{uploadData.filename}</span>
          </div>
        )}
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && uploadData && (
        <div className="mb-4 flex-shrink-0">
          <p className="text-xs text-slate-500 mb-2 font-mono-custom uppercase tracking-wider">Try asking:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map(q => (
              <button key={q} onClick={() => sendMessage(q)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-obsidian-800 border border-white/5 text-xs text-slate-400 hover:border-acid-400/30 hover:text-acid-400 transition-all">
                <ChevronRight size={11} />{q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-5 pr-1">
        {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
        {isLoading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="py-4 flex-shrink-0">
        <div className={`flex items-end gap-3 glass-panel rounded-2xl p-2 border transition-all ${
          isLoading ? "border-plasma-500/20" : "border-white/[0.06] focus-within:border-acid-400/30"}`}>
          <textarea ref={inputRef} value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={uploadData ? "Ask anything about your data…" : "Upload a dataset first…"}
            disabled={isLoading || !uploadData}
            rows={1}
            className="flex-1 bg-transparent text-white placeholder-slate-600 text-sm resize-none outline-none px-3 py-2 max-h-32"
            style={{ minHeight: 40 }} />
          <button onClick={() => sendMessage()} disabled={!input.trim() || isLoading || !uploadData}
            className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
              input.trim() && !isLoading && uploadData ? "btn-acid" : "bg-obsidian-700 text-slate-600 cursor-not-allowed"}`}>
            {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
        <p className="text-xs text-slate-700 text-center mt-2">
          Factual questions → text answer · Analytical questions → chart
        </p>
      </div>
    </div>
  );
}