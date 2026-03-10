export type Position = { x: number; y: number };

export type EntityTrait = 'blue' | 'high_viscosity' | 'large' | 'fast' | 'breathing' | 'suspicious' | 'locked' | 'open' | 'mimic' | 'amulet' | 'wall' | 'door' | 'floor' | 'stairs' | 'rogue' | 'key' | 'auditory_cadence_heavy' | 'auditory_cadence_light' | 'blood_splatter' | 'barricade' | 'explosive' | 'chest';

export interface Entity {
  id: string;
  traits: EntityTrait[];
  pos: Position;
  lastPos?: Position;
  hp?: number;
  potions?: number;
  isExplored?: boolean; // Has the agent seen this tile?
  isVisible?: boolean;  // Is it currently in FOV?
  currentPath?: Position[]; // For incremental pathfinding
}

export interface GameState {
  grid: Entity[][];
  entities: Entity[];
  rogue: Entity;
  turn: number;
  log: string[];
  currentFloor: number;
  maxFloor: number;
  frontierTiles: Position[];
  unreachableFrontier: Position[];
  thoughts: string[];
}
