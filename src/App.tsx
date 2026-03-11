import React, { useEffect, useState } from "react";
import { GameEngine } from "./game/engine";
import { GridMap } from "./components/GridMap";
import { AgentStatePanel } from "./components/AgentStatePanel";
import { ThoughtPanel } from "./components/ThoughtPanel";
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
    <div className="h-screen bg-slate-950 text-slate-200 p-4 md:p-6 font-sans overflow-hidden flex flex-col">
      <header className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase">
            Cognitive<span className="text-fuchsia-500">Rogue</span>
          </h1>
          <p className="text-slate-500 font-mono text-xs tracking-widest uppercase">
            Autonomous BDI • GOAP • Knowledge Graph
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-900/50 p-2 rounded-2xl border border-slate-800 shadow-2xl">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-all font-bold text-sm ${isPlaying ? "bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 ring-1 ring-rose-500/50" : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 ring-1 ring-emerald-500/50"}`}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            {isPlaying ? "PAUSE" : "RESUME"}
          </button>
          
          <div className="flex gap-1">
            <button
              onClick={handleStep}
              disabled={isPlaying}
              className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 transition-all border border-slate-700"
              title="Step Forward"
            >
              <StepForward size={18} />
            </button>
            <button
              onClick={handleReset}
              className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all border border-slate-700"
              title="Reset Simulation"
            >
              <RotateCcw size={18} />
            </button>
          </div>

          <div className="h-8 w-px bg-slate-800 mx-2 hidden md:block"></div>

          <div className="hidden md:flex flex-col text-[10px] text-slate-500 px-2 uppercase font-black tracking-tighter">
            <label>Tickspeed</label>
            <select
              value={tickRate}
              onChange={(e) => setTickRate(Number(e.target.value))}
              className="bg-transparent text-white outline-none cursor-pointer hover:text-fuchsia-400 transition-colors"
            >
              <option value={1000}>1.0s (Slow)</option>
              <option value={500}>0.5s (Norm)</option>
              <option value={100}>0.1s (Fast)</option>
              <option value={10}>0.01s (Max)</option>
            </select>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0 overflow-hidden">
        {/* Left: Map & Quick Stats */}
        <section className="lg:flex-[1.5] flex flex-col gap-6 min-h-0">
          <div className="bg-slate-900 rounded-3xl border border-slate-800 p-4 shadow-2xl flex-1 flex items-center justify-center relative overflow-hidden group">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(15,23,42,0)_0%,rgba(2,6,23,0.4)_100%)] pointer-events-none" />
            <GridMap state={engine.state} />
            
            {/* Quick Map Overlay Info */}
            <div className="absolute bottom-4 left-4 flex gap-2">
              <div className="px-3 py-1 bg-slate-950/80 backdrop-blur-md rounded-lg border border-slate-800 text-[10px] font-mono text-slate-400">
                FLOOR <span className="text-white font-bold">{engine.state.currentFloor}</span>
              </div>
              <div className="px-3 py-1 bg-slate-950/80 backdrop-blur-md rounded-lg border border-slate-800 text-[10px] font-mono text-slate-400">
                TURN <span className="text-white font-bold">{engine.state.turn}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Middle: Cognitive Feed */}
        <section className="lg:flex-1 flex flex-col min-h-0">
          <ThoughtPanel thoughts={engine.state.thoughts} />
        </section>

        {/* Right: Detailed State */}
        <aside className="lg:w-[320px] xl:w-[380px] shrink-0 flex flex-col min-h-0">
          <AgentStatePanel engine={engine} />
        </aside>
      </main>
    </div>
  );
}
