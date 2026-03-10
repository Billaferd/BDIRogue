import { Entity, GameState, Position } from './types';
import { KnowledgeGraph } from './knowledgeGraph';
import { BayesianInference } from './bayesian';
import { BDIAgent, Desire } from './bdi';
import { GOAPAction, Intent } from './goap';
import * as ROT from 'rot-js';

export class GameEngine {
  state: GameState;
  kg: KnowledgeGraph;
  bayesian: BayesianInference;
  bdi: BDIAgent;
  
  // For UI updates
  onUpdate: () => void = () => {};
  width = 25;
  height = 25;

  constructor() {
    this.kg = new KnowledgeGraph();
    this.bayesian = new BayesianInference();
    this.bdi = new BDIAgent();
    
    this.state = this.initializeMap(1);
    this.setupAgent();
    this.senseAndPerceive(); // Initial observation
  }

  initializeMap(floorNumber: number, previousRogue?: Entity): GameState {
    const grid: Entity[][] = [];
    const entities: Entity[] = [];

    // 1. Generate Map using rot-js Digger
    const digger = new ROT.Map.Digger(this.width, this.height);
    
    // Initialize grid with walls
    for (let y = 0; y < this.height; y++) {
      const row: Entity[] = [];
      for (let x = 0; x < this.width; x++) {
        row.push({ id: `wall_${x}_${y}`, traits: ['wall'], pos: {x, y}, isExplored: false, isVisible: false });
      }
      grid.push(row);
    }

    // Carve out floors
    digger.create((x, y, value) => {
      if (value === 0) {
        grid[y][x] = { id: `floor_${x}_${y}`, traits: ['floor'], pos: {x, y}, isExplored: false, isVisible: false };
      }
    });

    const rooms = digger.getRooms();
    
    // Find leaf rooms (rooms with only 1 door) to prevent locking chokepoints
    const leafRooms = rooms.filter(r => {
      let doorCount = 0;
      r.getDoors(() => doorCount++);
      return doorCount === 1;
    });

    const startRoom = leafRooms.length > 0 ? leafRooms[0] : rooms[0];
    const targetRoom = leafRooms.length > 1 ? leafRooms[leafRooms.length - 1] : rooms[rooms.length - 1];
    
    // 2. Place Player in the start room
    const playerPos = startRoom.getCenter();
    const rogue: Entity = previousRogue ? 
      { ...previousRogue, pos: { x: playerPos[0], y: playerPos[1] }, currentPath: [] } : 
      { id: 'rogue', traits: ['rogue'], pos: { x: playerPos[0], y: playerPos[1] }, hp: 100, potions: 0, isExplored: true, isVisible: true, currentPath: [] };
    entities.push(rogue);
    
    // 3. Place Amulet or Stairs in the target room
    const targetPos = targetRoom.getCenter();
    const maxFloor = 5;
    
    if (floorNumber === maxFloor) {
      entities.push({ id: 'amulet_1', traits: ['amulet'], pos: { x: targetPos[0], y: targetPos[1] }, isExplored: false, isVisible: false });
    } else {
      entities.push({ id: `stairs_down_${floorNumber}`, traits: ['stairs'], pos: { x: targetPos[0], y: targetPos[1] }, isExplored: false, isVisible: false });
    }

    // 4. Lock the doors to the target room
    if (startRoom !== targetRoom) {
      targetRoom.getDoors((x, y) => {
        entities.push({ id: `door_${x}_${y}`, traits: ['door', 'locked'], pos: {x, y}, isExplored: false, isVisible: false });
      });
    }

    // 5. Flood fill to find all rooms reachable from the start room WITHOUT passing through locked doors
    const reachableRooms = new Set<typeof rooms[0]>();
    const visited = new Set<string>();
    const queue = [playerPos];
    visited.add(`${playerPos[0]},${playerPos[1]}`);

    while (queue.length > 0) {
      const [cx, cy] = queue.shift()!;
      
      for (const room of rooms) {
        if (cx >= room.getLeft() && cx <= room.getRight() && cy >= room.getTop() && cy <= room.getBottom()) {
          reachableRooms.add(room);
        }
      }

      const neighbors = [
        [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]
      ];

      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) continue;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        
        const isWall = grid[ny][nx].traits.includes('wall');
        const isLockedDoor = entities.some(e => e.traits.includes('door') && e.pos.x === nx && e.pos.y === ny && e.traits.includes('locked'));
        
        if (!isWall && !isLockedDoor) {
          visited.add(key);
          queue.push([nx, ny]);
        }
      }
    }

    // 6. Place Chests, Potions, and Monsters
    let chestCount = 1;
    let monsterCount = 1;
    let potionCount = 1;

    const reachableRoomsArr = Array.from(reachableRooms);
    const keyRoom = reachableRoomsArr.length > 0 ? reachableRoomsArr[0] : startRoom;
    
    // We place chests in all rooms except the target room (unless it's the only room)
    const roomsForChests = rooms.filter(r => r !== targetRoom || r === startRoom);
    
    // Ensure the keyRoom is processed first so it gets the key
    const sortedRoomsForChests = [
      keyRoom,
      ...roomsForChests.filter(r => r !== keyRoom)
    ];

    for (let i = 0; i < sortedRoomsForChests.length; i++) {
      const room = sortedRoomsForChests[i];
      const center = room.getCenter();
      
      // Chests
      entities.push({
        id: `chest_${chestCount}`,
        traits: ['locked', 'mimic'], // Simplified for now
        pos: { x: center[0], y: center[1] },
        isExplored: false,
        isVisible: false
      });
      chestCount++;

      // Potions (50% chance per room)
      if (Math.random() > 0.5) {
        entities.push({
          id: `potion_${potionCount}`,
          traits: ['blue', 'high_viscosity'],
          pos: { x: room.getLeft() + 1, y: room.getBottom() - 1 },
          isExplored: false,
          isVisible: false
        });
        potionCount++;
      }

      // Monsters (scale with floor)
      const numMonsters = Math.floor(Math.random() * floorNumber) + 1;
      for (let m = 0; m < numMonsters; m++) {
        entities.push({
          id: `monster_${monsterCount}`,
          traits: ['large', 'fast'],
          pos: { x: room.getRight() - 1, y: room.getTop() + 1 + m },
          lastPos: { x: room.getRight() - 1, y: room.getTop() + 1 + m },
          hp: 20 + (floorNumber * 10),
          isExplored: false,
          isVisible: false
        });
        monsterCount++;
      }
    }

    // Initialize lastPos for all entities
    entities.forEach(e => {
      if (!e.lastPos) e.lastPos = { ...e.pos };
    });

    return {
      grid,
      entities,
      rogue,
      turn: this.state ? this.state.turn : 0,
      log: this.state ? this.state.log : [`You enter the dungeon. Floor ${floorNumber} of ${maxFloor}.`],
      currentFloor: floorNumber,
      maxFloor: maxFloor,
      frontierTiles: []
    };
  }

  setupAgent() {
    // Count chests to initialize beliefs
    const chestCount = this.state.entities.filter(e => e.traits.includes('mimic')).length;

    // Initial Beliefs
    const initialBeliefs: any = {
      has_amulet: false,
      has_key: false,
      door_unlocked: false,
      is_alive: true,
      monster_threat: false,
      hp_low: (this.state.rogue.hp || 100) < 60,
      has_potion: (this.state.rogue.potions || 0) > 0,
      floor_cleared: false,
      has_unknown_tiles: true
    };
    for (let i = 1; i <= chestCount; i++) {
      initialBeliefs[`chest_${i}_opened`] = false;
    }
    this.bdi.updateBeliefs(initialBeliefs);

    // Desires
    this.bdi.addDesire({ name: 'Heal', priority: 90, goalState: { hp_low: false } }); // High priority if low HP
    this.bdi.addDesire({ name: 'Stay Alive', priority: 100, goalState: { is_alive: true, monster_threat: false } }); // Highest priority if threatened
    
    // We will dynamically adjust priorities in tick() based on health
    this.bdi.addDesire({ name: 'Explore Floor', priority: 20, goalState: { has_unknown_tiles: false } });
    
    if (this.state.currentFloor === this.state.maxFloor) {
      this.bdi.addDesire({ name: 'Get Amulet', priority: 10, goalState: { has_amulet: true } });
    } else {
      this.bdi.addDesire({ name: 'Descend', priority: 10, goalState: { floor_cleared: true } });
    }

    // Initial Knowledge
    this.kg.add('rogue', 'is_at', `${this.state.rogue.pos.x},${this.state.rogue.pos.y}`);
  }

  log(msg: string) {
    this.state.log.unshift(`[Turn ${this.state.turn}] ${msg}`);
    if (this.state.log.length > 20) this.state.log.pop();
  }

  findNearestFrontier(start: Position): Position | null {
    const queue: {pos: Position, dist: number}[] = [{pos: start, dist: 0}];
    const visited = new Set<string>();
    visited.add(`${start.x},${start.y}`);

    while (queue.length > 0) {
      const {pos, dist} = queue.shift()!;
      
      if (dist > 20) continue; // Modest depth limit

      // Check if this position is a frontier tile
      if (this.state.frontierTiles.some(f => f.x === pos.x && f.y === pos.y)) {
        return pos;
      }

      const neighbors = [
        {x: pos.x+1, y: pos.y}, {x: pos.x-1, y: pos.y}, 
        {x: pos.x, y: pos.y+1}, {x: pos.x, y: pos.y-1}
      ];

      for (const n of neighbors) {
        if (n.x >= 0 && n.x < this.width && n.y >= 0 && n.y < this.height && !visited.has(`${n.x},${n.y}`)) {
          const floor = this.state.grid[n.y][n.x];
          if (!floor.traits.includes('wall')) {
            visited.add(`${n.x},${n.y}`);
            queue.push({pos: n, dist: dist + 1});
          }
        }
      }
    }
    return null;
  }

  getEntitiesAt(pos: Position): Entity[] {
    return this.state.entities.filter(e => e.pos.x === pos.x && e.pos.y === pos.y);
  }

  moveRogue(dx: number, dy: number): boolean {
    const newPos = { x: this.state.rogue.pos.x + dx, y: this.state.rogue.pos.y + dy };
    
    // Check bounds
    if (newPos.x < 0 || newPos.y < 0 || newPos.x >= this.width || newPos.y >= this.height) return false;

    // Check grid for wall
    const floor = this.state.grid[newPos.y][newPos.x];
    if (floor.traits.includes('wall')) return false;

    // Check collisions
    const entities = this.getEntitiesAt(newPos);
    const door = entities.find(e => e.traits.includes('door'));
    if (door && !door.traits.includes('open')) {
      return false;
    }

    this.state.rogue.pos = newPos;
    this.kg.remove('rogue', 'is_at', `${this.state.rogue.pos.x - dx},${this.state.rogue.pos.y - dy}`);
    this.kg.add('rogue', 'is_at', `${newPos.x},${newPos.y}`);
    
    this.senseAndPerceive();
    return true;
  }

  senseAndPerceive() {
    const { newDiscovery, monsterVisible } = this.observeEnvironment();

    const totalCells = this.width * this.height;
    const exploredCells = this.state.grid.flat().filter(cell => cell.isExplored).length;
    const explorationPercentage = (exploredCells / totalCells) * 100;

    const envData = {
      hp: this.state.rogue.hp || 0,
      maxHp: 100,
      potions: this.state.rogue.potions || 0,
      monsterVisible,
      newDiscovery,
      explorationPercentage
    };

    const { logMessages } = this.bdi.perceive(envData);
    logMessages.forEach(msg => this.log(msg));
  }

  observeEnvironment() {
    // Clear visibility
    this.state.entities.forEach(e => e.isVisible = false);
    this.state.grid.forEach(row => row.forEach(cell => cell.isVisible = false));

    const r = 5;
    const { x: rx, y: ry } = this.state.rogue.pos;

    const markVisible = (e: Entity) => {
      if (!e.isExplored) {
        e.isExplored = true;
        // Update frontier
        const { x, y } = e.pos;
        
        // Remove from frontier if it was there
        this.state.frontierTiles = this.state.frontierTiles.filter(f => f.x !== x || f.y !== y);
        
        // Check neighbors
        const neighbors = [
          {x: x+1, y}, {x: x-1, y}, {x, y: y+1}, {x, y: y-1}
        ];
        for (const n of neighbors) {
          if (n.x >= 0 && n.x < this.width && n.y >= 0 && n.y < this.height) {
            const neighbor = this.state.grid[n.y][n.x];
            if (!neighbor.isExplored && !neighbor.traits.includes('wall')) {
              if (!this.state.frontierTiles.some(f => f.x === n.x && f.y === n.y)) {
                this.state.frontierTiles.push(n);
              }
            }
          }
        }
      }
      e.isVisible = true;
    };

    let newDiscovery = false;
    let monsterVisible = false;

    const lightPasses = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
      const floor = this.state.grid[y][x];
      if (floor.traits.includes('wall')) return false;
      const entities = this.getEntitiesAt({x, y});
      return !entities.some(e => e.traits.includes('door') && !e.traits.includes('open'));
    };

    const fov = new ROT.FOV.PreciseShadowcasting(lightPasses);

    fov.compute(rx, ry, r, (x, y, r, visibility) => {
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
      
      const floor = this.state.grid[y][x];
      markVisible(floor);
      
      const entities = this.getEntitiesAt({x, y});
      entities.forEach(e => {
        markVisible(e);
        if (!e.traits.includes('floor') && !e.traits.includes('wall') && !e.traits.includes('rogue')) {
          if (!this.kg.has(e.id, 'is_at', `${e.pos.x},${e.pos.y}`)) {
            this.kg.add(e.id, 'is_at', `${e.pos.x},${e.pos.y}`);
            // Simplified logging
            this.log(`Spotted entity at ${e.pos.x},${e.pos.y}`);

            if (e.traits.includes('locked') || e.traits.includes('fast') || e.traits.includes('door') || e.traits.includes('blue') || e.traits.includes('stairs')) {
              newDiscovery = true;
            }

            // Contextual variables
            const neighbors = [
                {x: e.pos.x+1, y: e.pos.y}, {x: e.pos.x-1, y: e.pos.y}, {x: e.pos.x, y: e.pos.y+1}, {x: e.pos.x, y: e.pos.y-1},
                {x: e.pos.x+1, y: e.pos.y+1}, {x: e.pos.x-1, y: e.pos.y-1}, {x: e.pos.x+1, y: e.pos.y-1}, {x: e.pos.x-1, y: e.pos.y+1}
            ];
            
            const nearDeadEnd = neighbors.some(n => this.isDeadEnd(n));
            const nearBloodSplatter = neighbors.some(n => this.hasBloodSplatter(n));
            
            // Evidence signals
            const evidence: Record<string, boolean> = {
                ...e.traits.reduce((acc, t) => ({ ...acc, [t]: true }), {}),
                near_dead_end: nearDeadEnd,
                near_blood_splatter: nearBloodSplatter
            };
            
            // Bayesian inference
            if (e.traits.includes('large') || e.traits.includes('fast') || e.traits.includes('breathing') || e.traits.includes('suspicious')) {
                // Update monster_is_elite
                this.bayesian.updateBelief(e.id, evidence, {
                    'large_true': 0.8, 'large_false': 0.1,
                    'fast_true': 0.8, 'fast_false': 0.1,
                    'breathing_true': 0.7, 'breathing_false': 0.2,
                    'suspicious_true': 0.7, 'suspicious_false': 0.2,
                    'near_dead_end_true': 0.6, 'near_dead_end_false': 0.3,
                    'near_blood_splatter_true': 0.6, 'near_blood_splatter_false': 0.3
                }, e.pos);
                const pElite = this.bayesian.priors[e.id];
                this.log(`Evaluated ${e.id}: P(Elite) = ${(pElite * 100).toFixed(1)}%`);
                if (pElite > 0.5) this.bdi.updateBeliefs({ [`${e.id}_is_elite`]: true });
            } else if (e.traits.includes('blue') || e.traits.includes('high_viscosity') || e.traits.includes('amulet')) {
                // Update item_is_beneficial
                this.bayesian.updateBelief(e.id, evidence, {
                    'blue_true': 0.8, 'blue_false': 0.1,
                    'high_viscosity_true': 0.8, 'high_viscosity_false': 0.1,
                    'near_dead_end_true': 0.4, 'near_dead_end_false': 0.5,
                    'near_blood_splatter_true': 0.3, 'near_blood_splatter_false': 0.6
                }, e.pos);
                const pBeneficial = this.bayesian.priors[e.id];
                this.log(`Evaluated ${e.id}: P(Beneficial) = ${(pBeneficial * 100).toFixed(1)}%`);
                if (pBeneficial > 0.5) this.bdi.updateBeliefs({ [`${e.id}_is_beneficial`]: true });
            }

            if (e.traits.includes('door')) {
               this.bdi.addDesire({ name: `Unlock ${e.id}`, priority: 4, goalState: { door_unlocked: true } });
            }

            if (e.traits.includes('blue') && e.traits.includes('high_viscosity')) {
               this.bdi.addDesire({ name: `Collect ${e.id}`, priority: 30, goalState: { [`${e.id}_collected`]: true } });
            }
          }

          if ((e.traits.includes('large') && e.traits.includes('fast')) && e.hp! > 0) {
            monsterVisible = true;
          }
        }
      });
    });

    return { newDiscovery, monsterVisible };
  }

  processAuditorySignals() {
    const rogue = this.state.rogue;
    for (const e of this.state.entities) {
      if (e.traits.includes('large') || e.traits.includes('fast')) {
        if (e.lastPos && (e.pos.x !== e.lastPos.x || e.pos.y !== e.lastPos.y)) {
          if (!e.isVisible) {
            const dist = Math.hypot(e.pos.x - rogue.pos.x, e.pos.y - rogue.pos.y);
            if (dist < 5) {
              const signal = e.traits.includes('large') ? 'auditory_cadence_heavy' : 'auditory_cadence_light';
              this.bayesian.updateBelief(e.id, { [signal]: true }, {
                [`${signal}_true`]: 0.8,
                [`${signal}_false`]: 0.1
              }, e.pos);
              this.log(`You hear something ${signal} nearby.`);
            }
          }
        }
        e.lastPos = { ...e.pos };
      }
    }
  }

  evaluateProbabilities() {
    for (const [id, prob] of Object.entries(this.bayesian.priors)) {
      if (prob > 0.8) {
        this.bdi.updateBeliefs({ [`${id}_is_confirmed`]: true });
      } else if (prob < 0.2) {
        this.bdi.updateBeliefs({ [`${id}_is_confirmed`]: false });
      }
    }
  }

  isDeadEnd(pos: Position): boolean {
    const neighbors = [
      {x: pos.x+1, y: pos.y}, {x: pos.x-1, y: pos.y}, {x: pos.x, y: pos.y+1}, {x: pos.x, y: pos.y-1}
    ];
    let wallCount = 0;
    for (const n of neighbors) {
      if (n.x < 0 || n.x >= this.width || n.y < 0 || n.y >= this.height || this.state.grid[n.y][n.x].traits.includes('wall')) {
        wallCount++;
      }
    }
    return wallCount >= 3;
  }

  hasBloodSplatter(pos: Position): boolean {
    return this.getEntitiesAt(pos).some(e => e.traits.includes('blood_splatter'));
  }

  findPath(start: Position, goal: Position | ((pos: Position) => boolean), ignoreDanger = false): Position[] | null {
    const passableCallback = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
      if (x === start.x && y === start.y) return true;
      if (typeof goal !== 'function' && x === goal.x && y === goal.y) return true;

      const floor = this.state.grid[y][x];
      if (!floor.isExplored && !ignoreDanger) return false;
      if (floor.traits.includes('wall')) return false;

      const entities = this.getEntitiesAt({x, y});
      const isClosedDoor = entities.some(e => e.traits.includes('door') && !e.traits.includes('open'));
      const isMonster = entities.some(e => (e.traits.includes('large') && e.traits.includes('fast')) && e.hp! > 0);

      let danger = false;
      if (!ignoreDanger) {
        for (const e of this.state.entities) {
          if (e.traits.includes('mimic') && this.bdi.beliefs[`${e.id}_is_mimic`]) {
            if (Math.max(Math.abs(e.pos.x - x), Math.abs(e.pos.y - y)) <= 1) {
              danger = true;
            }
          }
        }
      }

      return !(isClosedDoor || isMonster || danger);
    };

    if (typeof goal === 'function') {
      const dijkstra = new ROT.Path.Dijkstra(start.x, start.y, passableCallback, {topology: 8});
      let bestPath: Position[] | null = null;
      let bestDist = Infinity;

      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          if (goal({x, y})) {
            const neighbors = [
              {x: x, y: y - 1}, {x: x, y: y + 1},
              {x: x - 1, y: y}, {x: x + 1, y: y},
              {x: x - 1, y: y - 1}, {x: x + 1, y: y - 1},
              {x: x - 1, y: y + 1}, {x: x + 1, y: y + 1}
            ];
            for (const n of neighbors) {
              if (n.x === start.x && n.y === start.y) {
                return [{x, y}];
              }
              if (passableCallback(n.x, n.y)) {
                const path: Position[] = [];
                dijkstra.compute(n.x, n.y, (px, py) => {
                  path.push({x: px, y: py});
                });
                if (path.length > 0 && path.length < bestDist) {
                  bestDist = path.length;
                  bestPath = path.reverse();
                  bestPath.shift(); // remove start
                  bestPath.push({x, y}); // add the goal itself
                }
              }
            }
          }
        }
      }
      return bestPath;
    } else {
      const astar = new ROT.Path.AStar(goal.x, goal.y, passableCallback, {topology: 8});
      const path: Position[] = [];
      astar.compute(start.x, start.y, (x, y) => {
        path.push({x, y});
      });

      if (path.length > 1) {
        path.shift(); // remove start
        return path;
      }
      return null;
    }
  }

  getNextStepTowards(target: Position, ignoreDanger = false): {dx: number, dy: number} | null {
    const path = this.findPath(this.state.rogue.pos, target, ignoreDanger);
    if (path && path.length > 0) {
      const nextStep = path[0];
      return { dx: nextStep.x - this.state.rogue.pos.x, dy: nextStep.y - this.state.rogue.pos.y };
    }
    return null;
  }

  generateActions(): GOAPAction[] {
    const actions: GOAPAction[] = [];

    // Action: Drink Potion
    actions.push({
      name: 'Drink Potion',
      cost: 1,
      preconditions: { item_is_beneficial: true, hp_low: true },
      effects: { hp_low: false },
      execute: () => {
        if (this.state.rogue.potions && this.state.rogue.potions > 0) {
          return { intent: { type: 'HEAL' }, status: 'completed' };
        }
        return { intent: null, status: 'failed' };
      }
    });

    // Action: Evade Unseen Threat
    actions.push({
      name: 'Evade Unseen Threat',
      cost: 1,
      preconditions: { unseen_entity_is_large: true },
      effects: { monster_threat: false },
      execute: () => {
        // Defensive maneuver: move away from threat
        return { intent: { type: 'MOVE', dx: 1, dy: 1, reason: "Evading unseen threat" }, status: 'completed' };
      }
    });

    // Action: Pick Up Potion
    const potions = this.state.entities.filter(e => e.traits.includes('blue') && e.traits.includes('high_viscosity'));
    potions.forEach(potion => {
      if (this.kg.has(potion.id, 'is_type', 'health_potion')) {
        actions.push({
          name: `Pick Up ${potion.id}`,
          cost: 2,
          preconditions: {}, // Can always pick up if we know about it
          effects: { has_potion: true, [`${potion.id}_collected`]: true },
          execute: () => {
            const dist = Math.max(Math.abs(this.state.rogue.pos.x - potion.pos.x), Math.abs(this.state.rogue.pos.y - potion.pos.y));
            if (dist > 0) {
              const step = this.getNextStepTowards(potion.pos);
              if (step) {
                return { intent: { type: 'MOVE', dx: step.dx, dy: step.dy, reason: `Moving towards potion` }, status: 'in_progress' };
              }
              return { intent: null, status: 'failed' };
            } else {
              return { intent: { type: 'PICK_UP', targetId: potion.id }, status: 'completed' };
            }
          }
        });
      }
    });

    // Action: Defeat Monster
    const monster = this.state.entities.find(e => (e.traits.includes('large') && e.traits.includes('fast')) && e.hp! > 0 && e.isVisible);
    if (monster) {
      const isHurt = this.state.rogue.hp! < 60;

      actions.push({
        name: 'Defeat Monster',
        cost: isHurt ? 10 : 1, // High cost if hurt, so it prefers fleeing
        preconditions: { monster_threat: true },
        effects: { monster_threat: false },
        execute: () => {
          const dist = Math.max(Math.abs(this.state.rogue.pos.x - monster.pos.x), Math.abs(this.state.rogue.pos.y - monster.pos.y));
          if (dist > 1) {
            const step = this.getNextStepTowards(monster.pos, true);
            if (step) {
              return { intent: { type: 'MOVE', dx: step.dx, dy: step.dy, reason: "Charging at monster" }, status: 'in_progress' };
            }
            return { intent: null, status: 'failed' };
          } else {
            return { intent: { type: 'ATTACK', targetId: monster.id }, status: 'completed' };
          }
        }
      });

      actions.push({
        name: 'Flee Monster',
        cost: isHurt ? 1 : 10, // Low cost if hurt, high cost if healthy
        preconditions: { monster_threat: true },
        effects: { monster_threat: false },
        execute: () => {
          const dx = this.state.rogue.pos.x - monster.pos.x;
          const dy = this.state.rogue.pos.y - monster.pos.y;
          
          // Prefer moving to explored safe tiles
          const safeMoves = [
            {x: 1, y: 0}, {x: -1, y: 0}, {x: 0, y: 1}, {x: 0, y: -1},
            {x: 1, y: 1}, {x: -1, y: -1}, {x: 1, y: -1}, {x: -1, y: 1}
          ].filter(m => {
             const nx = this.state.rogue.pos.x + m.x;
             const ny = this.state.rogue.pos.y + m.y;
             if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) return false;
             const floor = this.state.grid[ny][nx];
             if (floor.traits.includes('wall')) return false;
             
             // Avoid moving closer to the monster
             const newDist = Math.max(Math.abs(nx - monster.pos.x), Math.abs(ny - monster.pos.y));
             const oldDist = Math.max(Math.abs(dx), Math.abs(dy));
             if (newDist < oldDist) return false;
             
             // Check for other entities blocking
             const entitiesAtNext = this.getEntitiesAt({x: nx, y: ny});
             if (entitiesAtNext.some(ent => (ent.traits.includes('large') && ent.traits.includes('fast')) || (ent.traits.includes('door') && !ent.traits.includes('open')))) return false;
             
             return true;
          });
          
          if (safeMoves.length > 0) {
             // Sort by distance from monster (descending)
             safeMoves.sort((a, b) => {
                const distA = Math.max(Math.abs(this.state.rogue.pos.x + a.x - monster.pos.x), Math.abs(this.state.rogue.pos.y + a.y - monster.pos.y));
                const distB = Math.max(Math.abs(this.state.rogue.pos.x + b.x - monster.pos.x), Math.abs(this.state.rogue.pos.y + b.y - monster.pos.y));
                return distB - distA;
             });
             
             return { intent: { type: 'MOVE', dx: safeMoves[0].x, dy: safeMoves[0].y, reason: "Fleeing from monster" }, status: 'completed' };
          } else {
             return { intent: { type: 'ATTACK', targetId: monster.id }, status: 'completed' };
          }
        }
      });
    }

    // Action: Unlock Door
    const doors = this.state.entities.filter(e => e.traits.includes('door'));
    doors.forEach(door => {
      if (this.kg.has(door.id, 'is_type', 'door')) {
        actions.push({
          name: `Unlock ${door.id}`,
          cost: 1,
          preconditions: { has_key: true, door_unlocked: false },
          effects: { door_unlocked: true },
          execute: () => {
            const dist = Math.max(Math.abs(this.state.rogue.pos.x - door.pos.x), Math.abs(this.state.rogue.pos.y - door.pos.y));
            if (dist > 1) {
              const step = this.getNextStepTowards(door.pos);
              if (step) {
                return { intent: { type: 'MOVE', dx: step.dx, dy: step.dy, reason: `Moving towards ${door.id}` }, status: 'in_progress' };
              }
              return { intent: null, status: 'failed' };
            } else {
              return { intent: { type: 'OPEN_DOOR', targetId: door.id }, status: 'completed' };
            }
          }
        });
      }
    });

    // Action: Descend Stairs
    const stairs = this.state.entities.find(e => e.traits.includes('stairs'));
    if (stairs && this.kg.has(stairs.id, 'is_type', 'stairs_down')) {
      actions.push({
        name: 'Descend Stairs',
        cost: 1,
        preconditions: { door_unlocked: true, floor_cleared: false },
        effects: { floor_cleared: true },
        execute: () => {
          const dist = Math.max(Math.abs(this.state.rogue.pos.x - stairs.pos.x), Math.abs(this.state.rogue.pos.y - stairs.pos.y));
          if (dist > 0) {
            const step = this.getNextStepTowards(stairs.pos);
            if (step) {
              return { intent: { type: 'MOVE', dx: step.dx, dy: step.dy, reason: "Moving towards stairs" }, status: 'in_progress' };
            }
            return { intent: null, status: 'failed' };
          } else {
            return { intent: { type: 'DESCEND' }, status: 'completed' };
          }
        }
      });
    }

    // Action: Get Amulet
    const amulet = this.state.entities.find(e => e.traits.includes('amulet'));
    if (amulet && this.kg.has(amulet.id, 'is_type', 'amulet')) {
      actions.push({
        name: 'Get Amulet',
        cost: 1,
        preconditions: { door_unlocked: true, has_amulet: false },
        effects: { has_amulet: true },
        execute: () => {
          const dist = Math.max(Math.abs(this.state.rogue.pos.x - amulet.pos.x), Math.abs(this.state.rogue.pos.y - amulet.pos.y));
          if (dist > 0) {
            const step = this.getNextStepTowards(amulet.pos);
            if (step) {
              return { intent: { type: 'MOVE', dx: step.dx, dy: step.dy, reason: "Moving towards amulet" }, status: 'in_progress' };
            }
            return { intent: null, status: 'failed' };
          } else {
            return { intent: { type: 'PICK_UP', targetId: amulet.id }, status: 'completed' };
          }
        }
      });
    }

    // Actions: Open Chests
    const chestCount = this.state.entities.filter(e => e.traits.includes('mimic')).length;
    for (let i = 1; i <= chestCount; i++) {
      const chestId = `chest_${i}`;
      if (this.kg.has(chestId, 'is_type', 'chest')) {
        const isMimicBelief = this.bdi.beliefs[`${chestId}_is_mimic`];
        
        actions.push({
          name: `Open ${chestId}`,
          cost: isMimicBelief ? 50 : 2, // High cost if believed to be a mimic
          preconditions: { [`${chestId}_opened`]: false },
          effects: { [`${chestId}_opened`]: true, has_key: true },
          execute: () => {
            const chest = this.state.entities.find(e => e.id === chestId);
            if (!chest) return { intent: null, status: 'failed' };

            const dist = Math.max(Math.abs(this.state.rogue.pos.x - chest.pos.x), Math.abs(this.state.rogue.pos.y - chest.pos.y));
            if (dist > 1) {
              const step = this.getNextStepTowards(chest.pos);
              if (step) {
                return { intent: { type: 'MOVE', dx: step.dx, dy: step.dy, reason: `Moving towards ${chestId}` }, status: 'in_progress' };
              }
              return { intent: null, status: 'failed' };
            } else {
              return { intent: { type: 'OPEN_CHEST', targetId: chestId }, status: 'completed' };
            }
          }
        });
      }
    }

    // Action: Explore
    if (this.bdi.beliefs.has_unknown_tiles) {
      actions.push({
        name: 'Explore',
        cost: 1,
        preconditions: { has_unknown_tiles: true },
        effects: { has_unknown_tiles: false },
        execute: () => {
          // Use existing path if valid
          if (this.state.rogue.currentPath && this.state.rogue.currentPath.length > 0) {
            const nextStep = this.state.rogue.currentPath[0];
            // Check if next step is still valid
            const floor = this.state.grid[nextStep.y][nextStep.x];
            if (!floor.traits.includes('wall')) {
              this.state.rogue.currentPath.shift();
              return { intent: { type: 'EXPLORE', dx: nextStep.x - this.state.rogue.pos.x, dy: nextStep.y - this.state.rogue.pos.y, reason: "Following path" }, status: 'completed' };
            }
          }

          // Find nearest frontier tile
          const target = this.findNearestFrontier(this.state.rogue.pos);

          if (target) {
            const path = this.findPath(this.state.rogue.pos, target);
            if (path && path.length > 0) {
              this.state.rogue.currentPath = path;
              const nextStep = this.state.rogue.currentPath.shift()!;
              return { intent: { type: 'EXPLORE', dx: nextStep.x - this.state.rogue.pos.x, dy: nextStep.y - this.state.rogue.pos.y, reason: "Exploring frontier" }, status: 'completed' };
            }
          }
          
          this.bdi.updateBeliefs({ has_unknown_tiles: false });
          return { intent: null, status: 'failed' };
        }
      });
    }

    return actions;
  }

  resolveIntent(intent: Intent) {
    switch (intent.type) {
      case 'MOVE':
      case 'EXPLORE':
        this.moveRogue(intent.dx, intent.dy);
        break;
      case 'HEAL':
        if (this.state.rogue.potions! > 0) {
          this.state.rogue.potions!--;
          this.state.rogue.hp = Math.min(100, (this.state.rogue.hp || 0) + 50);
          this.log(`Drank a potion! HP is now ${this.state.rogue.hp}. Potions left: ${this.state.rogue.potions}`);
          this.bdi.updateBeliefs({ 
            hp_low: this.state.rogue.hp < 60,
            has_potion: this.state.rogue.potions > 0
          });
        }
        break;
      case 'DESCEND':
        this.bdi.updateBeliefs({ floor_cleared: true });
        this.log("Descended the stairs!");
        break;
      case 'ATTACK': {
        const monster = this.state.entities.find(e => e.id === intent.targetId);
        if (monster && monster.hp! > 0) {
          this.log("Attacking monster!");
          monster.hp! -= 15;
          if (monster.hp! <= 0) {
            this.log("Monster defeated!");
            this.bdi.updateBeliefs({ monster_threat: false });
            monster.traits = ['floor']; // turn into corpse/floor
          }
        }
        break;
      }
      case 'OPEN_DOOR': {
        const door = this.state.entities.find(e => e.id === intent.targetId);
        if (door && !door.traits.includes('open')) {
          door.traits = door.traits.filter(t => t !== 'locked');
          door.traits.push('open');
          this.bdi.updateBeliefs({ door_unlocked: true });
          this.log(`Unlocked ${door.id}!`);
        }
        break;
      }
      case 'PICK_UP': {
        const potion = this.state.entities.find(e => e.id === intent.targetId);
        if (potion) {
          this.state.rogue.potions = (this.state.rogue.potions || 0) + 1;
          this.bdi.updateBeliefs({ has_potion: true, [`${potion.id}_collected`]: true });
          this.log(`Picked up a health potion! Total: ${this.state.rogue.potions}`);
          this.state.entities = this.state.entities.filter(e => e.id !== potion.id);
        }
        break;
      }
      case 'OPEN_CHEST': {
        const chest = this.state.entities.find(e => e.id === intent.targetId);
        if (chest) {
          this.bayesian.updatePrior(chest.id, chest.traits.includes('mimic'));
          this.bdi.updateBeliefs({ [`${chest.id}_opened`]: true });
          if (chest.traits.includes('mimic')) {
            this.log(`Oh no! ${chest.id} was a Mimic!`);
            this.state.rogue.hp! -= 50;
            this.bdi.updateBeliefs({ hp_low: this.state.rogue.hp! < 60 });
            if (this.state.rogue.hp! <= 0) {
              this.bdi.updateBeliefs({ is_alive: false });
              this.log("You died.");
            }
          } else if (chest.traits.includes('key')) {
            this.bdi.updateBeliefs({ has_key: true });
            this.log(`Found a key in ${chest.id}!`);
          } else {
            this.log(`${chest.id} was empty.`);
          }
        }
        break;
      }
    }
  }

  tick() {
    if (!this.bdi.beliefs.is_alive) return;
    if (this.bdi.beliefs.has_amulet) return;

    this.state.turn++;
    
    // 1. Sense
    this.senseAndPerceive();
    this.processAuditorySignals();
    this.evaluateProbabilities();

    // 2. Think
    const actions = this.generateActions();
    
    // Re-evaluate plan if empty
    if (this.bdi.currentPlan.length === 0) {
      this.bdi.deliberate(actions);
      if (this.bdi.intention) {
        this.log(`Formed Intention: ${this.bdi.intention.name}`);
        this.log(`Plan: ${this.bdi.currentPlan.map(a => a.name).join(' -> ')}`);
      } else {
        this.log("No valid plan found. Exploring...");
        const exploreAction = actions.find(a => a.name === 'Explore');
        if (exploreAction) {
           this.bdi.currentPlan = [exploreAction];
        }
      }
    }

    // 3. Act
    const intent = this.bdi.executeNextAction();
    if (intent) {
      this.resolveIntent(intent);
      // Force replan after an action completes to ensure we adapt to new knowledge
      this.bdi.currentPlan = []; 
    }

    // 4. Environment / Monster Turn
    for (const e of this.state.entities) {
      if (e.traits.includes('large') && e.traits.includes('fast') && e.hp! > 0) {
        const dist = Math.max(Math.abs(this.state.rogue.pos.x - e.pos.x), Math.abs(this.state.rogue.pos.y - e.pos.y));
        if (dist === 1) {
          this.log("Monster attacks you for 10 damage!");
          this.state.rogue.hp! -= 10;
          this.bdi.updateBeliefs({ hp_low: this.state.rogue.hp! < 60 });
          if (this.state.rogue.hp! <= 0) {
            this.bdi.updateBeliefs({ is_alive: false });
            this.log("You died.");
          }
        } else if (dist < 5 && e.isVisible) {
          // Simple monster AI: move towards player if visible and close
          const path = this.findPath(e.pos, this.state.rogue.pos, true);
          if (path && path.length > 0) {
            const nextStep = path[0];
            // Check if next step is occupied
            const entitiesAtNext = this.getEntitiesAt(nextStep);
            if (!entitiesAtNext.some(ent => (ent.traits.includes('large') && ent.traits.includes('fast')) || ent.traits.includes('wall') || (ent.traits.includes('door') && !ent.traits.includes('open')) || ent.traits.includes('rogue'))) {
              e.pos = nextStep;
            }
          }
        }
      }
    }

    // 5. Check Floor Transition
    if (this.bdi.beliefs.floor_cleared && this.state.currentFloor < this.state.maxFloor) {
      this.log(`Descending to floor ${this.state.currentFloor + 1}...`);
      this.state = this.initializeMap(this.state.currentFloor + 1, this.state.rogue);
      
      // Reset BDI for new floor
      this.kg = new KnowledgeGraph();
      this.bdi.currentPlan = [];
      this.bdi.intention = null;
      this.setupAgent();
      this.senseAndPerceive();
    }

    this.onUpdate();
  }
}
