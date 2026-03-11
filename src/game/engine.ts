import { Entity, GameState, Position, ActorEntity, EntityStates, AgentConfiguration, DEFAULT_AGENT_CONFIG } from './types';
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
  config: AgentConfiguration;
  
  // Progress tracking to detect infinite loops
  stuckCounter = 0;
  lastRoguePos: Position | null = null;

  // For UI updates
  onUpdate: () => void = () => {};
  width = 25;
  height = 25;

  constructor(config: AgentConfiguration = DEFAULT_AGENT_CONFIG) {
    this.config = config;
    this.kg = new KnowledgeGraph();
    this.bayesian = new BayesianInference(config);
    this.bdi = new BDIAgent(config);
    
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
        row.push({ type: 'fixture', id: `wall_${x}_${y}`, traits: ['wall'], pos: {x, y}, isExplored: false, isVisible: false });
      }
      grid.push(row);
    }

    // Carve out floors
    digger.create((x, y, value) => {
      if (value === 0) {
        grid[y][x] = { type: 'fixture', id: `floor_${x}_${y}`, traits: ['floor'], pos: {x, y}, isExplored: false, isVisible: false };
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
    const rogue: ActorEntity = previousRogue ? 
      { ...(previousRogue as ActorEntity), pos: { x: playerPos[0], y: playerPos[1] }, currentPath: [] } : 
      { type: 'actor', id: 'rogue', traits: ['rogue'], pos: { x: playerPos[0], y: playerPos[1] }, hp: 100, potions: 0, isExplored: true, isVisible: true, currentPath: [] };
    entities.push(rogue);
    
    // 3. Place Amulet or Stairs in the target room
    const targetPos = targetRoom.getCenter();
    const maxFloor = this.config.mechanics.maxFloor;
    
    if (floorNumber === maxFloor) {
      entities.push({ type: 'item', id: 'amulet_1', traits: ['amulet'], pos: { x: targetPos[0], y: targetPos[1] }, isExplored: false, isVisible: false });
    } else {
      entities.push({ type: 'item', id: `stairs_down_${floorNumber}`, traits: ['stairs'], pos: { x: targetPos[0], y: targetPos[1] }, isExplored: false, isVisible: false });
    }

    // 4. Lock the doors to the target room
    if (startRoom !== targetRoom) {
      targetRoom.getDoors((x, y) => {
        entities.push({ type: 'fixture', id: `door_${x}_${y}`, traits: ['door', 'locked'], pos: {x, y}, isExplored: false, isVisible: false });
      });
    }

    // 5. Flood fill to find all rooms reachable from the start room WITHOUT passing through locked doors
    const reachableRooms = new Set<typeof rooms[0]>();
    const visited = new Set<string>();
    const queue = [playerPos];
    visited.add(`${playerPos[0]},${playerPos[1]}`);

    while (queue.length > 0) {
      const [cx, cy] = queue.shift()!;
      
      // Check if this coordinate is inside any room
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

    const reachableRoomsArr = Array.from(reachableRooms).filter(r => r !== targetRoom);
    // Prefer a room that is NOT the start room for the key, to make it an objective
    const potentialKeyRooms = reachableRoomsArr.filter(r => r !== startRoom);
    const keyRoom = potentialKeyRooms.length > 0 ? 
      potentialKeyRooms[Math.floor(Math.random() * potentialKeyRooms.length)] : 
      startRoom;
    
    // 6. Place Chests, Potions, and Monsters
    let chestCount = 1;
    let monsterCount = 1;
    let potionCount = 1;

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
      
      const traits: any[] = ['chest'];
      if (Math.random() < 0.2) {
        traits.push('mimic');
        if (Math.random() > 0.5) traits.push('breathing');
        if (Math.random() > 0.5) traits.push('suspicious');
      }
      if (room === keyRoom) {
        traits.push('key');
      }

      // Chests
      entities.push({
        type: 'item',
        id: `chest_${chestCount}`,
        traits: traits as any,
        pos: { x: center[0], y: center[1] },
        isExplored: false,
        isVisible: false
      });
      chestCount++;

      // Potions (50% chance per room)
      if (Math.random() > 0.5) {
        entities.push({
          type: 'item',
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
          type: 'actor',
          id: `monster_${monsterCount}`,
          traits: ['large', 'fast'],
          pos: { x: room.getRight() - 1, y: room.getTop() + 1 + m },
          lastPos: { x: room.getRight() - 1, y: room.getTop() + 1 + m },
          hp: this.config.mechanics.monsterBaseHp + (floorNumber * this.config.mechanics.monsterHpScale),
          potions: 0,
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
      frontierTiles: [],
      unreachableFrontier: [],
      thoughts: [],
      lastThoughts: []
    };
  }

  setupAgent() {
    // Count all chests, not just mimics, to correctly initialize beliefs
    const chestCount = this.state.entities.filter(e => e.traits.includes('chest')).length;

    // Initial Beliefs
    const initialEntityStates: EntityStates = {};
    for (let i = 1; i <= chestCount; i++) {
      initialEntityStates[`chest_${i}_opened`] = false;
    }

    this.bdi.updateBeliefs({
      hp_low: this.state.rogue.hp < this.config.thresholds.hpLow,
      is_alive: true,
      has_amulet: false,
      has_key: false,
      has_potion: this.state.rogue.potions > 0,
      has_explosive: false,
      floor_cleared: false,
      has_unknown_tiles: true,
      barricade_destroyed: true,
      entityStates: initialEntityStates
    });

    // Desires
    this.bdi.addDesire({ name: 'Heal', priority: this.config.priorities.healBase, goalState: { hp_low: false } }); // High priority if low HP
    this.bdi.addDesire({ name: 'Stay Alive', priority: this.config.priorities.stayAlive, goalState: { is_alive: true } }); // Highest priority if threatened
    
    // We will dynamically adjust priorities in tick() based on health
    this.bdi.addDesire({ name: 'Explore Floor', priority: this.config.priorities.exploreBase, goalState: { has_unknown_tiles: false } });
    
    if (this.state.currentFloor === this.state.maxFloor) {
      this.bdi.addDesire({ name: 'Get Amulet', priority: this.config.priorities.getAmuletBase, goalState: { has_amulet: true } });
    } else {
      this.bdi.addDesire({ name: 'Descend', priority: this.config.priorities.descendBase, goalState: { floor_cleared: true } });
    }

    // Initial Knowledge
    this.kg.set('rogue', 'is_at', `${this.state.rogue.pos.x},${this.state.rogue.pos.y}`);
  }

  log(msg: string) {
    this.state.log.unshift(`[Turn ${this.state.turn}] ${msg}`);
    if (this.state.log.length > this.config.mechanics.logLimit) this.state.log.pop();
  }

  findNearestFrontier(start: Position): Position | null {
    const queue: {pos: Position, dist: number}[] = [{pos: start, dist: 0}];
    const visited = new Set<string>();
    visited.add(`${start.x},${start.y}`);

    while (queue.length > 0) {
      const {pos, dist} = queue.shift()!;
      
      // Check if this position is a frontier tile and NOT unreachable
      if (this.state.frontierTiles.some(f => f.x === pos.x && f.y === pos.y)) {
        if (!this.state.unreachableFrontier.some(u => u.x === pos.x && u.y === pos.y)) {
          return pos;
        }
      }

      // 4-way connectivity for strict grid movement
      const neighbors = [
        {x: pos.x+1, y: pos.y}, {x: pos.x-1, y: pos.y}, 
        {x: pos.x, y: pos.y+1}, {x: pos.x, y: pos.y-1}
      ];

      for (const n of neighbors) {
        if (n.x >= 0 && n.x < this.width && n.y >= 0 && n.y < this.height && !visited.has(`${n.x},${n.y}`)) {
          const floor = this.state.grid[n.y][n.x];
          
          // Check if blocked by wall or closed door
          const isWall = floor.traits.includes('wall');
          const isClosedDoor = this.getEntitiesAt(n).some(e => e.traits.includes('door') && !e.traits.includes('open'));
          const isBarricade = this.getEntitiesAt(n).some(e => e.traits.includes('barricade'));
          
          if (!isWall && !isClosedDoor && !isBarricade) {
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
    this.kg.set('rogue', 'is_at', `${newPos.x},${newPos.y}`);
    
    this.senseAndPerceive();
    return true;
  }

  senseAndPerceive(): { newDiscovery: boolean, monsterVisible: boolean } {
    return this.observeEnvironment();
  }

  observeEnvironment() {
    // Clear visibility
    this.state.entities.forEach(e => e.isVisible = false);
    this.state.grid.forEach(row => row.forEach(cell => cell.isVisible = false));

    const r = this.config.mechanics.visionRadius;
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
            this.kg.set(e.id, 'is_at', `${e.pos.x},${e.pos.y}`);
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
            if (e.traits.includes('large') || e.traits.includes('fast')) {
                // Update monster_is_elite
                this.bayesian.updateBelief(e.id, evidence, {
                    'large_true': this.config.bayesian.signalHigh, 'large_false': this.config.bayesian.signalLow,
                    'fast_true': this.config.bayesian.signalHigh, 'fast_false': this.config.bayesian.signalLow,
                    'breathing_true': this.config.bayesian.contextHigh, 'breathing_false': this.config.bayesian.contextLow,
                    'suspicious_true': this.config.bayesian.contextHigh, 'suspicious_false': this.config.bayesian.contextLow,
                    'near_dead_end_true': this.config.bayesian.environmentalHigh, 'near_dead_end_false': this.config.bayesian.environmentalLow,
                    'near_blood_splatter_true': this.config.bayesian.environmentalHigh, 'near_blood_splatter_false': this.config.bayesian.environmentalLow
                }, e.pos);
                const pElite = this.bayesian.priors[e.id];
                this.log(`Evaluated ${e.id}: P(Elite) = ${(pElite * 100).toFixed(1)}%`);
            } else if (e.traits.includes('chest')) {
                // Update chest_is_mimic
                this.bayesian.updateBelief(e.id, evidence, {}, e.pos);
                const pMimic = this.bayesian.priors[e.id];
                this.log(`Evaluated ${e.id}: P(Mimic) = ${(pMimic * 100).toFixed(1)}%`);
            } else if (e.traits.includes('blue') || e.traits.includes('high_viscosity') || e.traits.includes('amulet')) {
                // Update item_is_beneficial
                this.bayesian.updateBelief(e.id, evidence, {
                    'blue_true': this.config.bayesian.signalHigh, 'blue_false': this.config.bayesian.signalLow,
                    'high_viscosity_true': this.config.bayesian.signalHigh, 'high_viscosity_false': this.config.bayesian.signalLow,
                    'near_dead_end_true': this.config.bayesian.environmentalLow, 'near_dead_end_false': this.config.bayesian.environmentalHigh,
                    'near_blood_splatter_true': this.config.bayesian.environmentalLow, 'near_blood_splatter_false': this.config.bayesian.environmentalHigh
                }, e.pos);
                const pBeneficial = this.bayesian.priors[e.id];
                this.log(`Evaluated ${e.id}: P(Beneficial) = ${(pBeneficial * 100).toFixed(1)}%`);
            }

            if (e.traits.includes('door')) {
               this.kg.append(e.id, 'is_type', 'door');
               this.bdi.addDesire({ name: `Unlock ${e.id}`, priority: 25, goalState: { entityStates: { [`${e.id}_unlocked`]: true } } });
            }

            if (e.traits.includes('chest')) {
               this.kg.append(e.id, 'is_type', 'chest');
            }

            if (e.traits.includes('amulet')) {
               this.kg.append(e.id, 'is_type', 'amulet');
               this.log(`Spotted the Amulet of Yendor!`);
               newDiscovery = true;
            }

            if (e.traits.includes('stairs')) {
               this.kg.append(e.id, 'is_type', 'stairs_down');
               this.log(`Spotted the stairs to the next floor!`);
               newDiscovery = true;
            }

            if (e.traits.includes('barricade')) {
               this.kg.append(e.id, 'is_type', 'barricade');
               this.log(`Spotted a barricade! It blocks the path.`);
               newDiscovery = true;
            }

            if (e.traits.includes('explosive')) {
               this.kg.append(e.id, 'is_type', 'explosive');
               this.log(`Spotted an explosive! This could be useful.`);
               newDiscovery = true;
            }

            if (e.traits.includes('blue') && e.traits.includes('high_viscosity')) {
               this.kg.append(e.id, 'is_type', 'health_potion');
               this.bdi.addDesire({ name: `Collect ${e.id}`, priority: 30, goalState: { entityStates: { [`${e.id}_collected`]: true } } });
            }
          }

          if (e.type === 'actor' && e.hp > 0) {
            monsterVisible = true;
            this.bdi.addDesire({ name: `Survive ${e.id}`, priority: 100, goalState: { entityStates: { [`${e.id}_threat`]: false } } });
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
            if (dist < this.config.mechanics.visionRadius) {
              const signal = e.traits.includes('large') ? 'auditory_cadence_heavy' : 'auditory_cadence_light';
              this.bayesian.updateBelief(e.id, { [signal]: true }, {
                [`${signal}_true`]: this.config.bayesian.signalHigh,
                [`${signal}_false`]: this.config.bayesian.signalLow
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
      if (prob > this.config.thresholds.mimicHigh) {
        // Confirmations are synced in synchronizeBeliefs()
      } else if (prob < this.config.thresholds.mimicLow) {
        // Confirmations are synced in synchronizeBeliefs()
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
      const isBarricade = entities.some(e => e.traits.includes('barricade'));
      const isMonster = entities.some(e => e.type === 'actor' && e.id !== 'rogue' && e.hp > 0);

      let danger = false;
      if (!ignoreDanger) {
        for (const e of this.state.entities) {
          if (e.traits.includes('mimic') && this.bdi.beliefs.entityStates[`${e.id}_is_mimic`]) {
            if (Math.abs(e.pos.x - x) + Math.abs(e.pos.y - y) <= 1) {
              danger = true;
            }
          }
        }
      }

      return !(isClosedDoor || isBarricade || isMonster || danger);
    };

    if (typeof goal === 'function') {
      const dijkstra = new ROT.Path.Dijkstra(start.x, start.y, passableCallback, {topology: 4});
      let bestPath: Position[] | null = null;
      let bestDist = Infinity;

      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          if (goal({x, y})) {
            const neighbors = [
              {x: x, y: y - 1}, {x: x, y: y + 1},
              {x: x - 1, y: y}, {x: x + 1, y: y}
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
      const astar = new ROT.Path.AStar(goal.x, goal.y, passableCallback, {topology: 4});
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
      cost: this.config.costs.heal,
      preconditions: { has_potion: true, item_is_beneficial: true, hp_low: true },
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
      cost: this.config.costs.move,
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
          cost: this.config.costs.pickup,
          targetId: potion.id,
          preconditions: {}, // Can always pick up if we know about it
          effects: { has_potion: true, entityStates: { [`${potion.id}_collected`]: true } },
          execute: () => {
            const dist = Math.abs(this.state.rogue.pos.x - potion.pos.x) + Math.abs(this.state.rogue.pos.y - potion.pos.y);
            if (dist > 0) {
              const step = this.getNextStepTowards(potion.pos, true);
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

    // Action: Defeat Monster / Flee Monster
    const visibleMonsters = this.state.entities.filter(e => e.type === 'actor' && e.id !== 'rogue' && e.hp > 0 && e.isVisible);
    visibleMonsters.forEach(monster => {
      const isHurt = this.state.rogue.hp < 60;
      const monsterThreatKey = `${monster.id}_threat`;

      actions.push({
        name: `Defeat ${monster.id}`,
        cost: isHurt ? this.config.costs.attackBase * this.config.costs.hurtPenaltyMultiplier : this.config.costs.attackBase,
        targetId: monster.id,
        preconditions: { entityStates: { [monsterThreatKey]: true } },
        effects: { entityStates: { [monsterThreatKey]: false } },
        execute: () => {
          const dist = Math.abs(this.state.rogue.pos.x - monster.pos.x) + Math.abs(this.state.rogue.pos.y - monster.pos.y);
          if (dist > 1) {
            const step = this.getNextStepTowards(monster.pos, true);
            if (step) {
              return { intent: { type: 'MOVE', dx: step.dx, dy: step.dy, reason: `Charging at ${monster.id}` }, status: 'in_progress' };
            }
            return { intent: null, status: 'failed' };
          } else {
            return { intent: { type: 'ATTACK', targetId: monster.id }, status: 'completed' };
          }
        }
      });

      actions.push({
        name: `Flee ${monster.id}`,
        cost: isHurt ? this.config.costs.fleeBase : this.config.costs.fleeBase * this.config.costs.hurtPenaltyMultiplier,
        targetId: monster.id,
        preconditions: { entityStates: { [monsterThreatKey]: true } },
        effects: { entityStates: { [monsterThreatKey]: false } },
        execute: () => {
          const dx = this.state.rogue.pos.x - monster.pos.x;
          const dy = this.state.rogue.pos.y - monster.pos.y;
          
          // Prefer moving to explored safe tiles
          const safeMoves = [
            {x: 1, y: 0}, {x: -1, y: 0}, {x: 0, y: 1}, {x: 0, y: -1}
          ].filter(m => {
             const nx = this.state.rogue.pos.x + m.x;
             const ny = this.state.rogue.pos.y + m.y;
             if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) return false;
             const floor = this.state.grid[ny][nx];
             if (floor.traits.includes('wall')) return false;
             
             // Avoid moving closer to the monster
             const newDist = Math.abs(nx - monster.pos.x) + Math.abs(ny - monster.pos.y);
             const oldDist = Math.abs(dx) + Math.abs(dy);
             if (newDist < oldDist) return false;
             
             // Check for other entities blocking
             const entitiesAtNext = this.getEntitiesAt({x: nx, y: ny});
             if (entitiesAtNext.some(ent => (ent.traits.includes('large') && ent.traits.includes('fast')) || (ent.traits.includes('door') && !ent.traits.includes('open')))) return false;
             
             return true;
          });
          
          if (safeMoves.length > 0) {
             // Sort by distance from monster (descending)
             safeMoves.sort((a, b) => {
                const distA = Math.abs(this.state.rogue.pos.x + a.x - monster.pos.x) + Math.abs(this.state.rogue.pos.y + a.y - monster.pos.y);
                const distB = Math.abs(this.state.rogue.pos.x + b.x - monster.pos.x) + Math.abs(this.state.rogue.pos.y + b.y - monster.pos.y);
                return distB - distA;
             });
             
             return { intent: { type: 'MOVE', dx: safeMoves[0].x, dy: safeMoves[0].y, reason: `Fleeing from ${monster.id}` }, status: 'completed' };
          } else {
             return { intent: { type: 'ATTACK', targetId: monster.id }, status: 'completed' };
          }
        }
      });
    });

    // Action: Unlock Door
    const doors = this.state.entities.filter(e => e.traits.includes('door'));
    doors.forEach(door => {
      if (this.kg.has(door.id, 'is_type', 'door')) {
        const doorUnlockedKey = `${door.id}_unlocked`;
        actions.push({
          name: `Unlock ${door.id}`,
          cost: this.config.costs.unlockDoor,
          targetId: door.id,
          preconditions: { has_key: true, entityStates: { [doorUnlockedKey]: false } },
          effects: { entityStates: { [doorUnlockedKey]: true } },
          execute: () => {
            const dist = Math.abs(this.state.rogue.pos.x - door.pos.x) + Math.abs(this.state.rogue.pos.y - door.pos.y);
            if (dist > 1) {
              const step = this.getNextStepTowards(door.pos, true);
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
      const entityPreconditions: EntityStates = {};
      // All known locked doors must be unlocked
      this.state.entities.filter(e => e.traits.includes('door') && e.isExplored && e.traits.includes('locked')).forEach(door => {
          entityPreconditions[`${door.id}_unlocked`] = true;
      });

      actions.push({
        name: 'Descend Stairs',
        cost: this.config.costs.descendStairs,
        targetId: stairs.id,
        preconditions: { floor_cleared: false, barricade_destroyed: true, entityStates: entityPreconditions },
        effects: { floor_cleared: true },
        execute: () => {
          const dist = Math.abs(this.state.rogue.pos.x - stairs.pos.x) + Math.abs(this.state.rogue.pos.y - stairs.pos.y);
          if (dist > 0) {
            const step = this.getNextStepTowards(stairs.pos, true);
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
      const entityPreconditions: EntityStates = {};
      // All known locked doors must be unlocked
      this.state.entities.filter(e => e.traits.includes('door') && e.isExplored && e.traits.includes('locked')).forEach(door => {
          entityPreconditions[`${door.id}_unlocked`] = true;
      });

      actions.push({
        name: 'Get Amulet',
        cost: this.config.costs.getAmulet,
        targetId: amulet.id,
        preconditions: { has_amulet: false, barricade_destroyed: true, entityStates: entityPreconditions },
        effects: { has_amulet: true },
        execute: () => {
          const dist = Math.abs(this.state.rogue.pos.x - amulet.pos.x) + Math.abs(this.state.rogue.pos.y - amulet.pos.y);
          if (dist > 0) {
            const step = this.getNextStepTowards(amulet.pos, true);
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
    const chests = this.state.entities.filter(e => e.traits.includes('chest'));
    for (const chest of chests) {
      const chestId = chest.id;
      if (this.kg.has(chestId, 'is_type', 'chest')) {
        const isMimicBelief = this.bdi.beliefs.entityStates[`${chestId}_is_mimic`];
        
        actions.push({
          name: `Open ${chestId}`,
          cost: isMimicBelief ? this.config.costs.mimicPenalty : this.config.costs.openChestBase + ((this.bayesian.globalPriors['mimic'] || this.config.bayesian.defaultMimicPrior) * this.config.costs.mimicPenalty),
          targetId: chestId,
          preconditions: { entityStates: { [`${chestId}_opened`]: false } },
          effects: { has_key: true, entityStates: { [`${chestId}_opened`]: true } },
          execute: () => {
            const dist = Math.abs(this.state.rogue.pos.x - chest.pos.x) + Math.abs(this.state.rogue.pos.y - chest.pos.y);
            if (dist > 1) {
              const step = this.getNextStepTowards(chest.pos, true);
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

    // Action: Get Explosive
    const explosive = this.state.entities.find(e => e.traits.includes('explosive'));
    if (explosive && this.kg.has(explosive.id, 'is_type', 'explosive')) {
      actions.push({
        name: 'Get Explosive',
        cost: this.config.costs.pickup,
        targetId: explosive.id,
        preconditions: { has_explosive: false },
        effects: { has_explosive: true, entityStates: { [`${explosive.id}_collected`]: true } },
        execute: () => {
          const dist = Math.abs(this.state.rogue.pos.x - explosive.pos.x) + Math.abs(this.state.rogue.pos.y - explosive.pos.y);
          if (dist > 0) {
            const step = this.getNextStepTowards(explosive.pos, true);
            if (step) {
              return { intent: { type: 'MOVE', dx: step.dx, dy: step.dy, reason: "Moving towards explosive" }, status: 'in_progress' };
            }
            return { intent: null, status: 'failed' };
          } else {
            return { intent: { type: 'PICK_UP', targetId: explosive.id }, status: 'completed' };
          }
        }
      });
    }

    // Action: Destroy Barricade
    const barricades = this.state.entities.filter(e => e.traits.includes('barricade'));
    barricades.forEach(barricade => {
      if (this.kg.has(barricade.id, 'is_type', 'barricade')) {
        actions.push({
          name: `Destroy ${barricade.id}`,
          cost: this.config.costs.destroyBarricade,
          targetId: barricade.id,
          preconditions: { has_explosive: true, barricade_destroyed: false },
          effects: { barricade_destroyed: true, entityStates: { [`${barricade.id}_destroyed`]: true } },
          execute: () => {
            const dist = Math.abs(this.state.rogue.pos.x - barricade.pos.x) + Math.abs(this.state.rogue.pos.y - barricade.pos.y);
            if (dist > 1) {
              const step = this.getNextStepTowards(barricade.pos, true);
              if (step) {
                return { intent: { type: 'MOVE', dx: step.dx, dy: step.dy, reason: `Moving towards ${barricade.id}` }, status: 'in_progress' };
              }
              return { intent: null, status: 'failed' };
            } else {
              return { intent: { type: 'DESTROY', targetId: barricade.id }, status: 'completed' };
            }
          }
        });
      }
    });

    // Action: Explore
    actions.push({
      name: 'Explore',
      cost: this.config.costs.move,
      preconditions: {}, // Unrestricted selection
      effects: { has_unknown_tiles: false },
      execute: () => {
        // Use existing path if valid AND adjacent (prevent teleport)
        if (this.state.rogue.currentPath && this.state.rogue.currentPath.length > 0) {
          const nextStep = this.state.rogue.currentPath[0];
          const dist = Math.abs(nextStep.x - this.state.rogue.pos.x) + Math.abs(nextStep.y - this.state.rogue.pos.y);
          
          // Check if next step is still valid and adjacent
          const floor = this.state.grid[nextStep.y][nextStep.x];
          if (!floor.traits.includes('wall') && dist === 1) {
            this.state.rogue.currentPath.shift();
            return { intent: { type: 'EXPLORE', dx: nextStep.x - this.state.rogue.pos.x, dy: nextStep.y - this.state.rogue.pos.y, reason: "Following path" }, status: 'in_progress' };
          } else {
            // Path is stale or invalid, clear it to force recalculation
            this.state.rogue.currentPath = [];
          }
        }

        // Find nearest frontier tile
        const target = this.findNearestFrontier(this.state.rogue.pos);

        if (target) {
          const path = this.findPath(this.state.rogue.pos, target);
          if (path && path.length > 0) {
            this.state.rogue.currentPath = path;
            const nextStep = this.state.rogue.currentPath.shift()!;
            return { intent: { type: 'EXPLORE', dx: nextStep.x - this.state.rogue.pos.x, dy: nextStep.y - this.state.rogue.pos.y, reason: "Exploring frontier" }, status: 'in_progress' };
          } else {
            this.state.thoughts.push(`Status: Nearest frontier at ${target.x},${target.y} is currently unreachable.`);
            this.state.unreachableFrontier.push(target);
            return { intent: null, status: 'in_progress' };
          }
        } else {
          this.state.thoughts.push("Status: No reachable unknown tiles left to explore.");
          this.log("No more reachable tiles to explore.");
          return { intent: null, status: 'completed' };
        }
      }
    });

    return actions;
  }

  clearUnreachableBlacklist() {
    if (this.state.unreachableFrontier.length > 0) {
      this.log("Environmental change detected. Re-evaluating unreachable areas.");
      this.state.unreachableFrontier = [];
      this.bdi.updateBeliefs({ has_unknown_tiles: true });
    }
  }

  resolveIntent(intent: Intent) {
    switch (intent.type) {
      case 'MOVE':
      case 'EXPLORE':
        this.moveRogue(intent.dx, intent.dy);
        break;
      case 'HEAL':
        if (this.state.rogue.potions > 0) {
          this.state.rogue.potions--;
          this.state.rogue.hp = Math.min(100, this.state.rogue.hp + this.config.mechanics.potionHealAmount);
          this.log(`Drank a potion! HP is now ${this.state.rogue.hp}. Potions left: ${this.state.rogue.potions}`);
        }
        break;
      case 'DESCEND':
        this.kg.set('floor', 'status', 'cleared');
        this.log("Descended the stairs!");
        break;
      case 'ATTACK': {
        const monster = this.state.entities.find(e => e.id === intent.targetId);
        if (monster && monster.type === 'actor' && monster.hp > 0) {
          this.log(`Attacking ${monster.id}!`);
          monster.hp -= this.config.mechanics.playerAttackDamage;
          if (monster.hp <= 0) {
            this.log(`${monster.id} defeated!`);
            monster.traits = ['floor']; // turn into corpse/floor
            this.clearUnreachableBlacklist();
          }
        }
        break;
      }
      case 'OPEN_DOOR': {
        const door = this.state.entities.find(e => e.id === intent.targetId);
        if (door && !door.traits.includes('open')) {
          door.traits = door.traits.filter(t => t !== 'locked');
          door.traits.push('open');
          this.log(`Unlocked ${door.id}!`);
          this.clearUnreachableBlacklist();
        }
        break;
      }
      case 'PICK_UP': {
        const item = this.state.entities.find(e => e.id === intent.targetId);
        if (item) {
          if (item.traits.includes('explosive')) {
            this.kg.append('rogue', 'has_item', 'explosive');
            this.log(`Picked up an explosive!`);
          } else if (item.traits.includes('amulet')) {
            this.kg.append('rogue', 'has_item', 'amulet');
            this.log(`Picked up the Amulet!`);
          }
 else {
            this.state.rogue.potions = (this.state.rogue.potions || 0) + 1;
            this.kg.set(item.id, 'has_item', 'rogue');
            this.log(`Picked up a health potion! Total: ${this.state.rogue.potions}`);
          }
          this.state.entities = this.state.entities.filter(e => e.id !== item.id);
        }
        break;
      }
      case 'DESTROY': {
        const target = this.state.entities.find(e => e.id === intent.targetId);
        if (target && target.traits.includes('barricade')) {
          this.kg.remove('rogue', 'has_item', 'explosive');
          this.log(`Boom! ${target.id} destroyed!`);
          this.state.entities = this.state.entities.filter(e => e.id !== target.id);
          this.clearUnreachableBlacklist();
        }
        break;
      }
      case 'OPEN_CHEST': {
        const chest = this.state.entities.find(e => e.id === intent.targetId);
        if (chest) {
          this.bayesian.updateGlobalPrior('mimic', chest.traits.includes('mimic'));
          this.bayesian.updatePrior(chest.id, chest.traits.includes('mimic'));
          this.kg.set(chest.id, 'status', 'opened');
          
          if (chest.traits.includes('mimic')) {
            this.log(`Oh no! ${chest.id} was a Mimic!`);
            this.state.rogue.hp -= this.config.mechanics.mimicAttackDamage;
            if (this.state.rogue.hp <= 0) {
              this.log("You died.");
            }
          }
          
          if (chest.traits.includes('key')) {
            this.kg.append('rogue', 'has_item', 'key');
            this.log(`Found a key in ${chest.id}!`);
          } else if (!chest.traits.includes('mimic')) {
            this.log(`${chest.id} was empty.`);
          }
        }
        break;
      }
    }
  }

  synchronizeBeliefs() {
    const newEntityStates: EntityStates = {};

    // Parameterized door beliefs
    this.state.entities.filter(e => e.traits.includes('door')).forEach(door => {
      if (door.isExplored) {
        newEntityStates[`${door.id}_unlocked`] = !door.traits.includes('locked');
      }
    });

    // Parameterized monster beliefs
    this.state.entities.forEach(e => {
      if (e.type === 'actor' && e.id !== 'rogue') {
        newEntityStates[`${e.id}_threat`] = e.isVisible && e.hp > 0;
      }
    });

    // Sync individual entity beliefs from Knowledge Graph
    this.kg.query().forEach(triple => {
      if (triple.predicate === 'status' && triple.object === 'opened') {
         newEntityStates[`${triple.subject}_opened`] = true;
      }
      if (triple.predicate === 'has_item' && triple.object === 'rogue') {
         newEntityStates[`${triple.subject}_collected`] = true;
      }
    });

    // Sync Bayesian priors
    for (const [id, prob] of Object.entries(this.bayesian.priors)) {
      if (prob > this.config.thresholds.mimicHigh) {
        newEntityStates[`${id}_is_confirmed`] = true;
        // Specific inferences
        if (id.startsWith('monster_')) newEntityStates[`${id}_is_elite`] = true;
        if (id.startsWith('chest_')) newEntityStates[`${id}_is_mimic`] = true;
        if (id.startsWith('potion_') || id.startsWith('amulet_')) newEntityStates[`${id}_is_beneficial`] = true;
      } else if (prob < this.config.thresholds.mimicLow) {
        newEntityStates[`${id}_is_confirmed`] = false;
        if (id.startsWith('chest_')) newEntityStates[`${id}_is_mimic`] = false;
      }
    }

    this.bdi.updateBeliefs({
      is_alive: this.state.rogue.hp > 0,
      hp_low: this.state.rogue.hp < this.config.thresholds.hpLow,
      has_potion: this.state.rogue.potions > 0,
      has_amulet: this.kg.has('rogue', 'has_item', 'amulet'),
      has_key: this.kg.has('rogue', 'has_item', 'key'),
      has_explosive: this.kg.has('rogue', 'has_item', 'explosive'),
      barricade_destroyed: !this.state.entities.some(e => e.traits.includes('barricade') && e.isExplored),
      has_unknown_tiles: this.state.frontierTiles.length > 0 && this.state.frontierTiles.some(f => !this.state.unreachableFrontier.some(u => u.x === f.x && u.y === f.y)),
      floor_cleared: this.kg.has('floor', 'status', 'cleared'),
      item_is_beneficial: this.state.rogue.potions > 0 && this.kg.query(undefined, 'has_item', 'rogue').some(t => newEntityStates[`${t.subject}_is_confirmed`] && newEntityStates[`${t.subject}_is_beneficial`]),
      unseen_entity_is_large: this.state.entities.some(e => !e.isVisible && newEntityStates[`${e.id}_is_confirmed`] && newEntityStates[`${e.id}_is_elite`]),
      entityStates: newEntityStates
    });
  }

  recalculateDesirePriorities(explorationPercentage: number) {
    const isHurt = this.state.rogue.hp < this.config.thresholds.hpLow;
    const hasPotion = this.state.rogue.potions > 0;

    const descendDesire = this.bdi.desires.find(d => d.name === 'Descend');
    const exploreDesire = this.bdi.desires.find(d => d.name === 'Explore Floor');
    const getAmuletDesire = this.bdi.desires.find(d => d.name === 'Get Amulet');
    const healDesire = this.bdi.desires.find(d => d.name === 'Heal');

    if (isHurt) {
      if (descendDesire) descendDesire.priority = 95;
      if (getAmuletDesire) getAmuletDesire.priority = 95;
      
      // Scale Unlock Door desires when hurt
      this.bdi.desires.forEach(d => {
        if (d.name.startsWith('Unlock door_')) {
          d.priority = 90;
        }
      });

      if (exploreDesire) exploreDesire.priority = 10;
      if (healDesire) healDesire.priority = hasPotion ? 98 : 80;
    } else {
      // Priority of descending/amulet increases as exploration progresses
      if (descendDesire) descendDesire.priority = Math.max(this.config.priorities.descendBase, explorationPercentage);
      if (getAmuletDesire) getAmuletDesire.priority = Math.max(this.config.priorities.getAmuletBase, explorationPercentage);
      
      // Scale Unlock Door desires as well
      this.bdi.desires.forEach(d => {
        if (d.name.startsWith('Unlock door_')) {
          d.priority = Math.max(this.config.priorities.unlockDoorBase, explorationPercentage);
        }
      });

      // Priority of exploration scales inversely with percentage explored
      if (exploreDesire) exploreDesire.priority = Math.max(this.config.priorities.exploreBase, this.config.thresholds.explorationScale - explorationPercentage);
      if (healDesire) healDesire.priority = this.config.priorities.healBase;
    }
  }

  tick() {
    if (!this.bdi.beliefs.is_alive) return;
    if (this.bdi.beliefs.has_amulet) return;

    this.state.turn++;
    const turnThoughts: string[] = [];
    
    // 1. Sense
    this.senseAndPerceive();
    this.processAuditorySignals();
    this.evaluateProbabilities();

    // Calculate exploration percentage
    const totalWalkable = this.state.grid.flat().filter(f => !f.traits.includes('wall')).length;
    const exploredWalkable = this.state.grid.flat().filter(f => f.isExplored && !f.traits.includes('wall')).length;
    const explorationPercentage = (exploredWalkable / totalWalkable) * 100;

    // PIPELINE: Synchronize KG/Bayesian -> BDI Beliefs
    this.synchronizeBeliefs();

    // PIPELINE: Recalculate Priorities (extracted from BDI module)
    this.recalculateDesirePriorities(explorationPercentage);

    // Belief summary for thoughts
    const keyStatus = this.bdi.beliefs.has_key ? "Have Key" : "Need Key";
    const amuletStatus = this.bdi.beliefs.has_amulet ? "Have Amulet" : "Searching for Amulet";
    turnThoughts.push(`Beliefs: ${keyStatus}, ${amuletStatus}, HP: ${this.state.rogue.hp}`);

    // Summary of threats for perception logic
    const monsterVisible = this.state.entities.some(e => e.type === 'actor' && e.id !== 'rogue' && e.hp > 0 && e.isVisible);

    this.bdi.perceive({
      hp: this.state.rogue.hp,
      maxHp: 100,
      potions: this.state.rogue.potions,
      monsterVisible,
      newDiscovery: false, 
      explorationPercentage
    });

    // 2. Think
    const actions = this.generateActions();
    
    // Stuck Detection: Force replan if we haven't moved in several turns
    if (this.lastRoguePos && this.lastRoguePos.x === this.state.rogue.pos.x && this.lastRoguePos.y === this.state.rogue.pos.y) {
      this.stuckCounter++;
    } else {
      this.stuckCounter = 0;
    }
    this.lastRoguePos = { ...this.state.rogue.pos };

    if (this.stuckCounter >= this.config.mechanics.stuckThreshold) {
      this.log("Progress stalled. Forcing replan.");
      turnThoughts.push("Status: Progress stalled. Resetting plan and path.");
      this.bdi.currentPlan = [];
      this.state.rogue.currentPath = [];
      this.stuckCounter = 0; // Reset after forcing replan
    }

    // Re-evaluate plan if empty
    if (this.bdi.currentPlan.length === 0) {
      this.bdi.deliberate(actions, (targetId: string) => {
        const target = this.state.entities.find(e => e.id === targetId);
        if (!target) return Infinity;
        const path = this.findPath(this.state.rogue.pos, target.pos, true);
        return path ? path.length : Infinity;
      });
      if (this.bdi.intention) {
        this.log(`Formed Intention: ${this.bdi.intention.name}`);
        this.log(`Plan: ${this.bdi.currentPlan.map(a => a.name).join(' -> ')}`);
        
        turnThoughts.push(`Intention: ${this.bdi.intention.name} (Priority: ${this.bdi.intention.priority.toFixed(1)})`);
        turnThoughts.push(`Strategy: ${this.bdi.currentPlan.map(a => a.name).join(' → ')}`);
      } else {
        this.log("No valid plan found. Waiting...");
        turnThoughts.push("Status: No valid plan found. Waiting for next event.");
      }
    } else {
      turnThoughts.push(`Continuing Plan: ${this.bdi.currentPlan.map(a => a.name).join(' → ')}`);
    }

    // 3. Act
    const intent = this.bdi.executeNextAction();
    if (intent) {
      if ('reason' in intent && intent.reason) {
        turnThoughts.push(`Action: ${intent.type} (${intent.reason})`);
      } else {
        turnThoughts.push(`Action: ${intent.type}`);
      }
      this.resolveIntent(intent);
      // Force replan and clear stale path after an action completes to ensure we adapt to new knowledge
      this.bdi.currentPlan = []; 
      this.state.rogue.currentPath = []; 
    }

    // COMMIT THOUGHTS IF CHANGED
    // Compare turnThoughts with this.state.lastThoughts (excluding Turn Header)
    const hasChanged = turnThoughts.length !== this.state.lastThoughts.length || 
                       turnThoughts.some((val, index) => val !== this.state.lastThoughts[index]);

    if (hasChanged) {
      // Reorder turnThoughts to ensure logical flow in the reversed UI
      // Original: [Beliefs, Intention, Strategy, Action]
      // Target display order: [Turn Header, Beliefs, Intention, Strategy, Action]
      // Since UI reverses, array needs to be: [Action, Strategy, Intention, Beliefs, Turn Header]
      
      const reversedTurnThoughts = [...turnThoughts].reverse();
      const newEntries = [...reversedTurnThoughts, `--- TURN ${this.state.turn} ---`];
      
      this.state.thoughts.push(...newEntries);
      this.state.lastThoughts = turnThoughts;

      // Keep thought log size manageable
      if (this.state.thoughts.length > 200) {
        this.state.thoughts = this.state.thoughts.slice(-200);
      }
    }

    // 4. Environment / Monster Turn
    for (const e of this.state.entities) {
      if (e.type === 'actor' && e.id !== 'rogue' && e.hp > 0) {
        const dist = Math.abs(this.state.rogue.pos.x - e.pos.x) + Math.abs(this.state.rogue.pos.y - e.pos.y);
        if (dist === 1) {
          this.log(`Monster attacks you for ${this.config.mechanics.monsterAttackDamage} damage!`);
          this.state.rogue.hp -= this.config.mechanics.monsterAttackDamage;
          if (this.state.rogue.hp <= 0) {
            this.log("You died.");
          }
        } else if (dist < this.config.mechanics.visionRadius && e.isVisible) {
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
