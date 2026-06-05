import React, { useState, useEffect } from "react";
import DashboardGrid from "./components/DashboardGrid";
import ChatInterface from "./components/ChatInterface";
import ViewToggle from "./components/ViewToggle";
import { BarChart3, Activity, Zap } from "lucide-react";

export default function App() {
  const [activeView,   setActiveView]   = useState("dashboard");
  const [uploadData,   setUploadData]   = useState(null);
  const [backendOnline, setBackendOnline] = useState(null);

  useEffect(() => {
    fetch("/api/health")
      .then(r => r.json())
      .then(d => setBackendOnline(d.status === "ok"))
      .catch(() => setBackendOnline(false));
  }, []);

  return (
    <div className="min-h-screen bg-obsidian-950 grid-bg relative overflow-x-hidden">
      {/* Ambient blobs */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-acid-400/[0.03] rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-80 h-80 bg-plasma-500/[0.04] rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-50 glass-panel border-b border-white/[0.04]">
        <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-acid-400/10 border border-acid-400/20 flex items-center justify-center">
              <BarChart3 size={16} className="text-acid-400" />
            </div>
            <span className="font-display font-800 text-white text-lg tracking-tight">NEXUS</span>
            <span className="hidden sm:block tag bg-acid-400/10 text-acid-400 border border-acid-400/20">AI Analyst</span>
          </div>

          <ViewToggle activeView={activeView} onViewChange={setActiveView} hasData={!!uploadData} />

          <div className="flex items-center gap-3">
            <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono-custom ${
              backendOnline === null ? "border-slate-700 text-slate-600"
              : backendOnline ? "border-acid-400/20 bg-acid-400/5 text-acid-400"
              : "border-ember-400/20 bg-ember-400/5 text-ember-400"}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${
                backendOnline === null ? "bg-slate-600"
                : backendOnline ? "bg-acid-400 animate-pulse"
                : "bg-ember-400"}`} />
              {backendOnline === null ? "checking" : backendOnline ? "flask online" : "offline"}
            </div>
            <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-600">
              <Zap size={11} className="text-slate-600" />
              <span>Groq · LangGraph</span>
            </div>
          </div>
        </div>
      </header>

      {/* Backend offline warning */}
      {backendOnline === false && (
        <div className="max-w-screen-2xl mx-auto px-6 pt-4">
          <div className="bg-ember-400/10 border border-ember-400/20 rounded-xl px-5 py-3 flex items-center gap-3 text-sm text-ember-300">
            <Activity size={16} className="text-ember-400 flex-shrink-0" />
            <div>
              <strong className="font-display">Backend offline.</strong>{" "}
              Run <code className="font-mono-custom text-xs bg-ember-400/10 px-1.5 py-0.5 rounded">python app.py</code> and
              set your <code className="font-mono-custom text-xs bg-ember-400/10 px-1.5 py-0.5 rounded">GROQ_API_KEY</code> in <code className="font-mono-custom text-xs bg-ember-400/10 px-1.5 py-0.5 rounded">.env</code>.
            </div>
          </div>
        </div>
      )}

      {/* Main — BOTH views always mounted, just hidden/shown */}
      <main className="max-w-screen-2xl mx-auto">
        {/* Dashboard — always mounted so state is preserved */}
        <div style={{ display: activeView === "dashboard" ? "block" : "none" }}>
          <DashboardGrid uploadData={uploadData} onUploadData={setUploadData} />
        </div>

        {/* Chat — always mounted so messages are preserved */}
        <div style={{ display: activeView === "chat" ? "block" : "none" }}>
          <ChatInterface uploadData={uploadData} />
        </div>
      </main>
    </div>
  );
}