import { Entity, GameState, Position } from './types';
import { KnowledgeGraph } from './knowledgeGraph';
import { BayesianInference } from './bayesian';
import { BDIAgent, Desire } from './bdi';
import { GOAPAction } from './goap';
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
    this.observeEnvironment(); // Initial observation
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
        row.push({ id: `wall_${x}_${y}`, type: 'wall', pos: {x, y}, isExplored: false, isVisible: false });
      }
      grid.push(row);
    }

    // Carve out floors
    digger.create((x, y, value) => {
      if (value === 0) {
        grid[y][x] = { id: `floor_${x}_${y}`, type: 'floor', pos: {x, y}, isExplored: false, isVisible: false };
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
      { ...previousRogue, pos: { x: playerPos[0], y: playerPos[1] } } : 
      { id: 'rogue', type: 'rogue', pos: { x: playerPos[0], y: playerPos[1] }, hp: 100, potions: 0, isExplored: true, isVisible: true };
    entities.push(rogue);
    
    // 3. Place Amulet or Stairs in the target room
    const targetPos = targetRoom.getCenter();
    const maxFloor = 5;
    
    if (floorNumber === maxFloor) {
      entities.push({ id: 'amulet_1', type: 'amulet', pos: { x: targetPos[0], y: targetPos[1] }, isExplored: false, isVisible: false });
    } else {
      entities.push({ id: `stairs_down_${floorNumber}`, type: 'stairs_down', pos: { x: targetPos[0], y: targetPos[1] }, isExplored: false, isVisible: false });
    }

    // 4. Lock the doors to the target room
    if (startRoom !== targetRoom) {
      targetRoom.getDoors((x, y) => {
        entities.push({ id: `door_${x}_${y}`, type: 'door', pos: {x, y}, isLocked: true, isOpen: false, isExplored: false, isVisible: false });
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
        
        const isWall = grid[ny][nx].type === 'wall';
        const isLockedDoor = entities.some(e => e.type === 'door' && e.pos.x === nx && e.pos.y === ny && e.isLocked);
        
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
        type: 'chest',
        pos: { x: center[0], y: center[1] },
        hasKey: i === 0, // First room in the sorted array gets the key
        isBreathing: Math.random() > 0.7,
        suspiciousLocation: Math.random() > 0.7,
        isExplored: false,
        isVisible: false
      });
      chestCount++;

      // Potions (50% chance per room)
      if (Math.random() > 0.5) {
        entities.push({
          id: `potion_${potionCount}`,
          type: 'health_potion',
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
          type: 'monster', 
          pos: { x: room.getRight() - 1, y: room.getTop() + 1 + m }, 
          hp: 20 + (floorNumber * 10), 
          isExplored: false, 
          isVisible: false 
        });
        monsterCount++;
      }
    }

    return {
      grid,
      entities,
      rogue,
      turn: this.state ? this.state.turn : 0,
      log: this.state ? this.state.log : [`You enter the dungeon. Floor ${floorNumber} of ${maxFloor}.`],
      currentFloor: floorNumber,
      maxFloor: maxFloor
    };
  }

  setupAgent() {
    // Count chests to initialize beliefs
    const chestCount = this.state.entities.filter(e => e.type === 'chest').length;

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
      floor_fully_explored: false
    };
    for (let i = 1; i <= chestCount; i++) {
      initialBeliefs[`chest_${i}_opened`] = false;
    }
    this.bdi.updateBeliefs(initialBeliefs);

    // Desires
    this.bdi.addDesire({ name: 'Heal', priority: 90, goalState: { hp_low: false } }); // High priority if low HP
    this.bdi.addDesire({ name: 'Stay Alive', priority: 100, goalState: { is_alive: true, monster_threat: false } }); // Highest priority if threatened
    
    // We will dynamically adjust priorities in tick() based on health
    this.bdi.addDesire({ name: 'Explore Floor', priority: 20, goalState: { floor_fully_explored: true } });
    
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

  getEntitiesAt(pos: Position): Entity[] {
    return this.state.entities.filter(e => e.pos.x === pos.x && e.pos.y === pos.y);
  }

  moveRogue(dx: number, dy: number): boolean {
    const newPos = { x: this.state.rogue.pos.x + dx, y: this.state.rogue.pos.y + dy };
    
    // Check bounds
    if (newPos.x < 0 || newPos.y < 0 || newPos.x >= this.width || newPos.y >= this.height) return false;

    // Check grid for wall
    const floor = this.state.grid[newPos.y][newPos.x];
    if (floor.type === 'wall') return false;

    // Check collisions
    const entities = this.getEntitiesAt(newPos);
    const door = entities.find(e => e.type === 'door');
    if (door && !door.isOpen) {
      return false;
    }

    this.state.rogue.pos = newPos;
    this.kg.remove('rogue', 'is_at', `${this.state.rogue.pos.x - dx},${this.state.rogue.pos.y - dy}`);
    this.kg.add('rogue', 'is_at', `${newPos.x},${newPos.y}`);
    
    this.observeEnvironment();
    return true;
  }

  observeEnvironment() {
    // Clear visibility
    this.state.entities.forEach(e => e.isVisible = false);
    this.state.grid.forEach(row => row.forEach(cell => cell.isVisible = false));

    const r = 5;
    const { x: rx, y: ry } = this.state.rogue.pos;

    const markVisible = (e: Entity) => {
      e.isVisible = true;
      e.isExplored = true;
    };

    let newDiscovery = false;
    let monsterVisible = false;

    const lightPasses = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
      const floor = this.state.grid[y][x];
      if (floor.type === 'wall') return false;
      const entities = this.getEntitiesAt({x, y});
      return !entities.some(e => e.type === 'door' && !e.isOpen);
    };

    const fov = new ROT.FOV.PreciseShadowcasting(lightPasses);

    fov.compute(rx, ry, r, (x, y, r, visibility) => {
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
      
      const floor = this.state.grid[y][x];
      markVisible(floor);
      
      const entities = this.getEntitiesAt({x, y});
      entities.forEach(e => {
        markVisible(e);
        if (e.type !== 'floor' && e.type !== 'wall' && e.type !== 'rogue') {
          if (!this.kg.has(e.id, 'is_at', `${e.pos.x},${e.pos.y}`)) {
            this.kg.add(e.id, 'is_at', `${e.pos.x},${e.pos.y}`);
            this.kg.add(e.id, 'is_type', e.type);
            this.log(`Spotted ${e.type} at ${e.pos.x},${e.pos.y}`);

            if (e.type === 'chest' || e.type === 'monster' || e.type === 'door' || e.type === 'health_potion' || e.type === 'stairs_down') {
              newDiscovery = true;
            }

            if (e.type === 'chest') {
              // Bayesian inference
              const pMimic = this.bayesian.update(e.isBreathing || false, e.suspiciousLocation || false);
              this.kg.add(e.id, 'prob_mimic', pMimic.toFixed(2));
              this.log(`Evaluated ${e.id}: P(Mimic) = ${(pMimic * 100).toFixed(1)}%`);
              
              // Update beliefs based on probability
              if (pMimic > 0.5) {
                 this.bdi.updateBeliefs({ [`${e.id}_is_mimic`]: true });
              } else {
                 this.bdi.updateBeliefs({ [`${e.id}_is_mimic`]: false });
                 this.bdi.addDesire({ name: `Open ${e.id}`, priority: 5, goalState: { [`${e.id}_opened`]: true } });
              }
            }

            if (e.type === 'door') {
               this.bdi.addDesire({ name: `Unlock ${e.id}`, priority: 4, goalState: { door_unlocked: true } });
            }

            if (e.type === 'health_potion') {
               this.bdi.addDesire({ name: `Collect ${e.id}`, priority: 30, goalState: { [`${e.id}_collected`]: true } });
            }
          }

          if (e.type === 'monster' && e.hp! > 0) {
            monsterVisible = true;
          }
        }
      });
    });

    if (newDiscovery) {
      this.log("New entity spotted! Interrupting current plan.");
      this.bdi.currentPlan = [];
    }

    if (monsterVisible !== this.bdi.beliefs.monster_threat) {
      this.bdi.updateBeliefs({ monster_threat: monsterVisible });
      if (monsterVisible) {
        this.log("Monster threat detected! Replanning for survival.");
        this.bdi.currentPlan = [];
      }
    }
  }

  findPath(start: Position, goal: Position | ((pos: Position) => boolean), ignoreDanger = false): Position[] | null {
    const passableCallback = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
      if (x === start.x && y === start.y) return true;
      if (typeof goal !== 'function' && x === goal.x && y === goal.y) return true;

      const floor = this.state.grid[y][x];
      if (!floor.isExplored && !ignoreDanger) return false;
      if (floor.type === 'wall') return false;

      const entities = this.getEntitiesAt({x, y});
      const isClosedDoor = entities.some(e => e.type === 'door' && !e.isOpen);
      const isMonster = entities.some(e => e.type === 'monster' && e.hp! > 0);

      let danger = false;
      if (!ignoreDanger) {
        for (const e of this.state.entities) {
          if (e.type === 'chest' && this.bdi.beliefs[`${e.id}_is_mimic`]) {
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

  stepTowards(target: Position, ignoreDanger = false): boolean {
    const path = this.findPath(this.state.rogue.pos, target, ignoreDanger);
    if (path && path.length > 0) {
      const nextStep = path[0];
      this.moveRogue(nextStep.x - this.state.rogue.pos.x, nextStep.y - this.state.rogue.pos.y);
      return true;
    }
    return false;
  }

  generateActions(): GOAPAction[] {
    const actions: GOAPAction[] = [];

    // Action: Drink Potion
    actions.push({
      name: 'Drink Potion',
      cost: 1,
      preconditions: { has_potion: true, hp_low: true },
      effects: { hp_low: false },
      execute: () => {
        if (this.state.rogue.potions && this.state.rogue.potions > 0) {
          this.state.rogue.potions--;
          this.state.rogue.hp = Math.min(100, (this.state.rogue.hp || 0) + 50);
          this.log(`Drank a potion! HP is now ${this.state.rogue.hp}. Potions left: ${this.state.rogue.potions}`);
          this.bdi.updateBeliefs({ 
            hp_low: this.state.rogue.hp < 60,
            has_potion: this.state.rogue.potions > 0
          });
          return true;
        }
        return false;
      }
    });

    // Action: Pick Up Potion
    const potions = this.state.entities.filter(e => e.type === 'health_potion');
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
              this.log(`Moving towards potion...`);
              const moved = this.stepTowards(potion.pos);
              if (!moved) return true;
              return false;
            } else {
              this.state.rogue.potions = (this.state.rogue.potions || 0) + 1;
              this.bdi.updateBeliefs({ has_potion: true, [`${potion.id}_collected`]: true });
              this.log(`Picked up a health potion! Total: ${this.state.rogue.potions}`);
              // Remove potion from map
              this.state.entities = this.state.entities.filter(e => e.id !== potion.id);
              return true;
            }
          }
        });
      }
    });

    // Action: Defeat Monster
    const monster = this.state.entities.find(e => e.type === 'monster' && e.hp! > 0 && e.isVisible);
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
            this.log("Charging at monster...");
            const moved = this.stepTowards(monster.pos, true);
            if (!moved) return true; // replan
            return false;
          } else {
            this.log("Attacking monster!");
            monster.hp! -= 15;
            if (monster.hp! <= 0) {
              this.log("Monster defeated!");
              this.bdi.updateBeliefs({ monster_threat: false });
              monster.type = 'floor'; // turn into corpse/floor
              return true;
            }
            return false; // still fighting
          }
        }
      });

      actions.push({
        name: 'Flee Monster',
        cost: isHurt ? 1 : 10, // Low cost if hurt, high cost if healthy
        preconditions: { monster_threat: true },
        effects: { monster_threat: false },
        execute: () => {
          this.log("Fleeing from monster!");
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
             if (floor.type === 'wall') return false;
             
             // Avoid moving closer to the monster
             const newDist = Math.max(Math.abs(nx - monster.pos.x), Math.abs(ny - monster.pos.y));
             const oldDist = Math.max(Math.abs(dx), Math.abs(dy));
             if (newDist < oldDist) return false;
             
             // Check for other entities blocking
             const entitiesAtNext = this.getEntitiesAt({x: nx, y: ny});
             if (entitiesAtNext.some(ent => ent.type === 'monster' || (ent.type === 'door' && !ent.isOpen))) return false;
             
             return true;
          });
          
          if (safeMoves.length > 0) {
             // Sort by distance from monster (descending)
             safeMoves.sort((a, b) => {
                const distA = Math.max(Math.abs(this.state.rogue.pos.x + a.x - monster.pos.x), Math.abs(this.state.rogue.pos.y + a.y - monster.pos.y));
                const distB = Math.max(Math.abs(this.state.rogue.pos.x + b.x - monster.pos.x), Math.abs(this.state.rogue.pos.y + b.y - monster.pos.y));
                return distB - distA;
             });
             
             this.moveRogue(safeMoves[0].x, safeMoves[0].y);
          } else {
             this.log("Cornered! Must fight!");
             monster.hp! -= 15;
             if (monster.hp! <= 0) {
               this.log("Monster defeated in desperation!");
               this.bdi.updateBeliefs({ monster_threat: false });
               monster.type = 'floor';
             }
          }
          return true; // Force replan
        }
      });
    }

    // Action: Unlock Door
    const doors = this.state.entities.filter(e => e.type === 'door');
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
              this.log(`Moving towards ${door.id}...`);
              const moved = this.stepTowards(door.pos);
              if (!moved) return true; // Force replan
              return false; // Action not complete yet
            } else {
              door.isLocked = false;
              door.isOpen = true;
              this.bdi.updateBeliefs({ door_unlocked: true });
              this.log(`Unlocked ${door.id}!`);
              return true;
            }
          }
        });
      }
    });

    // Action: Descend Stairs
    const stairs = this.state.entities.find(e => e.type === 'stairs_down');
    if (stairs && this.kg.has(stairs.id, 'is_type', 'stairs_down')) {
      actions.push({
        name: 'Descend Stairs',
        cost: 1,
        preconditions: { door_unlocked: true, floor_cleared: false },
        effects: { floor_cleared: true },
        execute: () => {
          const dist = Math.max(Math.abs(this.state.rogue.pos.x - stairs.pos.x), Math.abs(this.state.rogue.pos.y - stairs.pos.y));
          if (dist > 0) {
            this.log("Moving towards stairs...");
            const moved = this.stepTowards(stairs.pos);
            if (!moved) return true;
            return false;
          } else {
            this.bdi.updateBeliefs({ floor_cleared: true });
            this.log("Descended the stairs!");
            return true;
          }
        }
      });
    }

    // Action: Get Amulet
    const amulet = this.state.entities.find(e => e.type === 'amulet');
    if (amulet && this.kg.has(amulet.id, 'is_type', 'amulet')) {
      actions.push({
        name: 'Get Amulet',
        cost: 1,
        preconditions: { door_unlocked: true, has_amulet: false },
        effects: { has_amulet: true },
        execute: () => {
          const dist = Math.max(Math.abs(this.state.rogue.pos.x - amulet.pos.x), Math.abs(this.state.rogue.pos.y - amulet.pos.y));
          if (dist > 0) {
            this.log("Moving towards amulet...");
            const moved = this.stepTowards(amulet.pos);
            if (!moved) return true;
            return false;
          } else {
            this.bdi.updateBeliefs({ has_amulet: true });
            this.log("Got the Amulet! We win!");
            return true;
          }
        }
      });
    }

    // Actions: Open Chests
    const chestCount = this.state.entities.filter(e => e.type === 'chest').length;
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
            if (!chest) return false;

            const dist = Math.max(Math.abs(this.state.rogue.pos.x - chest.pos.x), Math.abs(this.state.rogue.pos.y - chest.pos.y));
            if (dist > 1) {
              this.log(`Moving towards ${chestId}...`);
              const moved = this.stepTowards(chest.pos);
              if (!moved) return true;
              return false;
            } else {
              this.bdi.updateBeliefs({ [`${chestId}_opened`]: true });
              if (chest.isMimic) {
                this.log(`Oh no! ${chestId} was a Mimic!`);
                this.state.rogue.hp! -= 50;
                this.bdi.updateBeliefs({ hp_low: this.state.rogue.hp! < 60 });
                if (this.state.rogue.hp! <= 0) {
                  this.bdi.updateBeliefs({ is_alive: false });
                  this.log("You died.");
                }
              } else if (chest.hasKey) {
                this.bdi.updateBeliefs({ has_key: true });
                this.log(`Found a key in ${chestId}!`);
              } else {
                this.log(`${chestId} was empty.`);
              }
              return true;
            }
          }
        });
      }
    }

    // Action: Explore
    if (!this.bdi.beliefs.floor_fully_explored) {
      actions.push({
        name: 'Explore',
        cost: 10,
        preconditions: {},
        effects: { has_key: true, floor_fully_explored: true, floor_cleared: true, has_amulet: true, has_potion: true }, // Fake effects to make planner choose it
        execute: () => {
          // Find nearest safest unexplored tile
          const path = this.findPath(this.state.rogue.pos, (pos) => {
            const floor = this.state.grid[pos.y][pos.x];
            return !floor.isExplored;
          });

          if (path && path.length > 0) {
            const nextStep = path[0];
            this.moveRogue(nextStep.x - this.state.rogue.pos.x, nextStep.y - this.state.rogue.pos.y);
            this.log("Exploring safely...");
          } else {
            // Fallback if no safe unexplored tiles
            this.log("Nowhere safe left to explore! Taking risks...");
            const riskyPath = this.findPath(this.state.rogue.pos, (pos) => {
               const floor = this.state.grid[pos.y][pos.x];
               return !floor.isExplored;
            }, true); // ignoreDanger = true

            if (riskyPath && riskyPath.length > 0) {
               const nextStep = riskyPath[0];
               this.moveRogue(nextStep.x - this.state.rogue.pos.x, nextStep.y - this.state.rogue.pos.y);
            } else {
               this.log("Map fully explored.");
               this.bdi.updateBeliefs({ floor_fully_explored: true });
            }
          }
          return true; // Force replan after moving
        }
      });
    }

    return actions;
  }

  tick() {
    if (!this.bdi.beliefs.is_alive) return;
    if (this.bdi.beliefs.has_amulet) return;

    this.state.turn++;
    
    // 1. Sense
    this.observeEnvironment();

    // Dynamically adjust priorities based on health
    const isHurt = this.state.rogue.hp! < 60;
    const descendDesire = this.bdi.desires.find(d => d.name === 'Descend');
    const exploreDesire = this.bdi.desires.find(d => d.name === 'Explore Floor');
    const getAmuletDesire = this.bdi.desires.find(d => d.name === 'Get Amulet');
    const healDesire = this.bdi.desires.find(d => d.name === 'Heal');

    if (isHurt) {
      if (descendDesire) descendDesire.priority = 95;
      if (getAmuletDesire) getAmuletDesire.priority = 95;
      if (exploreDesire) exploreDesire.priority = 10;
      if (healDesire) healDesire.priority = this.bdi.beliefs.has_potion ? 98 : 80;
    } else {
      if (descendDesire) descendDesire.priority = 10;
      if (getAmuletDesire) getAmuletDesire.priority = 10;
      if (exploreDesire) exploreDesire.priority = 20;
      if (healDesire) healDesire.priority = 90;
    }

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
    if (this.bdi.currentPlan.length > 0) {
      const action = this.bdi.currentPlan[0];
      if (action.execute) {
        const success = action.execute();
        if (success) {
          this.bdi.currentPlan.shift(); // Remove executed action
          // Force replan after an action completes to ensure we adapt to new knowledge
          this.bdi.currentPlan = []; 
        }
      }
    }

    // 4. Environment / Monster Turn
    for (const e of this.state.entities) {
      if (e.type === 'monster' && e.hp! > 0) {
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
            if (!entitiesAtNext.some(ent => ent.type === 'monster' || ent.type === 'wall' || (ent.type === 'door' && !ent.isOpen) || ent.type === 'rogue')) {
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
      this.bayesian = new BayesianInference();
      this.bdi.currentPlan = [];
      this.bdi.intention = null;
      this.setupAgent();
      this.observeEnvironment();
    }

    this.onUpdate();
  }
}
