import React from "react";
import { GameState } from "../game/types";
import { User, DoorClosed, DoorOpen, Box, Gem, Skull, FlaskConical, ArrowDownSquare } from "lucide-react";

export function GridMap({ state }: { state: GameState }) {
  return (
    <div
      className="grid gap-0 border-2 border-slate-800 bg-black rounded-xl overflow-hidden"
      style={{
        gridTemplateColumns: `repeat(${state.grid[0].length}, minmax(0, 1fr))`,
      }}
    >
      {state.grid.map((row, y) =>
        row.map((cell, x) => {
          const entities = state.entities.filter(
            (e) => e.pos.x === x && e.pos.y === y,
          );
          const floor = state.grid[y][x];
          
          const isExplored = floor?.isExplored;
          const isVisible = floor?.isVisible;

          if (!isExplored) {
            return <div key={`${x}-${y}`} className="aspect-square bg-black" />;
          }

          // Prioritize non-floor, non-wall entities
          const topEntity =
            entities.find((e) => e.type !== "floor" && e.type !== "wall") ||
            entities.find((e) => e.type === "wall") ||
            floor;

          let content = null;
          if (topEntity) {
            switch (topEntity.type) {
              case "rogue":
                content = (
                  <User className="text-emerald-400 w-full h-full p-1 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                );
                break;
              case "wall":
                content = <div className="bg-slate-700 w-full h-full" />;
                break;
              case "door":
                content = topEntity.isOpen ? (
                  <DoorOpen className="text-amber-600 w-full h-full p-1" />
                ) : (
                  <DoorClosed className="text-amber-700 w-full h-full p-1" />
                );
                break;
              case "chest":
                content = <Box className="text-amber-400 w-full h-full p-1" />;
                break;
              case "amulet":
                content = (
                  <Gem className="text-fuchsia-400 w-full h-full p-1 drop-shadow-[0_0_8px_rgba(232,121,249,0.8)]" />
                );
                break;
              case "monster":
                content = (
                  <Skull className="text-rose-500 w-full h-full p-1 drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                );
                break;
              case "health_potion":
                content = (
                  <FlaskConical className="text-red-400 w-full h-full p-1.5 drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]" />
                );
                break;
              case "stairs_down":
                content = (
                  <ArrowDownSquare className="text-indigo-400 w-full h-full p-1 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
                );
                break;
              case "floor":
                content = <div className="bg-slate-900 w-full h-full" />;
                break;
            }
          }

          return (
            <div
              key={`${x}-${y}`}
              className={`aspect-square flex items-center justify-center border border-slate-800/50 transition-all duration-300 ${isVisible ? 'opacity-100' : 'opacity-30'}`}
            >
              {content}
            </div>
          );
        }),
      )}
    </div>
  );
}
