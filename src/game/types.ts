export interface AgentConfiguration {
  thresholds: {
    hpLow: number;
    mimicHigh: number;
    mimicLow: number;
    eliteMonster: number;
    beneficialItem: number;
    explorationScale: number;
  };
  costs: {
    move: number;
    heal: number;
    attackBase: number;
    fleeBase: number;
    pickup: number;
    unlockDoor: number;
    descendStairs: number;
    getAmulet: number;
    openChestBase: number;
    destroyBarricade: number;
    mimicPenalty: number;
    hurtPenaltyMultiplier: number;
  };
  priorities: {
    stayAlive: number;
    healBase: number;
    exploreBase: number;
    descendBase: number;
    getAmuletBase: number;
    unlockDoorBase: number;
    collectPotionBase: number;
  };
  mechanics: {
    visionRadius: number;
    maxFloor: number;
    logLimit: number;
    mimicAttackDamage: number;
    monsterAttackDamage: number;
    playerAttackDamage: number;
    potionHealAmount: number;
    monsterBaseHp: number;
    monsterHpScale: number;
    stuckThreshold: number;
  };
  bayesian: {
    defaultMimicPrior: number;
    signalHigh: number;
    signalLow: number;
    contextHigh: number;
    contextLow: number;
    environmentalHigh: number;
    environmentalLow: number;
  };
}

export const DEFAULT_AGENT_CONFIG: AgentConfiguration = {
  thresholds: {
    hpLow: 60,
    mimicHigh: 0.5,
    mimicLow: 0.2,
    eliteMonster: 0.8,
    beneficialItem: 0.8,
    explorationScale: 100,
  },
  costs: {
    move: 1,
    heal: 1,
    attackBase: 1,
    fleeBase: 1,
    pickup: 2,
    unlockDoor: 1,
    descendStairs: 1,
    getAmulet: 1,
    openChestBase: 1,
    destroyBarricade: 1,
    mimicPenalty: 50,
    hurtPenaltyMultiplier: 10,
  },
  priorities: {
    stayAlive: 100,
    healBase: 90,
    exploreBase: 20,
    descendBase: 10,
    getAmuletBase: 10,
    unlockDoorBase: 25,
    collectPotionBase: 30,
  },
  mechanics: {
    visionRadius: 5,
    maxFloor: 5,
    logLimit: 20,
    mimicAttackDamage: 50,
    monsterAttackDamage: 10,
    playerAttackDamage: 15,
    potionHealAmount: 50,
    monsterBaseHp: 20,
    monsterHpScale: 10,
    stuckThreshold: 3,
  },
  bayesian: {
    defaultMimicPrior: 0.1,
    signalHigh: 0.8,
    signalLow: 0.1,
    contextHigh: 0.7,
    contextLow: 0.2,
    environmentalHigh: 0.6,
    environmentalLow: 0.3,
  },
};

export type Position = { x: number; y: number };

export type EntityTrait = 'blue' | 'high_viscosity' | 'large' | 'fast' | 'breathing' | 'suspicious' | 'locked' | 'open' | 'mimic' | 'amulet' | 'wall' | 'door' | 'floor' | 'stairs' | 'rogue' | 'key' | 'auditory_cadence_heavy' | 'auditory_cadence_light' | 'blood_splatter' | 'barricade' | 'explosive' | 'chest';

export interface BaseEntity {
  id: string;
  traits: EntityTrait[];
  pos: Position;
  lastPos?: Position;
  isExplored?: boolean; // Has the agent seen this tile?
  isVisible?: boolean;  // Is it currently in FOV?
  currentPath?: Position[]; // For incremental pathfinding
}

export interface ActorEntity extends BaseEntity {
  type: 'actor';
  hp: number;
  potions: number;
}

export interface ItemEntity extends BaseEntity {
  type: 'item';
  // Properties relevant to inventory management can be added here
}

export interface FixtureEntity extends BaseEntity {
  type: 'fixture';
}

export type Entity = ActorEntity | ItemEntity | FixtureEntity;

export interface GameState {
  grid: Entity[][];
  entities: Entity[];
  rogue: ActorEntity;
  turn: number;
  log: string[];
  currentFloor: number;
  maxFloor: number;
  frontierTiles: Position[];
  unreachableFrontier: Position[];
  thoughts: string[];
  lastThoughts: string[];
}
