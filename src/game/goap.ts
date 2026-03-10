export type GOAPState = Record<string, boolean | number | string>;
// Added reduce_unknown_tiles for exploration goal
// export type GOAPState = Record<string, boolean | number | string> & { reduce_unknown_tiles: boolean };


export type Intent = 
  | { type: 'MOVE'; dx: number; dy: number; reason?: string }
  | { type: 'ATTACK'; targetId: string }
  | { type: 'HEAL' }
  | { type: 'OPEN_DOOR'; targetId: string }
  | { type: 'OPEN_CHEST'; targetId: string }
  | { type: 'PICK_UP'; targetId: string }
  | { type: 'DESCEND' }
  | { type: 'EXPLORE'; dx: number; dy: number; reason?: string }
  | { type: 'DESTROY'; targetId: string };

export type ActionResponse = {
  intent: Intent | null;
  status: 'completed' | 'in_progress' | 'failed';
};

export interface GOAPAction {
  name: string;
  cost: number;
  preconditions: Partial<GOAPState>;
  effects: Partial<GOAPState>;
  // function to execute the action in the game world
  execute?: () => ActionResponse;
}

interface Node {
  state: GOAPState;
  action: GOAPAction | null;
  parent: Node | null;
  g: number;
  h: number;
}

export class GOAPPlanner {
  plan(
    startState: GOAPState,
    goalState: Partial<GOAPState>,
    actions: GOAPAction[],
    distanceCalculator?: (targetId: string) => number
  ): GOAPAction[] | null {
    const openList: Node[] = [];
    const closedList: Node[] = [];

    const startNode: Node = {
      state: { ...startState },
      action: null,
      parent: null,
      g: 0,
      h: this.calculateHeuristic(startState, goalState, actions, distanceCalculator),
    };

    openList.push(startNode);

    while (openList.length > 0) {
      // Sort by f = g + h
      openList.sort((a, b) => a.g + a.h - (b.g + b.h));
      const current = openList.shift()!;

      if (this.isGoalMet(current.state, goalState)) {
        return this.buildPlan(current);
      }

      closedList.push(current);

      for (const action of actions) {
        if (this.arePreconditionsMet(current.state, action.preconditions)) {
          const nextState = { ...current.state, ...action.effects };

          // Check if we already visited this state (simplified check)
          const isClosed = closedList.some((n) =>
            this.statesEqual(n.state, nextState),
          );
          if (isClosed) continue;

          const g = current.g + action.cost;
          const h = this.calculateHeuristic(nextState, goalState, actions, distanceCalculator);

          const existingNode = openList.find((n) =>
            this.statesEqual(n.state, nextState),
          );
          if (existingNode) {
            if (g < existingNode.g) {
              existingNode.g = g;
              existingNode.parent = current;
              existingNode.action = action;
            }
          } else {
            openList.push({
              state: nextState,
              action: action,
              parent: current,
              g,
              h,
            });
          }
        }
      }
    }

    return null; // No plan found
  }

  private isGoalMet(state: GOAPState, goal: Partial<GOAPState>): boolean {
    for (const key in goal) {
      if (state[key] !== goal[key]) return false;
    }
    return true;
  }

  private arePreconditionsMet(
    state: GOAPState,
    preconditions: Partial<GOAPState>,
  ): boolean {
    for (const key in preconditions) {
      if (state[key] !== preconditions[key]) return false;
    }
    return true;
  }

  private calculateHeuristic(
    state: GOAPState,
    goal: Partial<GOAPState>,
    actions: GOAPAction[],
    distanceCalculator?: (targetId: string) => number
  ): number {
    let cost = 0;
    for (const key in goal) {
      if (state[key] !== goal[key]) {
        // Find the cheapest action that satisfies this goal condition
        const satisfyingActions = actions.filter(a => a.effects[key] === goal[key]);
        if (satisfyingActions.length > 0) {
          let minCost = Math.min(...satisfyingActions.map(a => a.cost));
          
          // Add distance penalty if applicable
          if (distanceCalculator) {
            // Try to find a targetId in the action name or effects
            for (const action of satisfyingActions) {
              const targetIdMatch = action.name.match(/ (chest_\d+|potion_\d+|monster_\d+|barricade_\d+|explosive_\d+)/);
              if (targetIdMatch) {
                const targetId = targetIdMatch[1];
                const dist = distanceCalculator(targetId);
                if (dist !== Infinity) {
                  minCost += dist;
                }
              }
            }
          }
          cost += minCost;
        } else {
          // If no action can satisfy this, it's a very high cost
          cost += 100; 
        }
      }
    }
    return cost;
  }

  private statesEqual(s1: GOAPState, s2: GOAPState): boolean {
    const keys1 = Object.keys(s1);
    const keys2 = Object.keys(s2);
    if (keys1.length !== keys2.length) return false;
    for (const key of keys1) {
      if (s1[key] !== s2[key]) return false;
    }
    return true;
  }

  private buildPlan(node: Node): GOAPAction[] {
    const plan: GOAPAction[] = [];
    let curr: Node | null = node;
    while (curr && curr.action) {
      plan.unshift(curr.action);
      curr = curr.parent;
    }
    return plan;
  }
}
