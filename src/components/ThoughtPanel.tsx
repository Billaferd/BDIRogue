import React from 'react';
import { Brain } from 'lucide-react';

interface ThoughtPanelProps {
  thoughts: string[];
}

export const ThoughtPanel: React.FC<ThoughtPanelProps> = ({ thoughts }) => {
  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <Brain className="text-fuchsia-400" size={20} />
        <h2 className="text-xl font-semibold text-white">Agent Thoughts</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-3 font-mono text-base pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {thoughts.length === 0 ? (
          <div className="text-slate-500 italic">No active thoughts...</div>
        ) : (
          [...thoughts].reverse().map((thought, idx) => {
            const isTurnHeader = thought.startsWith('---');
            return (
              <div 
                key={idx} 
                className={`p-3 rounded-lg border ${isTurnHeader ? 'bg-slate-950 border-slate-700 text-slate-400 text-center text-sm mt-6 mb-2 font-bold' : 'bg-slate-800/50 border-slate-700 text-fuchsia-100'}`}
              >
                {!isTurnHeader && <span className="text-fuchsia-500 mr-2 font-black">{'>>'}</span>}
                {thought}
              </div>
            );
          })
        )}
      </div>
      
      <div className="mt-4 pt-4 border-t border-slate-800 text-[10px] text-slate-500 uppercase tracking-widest flex justify-between items-center">
        <span>Real-time BDI Deliberation Engine</span>
        <span className="text-fuchsia-500/50">v2.1.0</span>
      </div>
    </div>
  );
};
