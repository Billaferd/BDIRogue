import React, { useEffect, useState } from "react";
import { GameEngine } from "./game/engine";
import { GridMap } from "./components/GridMap";
import { AgentStatePanel } from "./components/AgentStatePanel";
import { Play, Pause, StepForward, RotateCcw } from "lucide-react";

export default function App() {
  const [engine, setEngine] = useState<GameEngine>(new GameEngine());
  const [isPlaying, setIsPlaying] = useState(false);
  const [tickRate, setTickRate] = useState(500);
  const [, setRenderTrigger] = useState(0); // Force re-render

  useEffect(() => {
    engine.onUpdate = () => {
      setRenderTrigger((prev) => prev + 1);
    };
  }, [engine]);

  useEffect(() => {
    let interval: number | undefined;
    if (isPlaying) {
      interval = window.setInterval(() => {
        engine.tick();
      }, tickRate);
    }
    return () => clearInterval(interval);
  }, [isPlaying, engine, tickRate]);

  const handleStep = () => {
    engine.tick();
  };

  const handleReset = () => {
    setIsPlaying(false);
    const newEngine = new GameEngine();
    newEngine.onUpdate = () => setRenderTrigger((prev) => prev + 1);
    setEngine(newEngine);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">
              Cognitive Rogue
            </h1>
            <p className="text-slate-400">
              Autonomous Agent Simulation (GOAP + BDI + KG)
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-900 p-2 rounded-xl border border-slate-800">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`p-2 rounded-lg flex items-center gap-2 transition-colors ${isPlaying ? "bg-rose-500/20 text-rose-400 hover:bg-rose-500/30" : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"}`}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              {isPlaying ? "Pause" : "Auto-Play"}
            </button>
            <button
              onClick={handleStep}
              disabled={isPlaying}
              className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors"
              title="Step Forward"
            >
              <StepForward size={20} />
            </button>
            <button
              onClick={handleReset}
              className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
              title="Reset Simulation"
            >
              <RotateCcw size={20} />
            </button>

            <div className="h-8 w-px bg-slate-700 mx-2"></div>

            <div className="flex flex-col text-xs text-slate-400 px-2">
              <label>Speed</label>
              <select
                value={tickRate}
                onChange={(e) => setTickRate(Number(e.target.value))}
                className="bg-transparent text-white outline-none"
              >
                <option value={1000}>Slow</option>
                <option value={500}>Normal</option>
                <option value={100}>Fast</option>
                <option value={10}>Max</option>
              </select>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 flex flex-col items-center justify-start">
            <GridMap state={engine.state} />

            <div className="mt-8 w-full bg-slate-900 p-6 rounded-2xl border border-slate-800">
              <h2 className="text-xl font-semibold text-white mb-4">
                Simulation Status
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 text-center">
                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">
                    Floor
                  </div>
                  <div className="text-2xl font-mono text-white">
                    {engine.state.currentFloor}/{engine.state.maxFloor}
                  </div>
                </div>
                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">
                    Turn
                  </div>
                  <div className="text-2xl font-mono text-white">
                    {engine.state.turn}
                  </div>
                </div>
                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">
                    HP
                  </div>
                  <div
                    className={`text-2xl font-mono ${engine.state.rogue.hp! > 50 ? "text-emerald-400" : "text-rose-400"}`}
                  >
                    {engine.state.rogue.hp}
                  </div>
                </div>
                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">
                    Potions
                  </div>
                  <div className="text-2xl font-mono text-red-400">
                    {engine.state.rogue.potions || 0}
                  </div>
                </div>
                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">
                    Amulet
                  </div>
                  <div
                    className={`text-2xl font-mono ${engine.bdi.beliefs.has_amulet ? "text-fuchsia-400" : "text-slate-500"}`}
                  >
                    {engine.bdi.beliefs.has_amulet ? "YES" : "NO"}
                  </div>
                </div>
                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">
                    Status
                  </div>
                  <div
                    className={`text-xl font-mono flex items-center justify-center h-8 ${!engine.bdi.beliefs.is_alive ? "text-rose-500" : engine.bdi.beliefs.has_amulet ? "text-fuchsia-400" : "text-emerald-400"}`}
                  >
                    {!engine.bdi.beliefs.is_alive
                      ? "DEAD"
                      : engine.bdi.beliefs.has_amulet
                        ? "VICTORY"
                        : "ACTIVE"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <AgentStatePanel engine={engine} />
          </div>
        </div>
      </div>
    </div>
  );
}
