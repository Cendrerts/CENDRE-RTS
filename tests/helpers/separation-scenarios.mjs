export const rendezvous = { x: 430, y: 1870 };
const dt = 1 / 60;
const contactDistance = 24;

function battlefield(Sim) {
  const state = Sim.create();
  state.units = [];
  state.camps = [];
  state.monsters = [];
  return state;
}

function spawn(Sim, state, team, x, y, type = 'knight') {
  Sim.spawn(state, type, team);
  const unit = state.units.at(-1);
  unit.x = x;
  unit.y = y;
  return unit;
}

export function measurePairs(units, contact = () => contactDistance) {
  let pairs = 0;
  let overlaps = 0;
  let minimumDistance = Infinity;
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i];
      const b = units[j];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      pairs++;
      if (distance < contact(a, b)) overlaps++;
      minimumDistance = Math.min(minimumDistance, distance);
    }
  }
  return { pairs, overlaps, rate: overlaps / pairs, minimumDistance };
}

export function settledArmy(Sim, { groupOrder = false, types = ['knight'] } = {}) {
  const state = battlefield(Sim);
  const ids = [];
  for (let index = 0; index < 40; index++) {
    const angle = index * 2 * Math.PI / 40;
    const x = rendezvous.x + Math.cos(angle) * 180;
    const y = rendezvous.y + Math.sin(angle) * 180;
    const unit = spawn(Sim, state, 0, x, y, types[index % types.length]);
    ids.push(unit.id);
  }
  if (groupOrder) {
    Sim.order(state, ids, rendezvous.x, rendezvous.y);
  } else {
    // Les ordres individuels donnent précisément la même destination aux 40 unités.
    for (const id of ids) Sim.order(state, [id], rendezvous.x, rendezvous.y);
  }
  for (let step = 0; state.units.some((unit) => unit.path.length); step++) {
    if (step >= 1800) throw new Error('Les 40 unités ne sont pas arrivées en 30 s');
    Sim.tick(state, dt);
  }
  for (let step = 0; step < 300; step++) Sim.tick(state, dt);
  return state;
}

export function melee(Sim) {
  const center = { x: 2010, y: 1110 };
  const state = battlefield(Sim);
  for (const team of [0, 1]) {
    const units = [];
    for (let index = 0; index < 20; index++) {
      const x = center.x + (team === 0 ? -1 : 1) * (110 + index % 4 * (team === 0 ? Sim.CELL : 24));
      const y = center.y + (Math.floor(index / 4) - 2) * (team === 0 ? Sim.CELL : 24);
      units.push(spawn(Sim, state, team, x, y).id);
    }
    if (team === 1) Sim.order(state, units, center.x - 130, center.y, null, false);
  }
  Sim.visibility(state);
  let peak;
  let peakAttackers = 0;
  let firstHitAt;
  const teamsInContact = new Set();
  for (let step = 0; step < 3600; step++) {
    Sim.tick(state, dt);
    if (state.units.some((unit) => unit.lastAttackAt === state.time)) firstHitAt ??= state.time;
    const byId = new Map(state.units.map((unit) => [unit.id, unit]));
    let attackers = 0;
    for (const unit of state.units) {
      const target = unit.target ?? byId.get(unit.autoTargetId);
      if (!target || target.team === unit.team || target.hp <= 0) continue;
      const distance = Math.hypot(target.x - unit.x, target.y - unit.y);
      if (distance <= Sim.stats(unit.type, unit.team).range) attackers++;
      if (unit.lastAttackAt === state.time && distance <= contactDistance &&
          unit.lastAttackTargetId === target.id) teamsInContact.add(unit.team);
    }
    // Premier tick qui atteint le maximum d'unités à portée de leur cible.
    if (attackers > peakAttackers) {
      peakAttackers = attackers;
      peak = { time: state.time, attackers, ...measurePairs(state.units) };
    }
    if (state.units.every((unit) => unit.team === state.units[0]?.team)) {
      return { peak, teamsInContact: teamsInContact.size, duration: state.time - firstHitAt };
    }
  }
  throw new Error('Le combat 20 contre 20 dépasse 60 s');
}
