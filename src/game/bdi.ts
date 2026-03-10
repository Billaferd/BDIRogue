import { GOAPState, GOAPAction, GOAPPlanner } from "./goap";

export type Beliefs = GOAPState;
export type Desire = {
  name: string;
  priority: number;
  goalState: Partial<GOAPState>;
};

export class BDIAgent {
  beliefs: Beliefs = {};
  desires: Desire[] = [];
  intention: Desire | null = null;
  currentPlan: GOAPAction[] = [];
  planner = new GOAPPlanner();

  constructor() {}

  updateBeliefs(newBeliefs: Partial<Beliefs>) {
    this.beliefs = { ...this.beliefs, ...newBeliefs };
  }

  addDesire(desire: Desire) {
    this.desires.push(desire);
  }

  deliberate(actions: GOAPAction[]) {
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
        const plan = this.planner.plan(this.beliefs, desire.goalState, actions);
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

  executeNextAction(): boolean {
    if (this.currentPlan.length > 0) {
      const action = this.currentPlan[0];
      if (action.execute) {
        const success = action.execute();
        if (success) {
          this.currentPlan.shift(); // Remove executed action
          return true;
        } else {
          // Action failed, need to replan
          this.currentPlan = [];
          this.intention = null;
          return false;
        }
      }
    }
    return false;
  }
}
