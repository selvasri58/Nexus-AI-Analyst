import React from "react";
import { LayoutDashboard, MessageSquare, Brain } from "lucide-react";

export default function ViewToggle({ activeView, onViewChange, hasData }) {
  return (
    <div className="flex items-center gap-2 bg-obsidian-800 rounded-xl p-1 border border-white/5">
      <button
        onClick={() => onViewChange("dashboard")}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-display font-600 transition-all duration-300 ${
          activeView === "dashboard"
            ? "bg-acid-400 text-obsidian-950 shadow-lg shadow-acid-400/20"
            : "text-slate-400 hover:text-white hover:bg-white/5"
        }`}
      >
        <LayoutDashboard size={15} />
        <span>Dashboard</span>
      </button>
      <button
        onClick={() => onViewChange("chat")}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-display font-600 transition-all duration-300 ${
          activeView === "chat"
            ? "bg-acid-400 text-obsidian-950 shadow-lg shadow-acid-400/20"
            : "text-slate-400 hover:text-white hover:bg-white/5"
        }`}
      >
        <MessageSquare size={15} />
        <span>Analyst Chat</span>
      </button>
    </div>
  );
}
