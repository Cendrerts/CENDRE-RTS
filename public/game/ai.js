import { CendreSim as Sim } from './sim.js';
import { BUILD_ORDERS, DIFFICULTIES } from './ai-config.js';

// A deterministic controller: no DOM, wall clock, randomness or resource bonuses.
// All mutations go through the shared simulation's public actions.
export function createAI(team, difficulty = 'normal') {
  const settings = DIFFICULTIES[difficulty];
  if (!settings || ![0, 1].includes(team)) throw new Error('Invalid AI configuration');
  let nextReaction = 0;
  let wave = settings.wave;
  let expedition = null;
  const deployed = new Set();
  const remembered = new Map();
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  return {
    update(state) {
      if (state.winner !== null || state.time < nextReaction) return 0;
      nextReaction = state.time + settings.reaction;
      let actions = 0;
      const own = state.units.filter((unit) => unit.team === team && unit.hp > 0);
      const workers = own.filter((unit) => unit.type === 'commis');
      const army = own.filter((unit) => unit.type !== 'commis');
      const enemies = state.units.filter((unit) => unit.team !== team && unit.hp > 0 && Sim.canSee(state, team, unit));
      const mines = state.mines.map((mine, index) => ({ ...mine, index }));
      const owned = mines.filter((mine) => mine.owner === team);
      for (const mine of mines) {
        if (!Sim.visibleAt(state, team, mine.x, mine.y)) continue;
        if (mine.index >= 2 && mine.owner === 1 - team) remembered.set(mine.index, mine);
        else remembered.delete(mine.index);
      }
      for (const mine of remembered.values()) {
        if (Sim.build(state, team, mine.index)) {
          remembered.delete(mine.index);
          actions++;
        }
      }
      const queued = state.queues[team].filter((job) => job.type === 'commis').length;
      if (workers.length + queued < owned.length * 2 && Sim.recruit(state, 'commis', team)) actions++;
      // Rebalance only surplus or idle workers, preserving harvest trips.
      const assigned = new Map(owned.map((mine) => [mine.index, 0]));
      for (const worker of workers) {
        const index = worker.harvest?.mine;
        if (assigned.has(index)) assigned.set(index, assigned.get(index) + 1);
      }
      for (const worker of workers) {
        if (worker.id === expedition?.worker) continue;
        const index = worker.harvest?.mine;
        const destination = owned.find((mine) => assigned.get(mine.index) < 2);
        if (destination && (!assigned.has(index) || assigned.get(index) > 2)) {
          if (Sim.gather(state, team, [worker.id], destination.index)) actions++;
          assigned.set(destination.index, assigned.get(destination.index) + 1);
          if (assigned.has(index)) assigned.set(index, assigned.get(index) - 1);
        }
      }
      if (state.time >= 175 && owned.length < 2 && !expedition && workers.length) {
        // Mine locations are public terrain; ownership is checked only after scouting.
        const destination = mines.filter((mine) => mine.index >= 2)
          .sort((a, b) => distance(a, state.bases[team]) - distance(b, state.bases[team]))[0];
        expedition = { worker: workers[0].id, index: destination.index };
      }
      if (expedition) {
        const worker = workers.find((unit) => unit.id === expedition.worker);
        const mine = mines[expedition.index];
        if (!worker || mine.owner === team && mine.depot) expedition = null;
        else if (Sim.build(state, team, mine.index)) {
          actions++;
          Sim.gather(state, team, [worker.id], mine.index);
          expedition = null;
        } else if (!worker.path.length || worker.harvest) {
          Sim.order(state, [worker.id], mine.x, mine.y, null, true);
          actions++;
        }
      }
      const built = new Set(state.slots[team].filter((slot) => slot.occupe).map((slot) => slot.batiment.type));
      const nextBuilding = BUILD_ORDERS[team].find((building) => !built.has(building.id));
      if (!expedition && nextBuilding && nextBuilding.requires.every((id) => built.has(id)) && Sim.construct(state, team, nextBuilding.id)) actions++;
      // Keep each producer busy without reserving the whole economy in long queues.
      for (const building of BUILD_ORDERS[team]) {
        for (const producer of Sim.producers(state, team, building.unit)) {
          if (!expedition && !state.queues[team].some((job) => job.producerId === producer.id) && Sim.recruit(state, building.unit, team, producer.id)) actions++;
        }
      }
      const reserve = army.filter((unit) => !deployed.has(unit.id));
      // Population cap includes workers: launch the available army when saturated.
      if (reserve.length >= wave || reserve.length > 0 && own.length === 30) {
        for (const unit of reserve) deployed.add(unit.id);
        wave += 4;
      }
      const destination = [...remembered.values()].sort((a, b) => distance(a, state.bases[team]) - distance(b, state.bases[team]))[0] || state.bases[1 - team];
      const visibleBase = Sim.canSee(state, team, state.bases[1 - team]) ? state.bases[1 - team] : null;
      for (const unit of army) {
        const range = Sim.stats(unit.type, team).range;
        const targets = [...enemies, ...(visibleBase ? [visibleBase] : [])]
          .filter((enemy) => distance(unit, enemy) <= range + (enemy.base ? 45 : 0))
          .sort((a, b) => a.hp - b.hp || a.id - b.id);
        const threat = enemies.find((enemy) => distance(unit, enemy) < 180);
        const cover = army.some((ally) => ally.id !== unit.id && ally.hp >= ally.max * 0.25 && threat && distance(ally, threat) <= Sim.stats(ally.type, team).range + 75);
        if (unit.hp < unit.max * 0.25 && threat && cover) {
          if (!unit.retreat) {
            Sim.disengage(state, [unit.id]);
            actions++;
          }
        } else if (targets.length && !unit.retreat) {
          if (unit.target !== targets[0]) {
            Sim.order(state, [unit.id], targets[0].x, targets[0].y, targets[0], false);
            actions++;
          }
        } else if (deployed.has(unit.id) && !unit.path.length && !unit.target) {
          Sim.order(state, [unit.id], destination.x, destination.y, null, false);
          actions++;
        }
      }
      return actions;
    },
  };
}
