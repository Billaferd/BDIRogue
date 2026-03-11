export interface EntityStates {
  [entityIdKey: string]: boolean | number | string | undefined;
}

export interface GOAPState {
  hp_low: boolean;
  is_alive: boolean;
  has_amulet: boolean;
  has_key: boolean;
  has_potion: boolean;
  has_explosive: boolean;
  floor_cleared: boolean;
  has_unknown_tiles: boolean;
  barricade_destroyed: boolean;
  monster_threat: boolean;
  unseen_entity_is_large: boolean;
  item_is_beneficial: boolean;
  
  // Dynamic entity-specific states (e.g. door_1_unlocked)
  entityStates: EntityStates;
}


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
  targetId?: string;
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

class PriorityQueue {
  private heap: Node[] = [];
  private stateToKey: (state: GOAPState) => string;
  private indexMap: Map<string, number> = new Map();

  constructor(stateToKey: (state: GOAPState) => string) {
    this.stateToKey = stateToKey;
  }

  get length(): number {
    return this.heap.length;
  }

  insert(node: Node) {
    const key = this.stateToKey(node.state);
    this.heap.push(node);
    const index = this.heap.length - 1;
    this.indexMap.set(key, index);
    this.bubbleUp(index);
  }

  extractMin(): Node | null {
    if (this.heap.length === 0) return null;
    const min = this.heap[0];
    this.indexMap.delete(this.stateToKey(min.state));
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.indexMap.set(this.stateToKey(last.state), 0);
      this.bubbleDown(0);
    }
    return min;
  }

  find(predicate: (node: Node) => boolean): Node | undefined {
    // Note: finding by predicate is still O(N) in a heap.
    // However, for GOAP states we can use the map if we have the state.
    // But since GOAPPlanner uses .find() with statesEqual, we keep it for now.
    return this.heap.find(predicate);
  }

  // Optimized lookup by state
  getByState(state: GOAPState): Node | undefined {
    const key = this.stateToKey(state);
    const index = this.indexMap.get(key);
    return index !== undefined ? this.heap[index] : undefined;
  }

  private bubbleUp(index: number) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.f(this.heap[index]) >= this.f(this.heap[parentIndex])) break;
      this.swap(index, parentIndex);
      index = parentIndex;
    }
  }

  private bubbleDown(index: number) {
    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (left < this.heap.length && this.f(this.heap[left]) < this.f(this.heap[smallest])) {
        smallest = left;
      }
      if (right < this.heap.length && this.f(this.heap[right]) < this.f(this.heap[smallest])) {
        smallest = right;
      }
      if (smallest === index) break;
      this.swap(index, smallest);
      index = smallest;
    }
  }

  private f(node: Node): number {
    return node.g + node.h;
  }

  private swap(i: number, j: number) {
    const nodeI = this.heap[i];
    const nodeJ = this.heap[j];
    this.heap[i] = nodeJ;
    this.heap[j] = nodeI;
    this.indexMap.set(this.stateToKey(nodeI.state), j);
    this.indexMap.set(this.stateToKey(nodeJ.state), i);
  }

  updateKey(node: Node) {
    const key = this.stateToKey(node.state);
    const index = this.indexMap.get(key);
    if (index !== undefined) {
      this.bubbleUp(index);
      // Also potentially bubble down if f increased (though in A* g usually only decreases)
      this.bubbleDown(index);
    }
  }
}

export class GOAPPlanner {
  private stateToKey(state: GOAPState): string {
    const sortedEntityKeys = Object.keys(state.entityStates).sort();
    const entityPart = sortedEntityKeys.map(k => `${k}:${state.entityStates[k]}`).join(',');
    return `hp:${state.hp_low},alive:${state.is_alive},amulet:${state.has_amulet},key:${state.has_key},potion:${state.has_potion},exp:${state.has_explosive},floor:${state.floor_cleared},unk:${state.has_unknown_tiles},bar:${state.barricade_destroyed},mon:${state.monster_threat},lrg:${state.unseen_entity_is_large},ben:${state.item_is_beneficial},entities:[${entityPart}]`;
  }

  plan(
    startState: GOAPState,
    goalState: Partial<GOAPState>,
    actions: GOAPAction[],
    distanceCalculator?: (targetId: string) => number
  ): GOAPAction[] | null {
    const openList = new PriorityQueue((s) => this.stateToKey(s));
    const closedList: Node[] = [];

    const startNode: Node = {
      state: { ...startState },
      action: null,
      parent: null,
      g: 0,
      h: this.calculateHeuristic(startState, goalState, actions, distanceCalculator),
    };

    openList.insert(startNode);

    while (openList.length > 0) {
      const current = openList.extractMin()!;

      if (this.isGoalMet(current.state, goalState)) {
        return this.buildPlan(current);
      }

      closedList.push(current);

      for (const action of actions) {
        if (this.arePreconditionsMet(current.state, action.preconditions)) {
          const nextState = this.applyEffects(current.state, action.effects);

          // Check if we already visited this state
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
              openList.updateKey(existingNode);
            }
          } else {
            openList.insert({
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

  private applyEffects(state: GOAPState, effects: Partial<GOAPState>): GOAPState {
    const nextState = { ...state };
    for (const key in effects) {
      if (key === 'entityStates') {
        nextState.entityStates = { ...nextState.entityStates, ...effects.entityStates };
      } else {
        const k = key as keyof Omit<GOAPState, 'entityStates'>;
        (nextState as any)[k] = effects[k];
      }
    }
    return nextState;
  }

  private isGoalMet(state: GOAPState, goal: Partial<GOAPState>): boolean {
    for (const key in goal) {
      if (key === 'entityStates' && goal.entityStates) {
        for (const entityKey in goal.entityStates) {
          if (state.entityStates[entityKey] !== goal.entityStates[entityKey]) return false;
        }
      } else {
        const k = key as keyof Omit<GOAPState, 'entityStates'>;
        if (state[k] !== goal[k]) return false;
      }
    }
    return true;
  }

  private arePreconditionsMet(
    state: GOAPState,
    preconditions: Partial<GOAPState>,
  ): boolean {
    return this.isGoalMet(state, preconditions);
  }

  private calculateHeuristic(
    state: GOAPState,
    goal: Partial<GOAPState>,
    actions: GOAPAction[],
    distanceCalculator?: (targetId: string) => number
  ): number {
    // h_add (Additive Heuristic) via Relaxed Planning Graph
    // 1. Extract all "atoms" (facts) from the state and actions
    const facts = new Map<string, number>();
    
    const setFact = (key: string, value: any, cost: number) => {
      const factKey = `${key}:${value}`;
      const existing = facts.get(factKey) ?? Infinity;
      if (cost < existing) {
        facts.set(factKey, cost);
        return true;
      }
      return false;
    };

    // Initialize facts from current state
    for (const key in state) {
      if (key === 'entityStates') {
        for (const ek in state.entityStates) {
          setFact(`entity:${ek}`, state.entityStates[ek], 0);
        }
      } else {
        setFact(key, (state as any)[key], 0);
      }
    }

    // 2. Iteratively apply actions (ignoring negative effects)
    let changed = true;
    while (changed) {
      changed = false;
      for (const action of actions) {
        // Check if preconditions are met and calculate their cost
        let precondCost = 0;
        let possible = true;
        
        for (const pk in action.preconditions) {
          if (pk === 'entityStates') {
            const entPre = action.preconditions.entityStates!;
            for (const ek in entPre) {
              const cost = facts.get(`entity:${ek}:${entPre[ek]}`);
              if (cost === undefined) { possible = false; break; }
              precondCost += cost;
            }
          } else {
            const cost = facts.get(`${pk}:${(action.preconditions as any)[pk]}`);
            if (cost === undefined) { possible = false; break; }
            precondCost += cost;
          }
          if (!possible) break;
        }

        if (possible) {
          let actionTotalCost = precondCost + action.cost;
          if (distanceCalculator && action.targetId) {
            const dist = distanceCalculator(action.targetId);
            if (dist !== Infinity) actionTotalCost += dist;
          }

          // Apply effects
          for (const ek in action.effects) {
            if (ek === 'entityStates') {
              const entEff = action.effects.entityStates!;
              for (const fk in entEff) {
                if (setFact(`entity:${fk}`, entEff[fk], actionTotalCost)) changed = true;
              }
            } else {
              if (setFact(ek, (action.effects as any)[ek], actionTotalCost)) changed = true;
            }
          }
        }
      }

      // Optimization: Stop early if all goal atoms are reached
      let goalMet = true;
      for (const gk in goal) {
        if (gk === 'entityStates') {
          for (const fek in goal.entityStates!) {
            if (!facts.has(`entity:${fek}:${goal.entityStates![fek]}`)) { goalMet = false; break; }
          }
        } else {
          if (!facts.has(`${gk}:${(goal as any)[gk]}`)) { goalMet = false; break; }
        }
        if (!goalMet) break;
      }
      if (goalMet) break;
    }

    // 3. Sum costs of goal atoms
    let totalGoalCost = 0;
    for (const gk in goal) {
      if (gk === 'entityStates') {
        for (const fek in goal.entityStates!) {
          const cost = facts.get(`entity:${fek}:${goal.entityStates![fek]}`) ?? 100;
          totalGoalCost += cost;
        }
      } else {
        const cost = facts.get(`${gk}:${(goal as any)[gk]}`) ?? 100;
        totalGoalCost += cost;
      }
    }

    return totalGoalCost;
  }

  private statesEqual(s1: GOAPState, s2: GOAPState): boolean {
    const keys1 = Object.keys(s1) as (keyof GOAPState)[];
    for (const key of keys1) {
      if (key === 'entityStates') {
        const entKeys1 = Object.keys(s1.entityStates);
        const entKeys2 = Object.keys(s2.entityStates);
        if (entKeys1.length !== entKeys2.length) return false;
        for (const ek of entKeys1) {
          if (s1.entityStates[ek] !== s2.entityStates[ek]) return false;
        }
      } else {
        if (s1[key] !== s2[key]) return false;
      }
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
