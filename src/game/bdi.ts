import { GOAPState, GOAPAction, GOAPPlanner, Intent } from "./goap";
import { AgentConfiguration, DEFAULT_AGENT_CONFIG } from "./types";

export type Beliefs = GOAPState;
export type Desire = {
  name: string;
  priority: number;
  goalState: Partial<GOAPState>;
};

export type EnvironmentData = {
  hp: number;
  maxHp: number;
  potions: number;
  monsterVisible: boolean;
  newDiscovery: boolean;
  explorationPercentage: number;
};

export class BDIAgent {
  beliefs: Beliefs = {
    hp_low: false,
    is_alive: true,
    has_amulet: false,
    has_key: false,
    has_potion: false,
    has_explosive: false,
    floor_cleared: false,
    has_unknown_tiles: true,
    barricade_destroyed: true,
    monster_threat: false,
    unseen_entity_is_large: false,
    item_is_beneficial: false,
    entityStates: {}
  };
  desires: Desire[] = [];
  intention: Desire | null = null;
  currentPlan: GOAPAction[] = [];
  planner = new GOAPPlanner();
  config: AgentConfiguration;

  constructor(config: AgentConfiguration = DEFAULT_AGENT_CONFIG) {
    this.config = config;
  }

  perceive(env: EnvironmentData): { logMessages: string[] } {
    const logs: string[] = [];
    const isHurt = env.hp < this.config.thresholds.hpLow;
    const hasPotion = env.potions > 0;

    const oldMonsterThreat = this.beliefs.monster_threat;

    this.updateBeliefs({
      hp_low: isHurt,
      has_potion: hasPotion,
      monster_threat: env.monsterVisible,
    });

    if (env.newDiscovery) {
      logs.push("New entity spotted! Interrupting current plan.");
      this.currentPlan = [];
    }

    if (env.monsterVisible && !oldMonsterThreat) {
      logs.push("Monster threat detected! Replanning for survival.");
      this.currentPlan = [];
    }

    return { logMessages: logs };
  }

  updateBeliefs(newBeliefs: Partial<Beliefs>) {
    for (const key in newBeliefs) {
      if (key === 'entityStates' && newBeliefs.entityStates) {
        this.beliefs.entityStates = { ...this.beliefs.entityStates, ...newBeliefs.entityStates };
      } else {
        const k = key as keyof Omit<Beliefs, 'entityStates'>;
        (this.beliefs as any)[k] = newBeliefs[k];
      }
    }
  }

  addDesire(desire: Desire) {
    if (!this.desires.some(d => d.name === desire.name)) {
      this.desires.push(desire);
    }
  }

  deliberate(actions: GOAPAction[], distanceCalculator?: (targetId: string) => number) {
    // Sort desires by priority (highest first)
    this.desires.sort((a, b) => b.priority - a.priority);

    for (const desire of this.desires) {
      // Check if desire is already met using formalized comparison
      if (!this.isGoalMet(this.beliefs, desire.goalState)) {
        // Try to form a plan
        const plan = this.planner.plan(this.beliefs, desire.goalState, actions, distanceCalculator);
        if (plan && plan.length > 0) {
          this.intention = desire;
          this.currentPlan = plan;
          return; // Found a valid intention and plan
        }
      }
    }

    // No valid plan found for any desire
    this.intention = null;
    this.currentPlan = [];
  }

  private isGoalMet(state: Beliefs, goal: Partial<Beliefs>): boolean {
    for (const key in goal) {
      if (key === 'entityStates' && goal.entityStates) {
        for (const entityKey in goal.entityStates) {
          if (state.entityStates[entityKey] !== goal.entityStates[entityKey]) return false;
        }
      } else {
        const k = key as keyof Omit<Beliefs, 'entityStates'>;
        if (state[k] !== goal[k]) return false;
      }
    }
    return true;
  }

  executeNextAction(): Intent | null {
    if (this.currentPlan.length > 0) {
      const action = this.currentPlan[0];
      if (action.execute) {
        const response = action.execute();
        if (response.status === 'completed') {
          this.currentPlan.shift(); // Remove executed action
        } else if (response.status === 'failed') {
          // Action failed, need to replan
          this.currentPlan = [];
          this.intention = null;
        }
        return response.intent;
      }
    }
    return null;
  }
}
