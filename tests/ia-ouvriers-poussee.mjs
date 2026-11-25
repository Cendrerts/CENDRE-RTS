import assert from 'node:assert/strict';
import { CendreSim as S } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';
import { BUILD_ORDERS } from '../public/game/ai-config.js';

// Same scripted push and starting positions as Push 2 in ai.mjs.
function scriptedPush(team) {
  let nextOrder = 0;
  let expansionWorker = null;
  let attack = null;
  const sent = new Set();

  return (state) => {
    if (state.time < nextOrder) return;
    nextOrder = state.time + 0.5;
    const own = state.units.filter((unit) => unit.team === team);
    const workers = own.filter((unit) => unit.type === 'commis');
    const army = own.filter((unit) => unit.type !== 'commis');
    const ownedMines = state.mines.filter((mine) => mine.owner === team);
    const queuedWorkers = state.queues[team].filter((job) => job.type === 'commis').length;
    if (workers.length + queuedWorkers < ownedMines.length * 5) S.recruit(state, 'commis', team);
    for (const worker of workers) {
      if (worker.id === expansionWorker || worker.harvest) continue;
      const destination = state.mines.findIndex((mine, index) => mine.owner === team &&
        workers.filter((other) => other.harvest?.mine === index).length < 5);
      if (destination !== -1) S.gather(state, team, [worker.id], destination);
    }
    if (state.time >= 120 && ownedMines.length < 2) {
      const base = state.bases[team];
      const destination = state.mines.map((mine, index) => ({ mine, index }))
        .filter(({ index }) => index >= 2)
        .sort((a, b) => Math.hypot(a.mine.x - base.x, a.mine.y - base.y) -
          Math.hypot(b.mine.x - base.x, b.mine.y - base.y))[0];
      const worker = workers.find((unit) => unit.id === expansionWorker) || workers[0];
      if (worker) {
        expansionWorker = worker.id;
        if (S.build(state, team, destination.index)) {
          S.gather(state, team, [worker.id], destination.index);
          expansionWorker = null;
        } else if (worker.harvest || !worker.path.length) {
          S.order(state, [worker.id], destination.mine.x, destination.mine.y, null, true);
        }
      }
    }
    for (const building of BUILD_ORDERS[team].slice(0, 2)) {
      if (!S.producers(state, team, building.unit).length) S.construct(state, team, building.id);
      for (const producer of S.producers(state, team, building.unit)) {
        if (!state.queues[team].some((job) => job.producerId === producer.id)) {
          S.recruit(state, building.unit, team, producer.id);
        }
      }
    }
    attack ??= state.mines.find((mine, index) => index >= 2 && mine.owner === 1 - team && mine.depot);
    if (!attack) return;
    for (const unit of army) {
      const target = state.units.find((enemy) => enemy.team !== team && S.canSee(state, team, enemy) &&
        enemy.type === 'commis' && Math.hypot(enemy.x - attack.x, enemy.y - attack.y) < 300);
      if (target && unit.target !== target) {
        S.order(state, [unit.id], target.x, target.y, target, false);
      } else if (!sent.has(unit.id) || !unit.path.length && !unit.target) {
        const goal = !target && sent.has(unit.id) ? state.bases[1 - team] : attack;
        S.order(state, [unit.id], goal.x, goal.y, null, false);
        sent.add(unit.id);
      }
    }
  };
}

let seed = 57;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}

const state = S.create();
// Les rangs requis sont déjà débloqués pour isoler la réponse économique au push.
state.bases[0].niveau = 3;
state.bases[1].niveau = 2;
// Two earlier games each consume two draws per starting worker.
for (let draw = 0; draw < 2 * 2 * state.units.length; draw++) random();
for (const unit of state.units) {
  const cell = S.nearest(unit.x + random() * 40 - 20, unit.y + random() * 40 - 20);
  unit.x = (cell % S.COLS) * S.CELL + 10;
  unit.y = Math.floor(cell / S.COLS) * S.CELL + 10;
}
S.visibility(state);

const brutal = createAI(0, 'brutal');
const opponent = scriptedPush(1);
while (state.time < 240 && state.winner === null) {
  brutal.update(state);
  opponent(state);
  S.tick(state, 0.1);
}

assert(state.time >= 240, 'La partie doit atteindre 240 s');
const workers = state.units.filter((unit) => unit.team === 0 && unit.type === 'commis');
assert(workers.length >= 8, `Push 2 à 240 s : ${workers.length} ouvriers Brutal sur les 8 attendus`);
console.log(`Push 2 à 240 s : ${workers.length} ouvriers Brutal`);
