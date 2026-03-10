export type Position = { x: number; y: number };

export type EntityType = 'rogue' | 'wall' | 'door' | 'key' | 'chest' | 'mimic' | 'amulet' | 'monster' | 'floor' | 'stairs_down' | 'health_potion';

export interface Entity {
  id: string;
  type: EntityType;
  pos: Position;
  hp?: number;
  potions?: number;
  isLocked?: boolean;
  isOpen?: boolean;
  isMimic?: boolean;
  isBreathing?: boolean; // Evidence for Bayesian
  suspiciousLocation?: boolean; // Evidence for Bayesian
  hasKey?: boolean; // Does this chest have the key?
  isExplored?: boolean; // Has the agent seen this tile?
  isVisible?: boolean;  // Is it currently in FOV?
}

export interface GameState {
  grid: Entity[][];
  entities: Entity[];
  rogue: Entity;
  turn: number;
  log: string[];
  currentFloor: number;
  maxFloor: number;
}
