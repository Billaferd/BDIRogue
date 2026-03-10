import { GOAPState, GOAPAction, GOAPPlanner, Intent } from "./goap";

export type Beliefs = GOAPState;
export type Desire = {
  name: string;
  priority: number;
  goalState: Partial<GOAPState>;
};

export interface EnvironmentData {
  hp: number;
  maxHp: number;
  potions: number;
  monsterVisible: boolean;
  newDiscovery: boolean;
  explorationPercentage: number;
}

export class BDIAgent {
  beliefs: Beliefs = {};
  desires: Desire[] = [];
  intention: Desire | null = null;
  currentPlan: GOAPAction[] = [];
  planner = new GOAPPlanner();

  constructor() {}

  perceive(env: EnvironmentData): { logMessages: string[] } {
    const logs: string[] = [];
    const isHurt = env.hp < 60;
    const hasPotion = env.potions > 0;
    const explorationPercentage = env.explorationPercentage || 0; // Assuming this is passed in env

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

    // Recalculate priority values
    const descendDesire = this.desires.find(d => d.name === 'Descend');
    const exploreDesire = this.desires.find(d => d.name === 'Explore Floor');
    const getAmuletDesire = this.desires.find(d => d.name === 'Get Amulet');
    const healDesire = this.desires.find(d => d.name === 'Heal');

    if (isHurt) {
      if (descendDesire) descendDesire.priority = 95;
      if (getAmuletDesire) getAmuletDesire.priority = 95;
      
      // Scale Unlock Door desires when hurt
      this.desires.forEach(d => {
        if (d.name.startsWith('Unlock door_')) {
          d.priority = 90;
        }
      });

      if (exploreDesire) exploreDesire.priority = 10;
      if (healDesire) healDesire.priority = hasPotion ? 98 : 80;
    } else {
      // Priority of descending/amulet increases as exploration progresses
      if (descendDesire) descendDesire.priority = Math.max(10, explorationPercentage);
      if (getAmuletDesire) getAmuletDesire.priority = Math.max(10, explorationPercentage);
      
      // Scale Unlock Door desires as well
      this.desires.forEach(d => {
        if (d.name.startsWith('Unlock door_')) {
          d.priority = Math.max(25, explorationPercentage);
        }
      });

      // Priority of exploration scales inversely with percentage explored
      if (exploreDesire) exploreDesire.priority = Math.max(10, 100 - explorationPercentage);
      if (healDesire) healDesire.priority = 90;
    }

    return { logMessages: logs };
  }

  updateBeliefs(newBeliefs: Partial<Beliefs>) {
    this.beliefs = { ...this.beliefs, ...newBeliefs };
  }

  addDesire(desire: Desire) {
    this.desires.push(desire);
  }

  deliberate(actions: GOAPAction[], distanceCalculator?: (targetId: string) => number) {
    // Sort desires by priority (highest first)
    this.desires.sort((a, b) => b.priority - a.priority);

    for (const desire of this.desires) {
      // Check if desire is already met
      let met = true;
      for (const key in desire.goalState) {
        if (this.beliefs[key] !== desire.goalState[key]) {
          met = false;
          break;
        }
      }

      if (!met) {
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
