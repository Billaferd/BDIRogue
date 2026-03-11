import React from "react";
import { GameEngine } from "../game/engine";
import { Activity, Brain, Database, ListChecks } from "lucide-react";

export function AgentStatePanel({ engine }: { engine: GameEngine }) {
  const { bdi, kg, state } = engine;

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 mb-6 shrink-0">
        <Activity className="text-emerald-400" size={20} />
        <h2 className="text-xl font-semibold text-white">Cognitive State</h2>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {/* Core Vitals */}
        <section aria-label="Core Vitals">
          <div className="flex justify-between items-end mb-2">
            <span className="text-slate-400 text-sm font-bold uppercase tracking-wider">Health Points</span>
            <span className="text-emerald-400 font-mono text-xl font-black">{state.rogue.hp}/100</span>
          </div>
          <div className="h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
            <div 
              className="h-full bg-emerald-500 transition-all duration-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
              style={{ width: `${state.rogue.hp}%` }}
            />
          </div>
          <div className="mt-4 flex justify-between text-base">
            <span className="text-slate-400">Inventory</span>
            <span className="text-amber-400 font-mono font-bold">{state.rogue.potions} Potions</span>
          </div>
          <div className="mt-1 flex justify-between text-base">
            <span className="text-slate-400">Location</span>
            <span className="text-blue-400 font-mono font-bold">Floor {state.currentFloor}/{state.maxFloor}</span>
          </div>
        </section>

        {/* Current Intention */}
        <section aria-label="Current Intention">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="text-fuchsia-400" size={16} />
            <h3 className="text-slate-500 uppercase text-xs tracking-widest font-black">Active Intention</h3>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
            {bdi.intention ? (
              <div>
                <div className="text-fuchsia-400 font-bold text-base mb-1">{bdi.intention.name}</div>
                <div className="text-slate-500 text-xs font-mono">Priority: {bdi.intention.priority.toFixed(1)}</div>
              </div>
            ) : (
              <div className="text-slate-600 italic text-base">No active intention</div>
            )}
          </div>
        </section>

        {/* GOAP Plan */}
        <section aria-label="Strategic Plan">
          <div className="flex items-center gap-2 mb-3">
            <ListChecks className="text-sky-400" size={16} />
            <h3 className="text-slate-500 uppercase text-xs tracking-widest font-black">Strategic Plan</h3>
          </div>
          <div className="space-y-3 pl-2">
            {bdi.currentPlan.length > 0 ? (
              bdi.currentPlan.map((action, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-sky-500 shadow-[0_0_5px_rgba(56,189,248,0.5)]" />
                  <div className="text-slate-200 text-base font-mono">{action.name}</div>
                </div>
              ))
            ) : (
              <div className="text-slate-600 italic text-base text-center py-2">Calculating trajectory...</div>
            )}
          </div>
        </section>

        {/* Knowledge Graph */}
        <section aria-label="Knowledge Graph">
          <div className="flex items-center gap-2 mb-3">
            <Database className="text-amber-400" size={16} />
            <h3 className="text-slate-500 uppercase text-xs tracking-widest font-black">Knowledge Graph</h3>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 max-h-60 overflow-y-auto font-mono text-sm">
            {kg.triples.length > 0 ? (
              <ul className="space-y-2">
                {kg.triples.map((t, i) => (
                  <li key={i} className="flex items-center flex-wrap gap-2 leading-tight">
                    <span className="text-sky-300 font-bold">{t.subject}</span>
                    <span className="text-slate-600 text-[10px]">→</span>
                    <span className="text-slate-400">{t.predicate}</span>
                    <span className="text-slate-600 text-[10px]">→</span>
                    <span className="text-amber-200 font-bold">{t.object}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-slate-600 italic text-center py-2 text-base">Graph is empty...</div>
            )}
          </div>
        </section>

        {/* Event Logs */}
        <section aria-label="Recent Events" className="pb-4">
          <h3 className="text-slate-500 uppercase text-xs tracking-widest font-black mb-3 border-t border-slate-800 pt-4">Recent Events</h3>
          <div className="space-y-2">
            {state.log.slice(0, 8).map((msg, idx) => (
              <div key={idx} className="text-sm text-slate-400 font-mono leading-snug border-l-2 border-slate-800 pl-3">
                {msg}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
