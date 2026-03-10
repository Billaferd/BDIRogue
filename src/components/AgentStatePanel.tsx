import React from "react";
import { GameEngine } from "../game/engine";

export function AgentStatePanel({ engine }: { engine: GameEngine }) {
  const { bdi, kg, state } = engine;

  return (
    <div className="flex flex-col gap-4 text-sm font-mono text-slate-300">
      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-lg">
        <h3 className="text-emerald-400 font-bold mb-2 uppercase tracking-wider">
          BDI State
        </h3>
        <div className="grid grid-cols-1 gap-2">
          <div>
            <span className="text-slate-500">Intention:</span>
            <br />
            <span className="text-white">{bdi.intention?.name || "None"}</span>
          </div>
          <div>
            <span className="text-slate-500">Current Plan:</span>
            <br />
            <span className="text-white">
              {bdi.currentPlan.length > 0
                ? bdi.currentPlan.map((a) => a.name).join(" -> ")
                : "None"}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-lg h-48 overflow-y-auto">
        <h3 className="text-amber-400 font-bold mb-2 uppercase tracking-wider">
          Beliefs
        </h3>
        <ul className="space-y-1">
          {Object.entries(bdi.beliefs).map(([key, value]) => (
            <li key={key}>
              <span className="text-slate-400">{key}:</span>{" "}
              <span className={value ? "text-emerald-300" : "text-rose-300"}>
                {String(value)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-lg h-48 overflow-y-auto">
        <h3 className="text-fuchsia-400 font-bold mb-2 uppercase tracking-wider">
          Knowledge Graph
        </h3>
        <ul className="space-y-1 text-xs">
          {kg.triples.map((t, i) => (
            <li key={i}>
              <span className="text-sky-300">{t.subject}</span>
              <span className="text-slate-500 mx-1">--{t.predicate}--&gt;</span>
              <span className="text-amber-200">{t.object}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-lg h-48 overflow-y-auto">
        <h3 className="text-sky-400 font-bold mb-2 uppercase tracking-wider">
          Event Log
        </h3>
        <ul className="space-y-1 text-xs">
          {state.log.map((msg, i) => (
            <li key={i} className="text-slate-300">
              {msg}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
