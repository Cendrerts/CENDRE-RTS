import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { attackDirection, groupAttackAlerts } from '../public/game/camera.js';
import { pack, unpack, view } from '../lib/match.mjs';

let state = Sim.create();
const template = state.units[0];
state.units = Array.from({ length: 20 }, (_, index) => ({
  ...template,
  id: index + 1,
  team: index % 2,
  type: 'archer',
  x: 770 + index * 3,
  y: 445,
  hp: 100000,
  max: 100000,
  harvest: null,
  path: [],
  hold: true,
}));
state.id = 20;
const lastEventTimes = new Map();
let alerts = [];
let combatTicks = 0;
for (let tick = 0; tick < 200; tick++) {
  for (const unit of state.units) {
    unit.x = 770 + (unit.id - 1) * 3;
    unit.y = 445;
    unit.target = state.units.find((enemy) => enemy.team !== unit.team);
    assert.ok(Sim.forest(unit));
  }
  Sim.visibility(state);
  Sim.tick(state, 0.05);
  assert.equal(state.units.length, 20);
  assert.ok(state.damageEvents.length <= 24);
  if (state.shots.length) combatTicks++;
  for (const unit of state.units) {
    const previousTime = lastEventTimes.get(unit.id);
    if (unit.lastDamageEventAt !== previousTime) {
      if (previousTime !== undefined) {
        assert.ok(unit.lastDamageEventAt - previousTime >= 1);
      }
      lastEventTimes.set(unit.id, unit.lastDamageEventAt);
    }
  }
  const client = view(state, 0);
  assert.ok(client.damageEvents.length > 0);
  assert.ok(client.damageEvents.every((event) => event.team === 0 && state.time - event.time < 2));
  assert.ok(client.units.every((unit) => !Object.hasOwn(unit, 'lastDamageEventAt')));
  for (const event of client.damageEvents) {
    if (attackDirection(event, { x: 100, y: 100 }, 844, 390, 1)) {
      alerts = groupAttackAlerts(alerts, event, state.time);
    }
  }
  // Each server request reloads the persisted state: the cooldown must survive.
  state = unpack(pack(state));
  assert.equal(state.units[0].lastDamageEventAt, lastEventTimes.get(state.units[0].id));
}
assert.ok(combatTicks > 20);
assert.ok(alerts.length > 0);
assert.equal(lastEventTimes.size, 20);

state.damageEvents = [
  { x: 0, y: 0, team: 0, time: state.time - 2 },
  { x: 0, y: 0, team: 0, time: state.time - 1.99 },
  { x: 0, y: 0, team: 1, time: state.time },
];
assert.deepEqual(view(state, 0).damageEvents, [state.damageEvents[1]]);

// Multiple attackers hitting the same building share its cooldown.
state = Sim.create();
const base = state.bases[1];
state.units = Array.from({ length: 30 }, (_, index) => ({
  ...state.units[0],
  id: index + 1,
  type: 'archer',
  team: 0,
  x: base.x - 30,
  y: base.y,
  harvest: null,
  path: [],
  hold: true,
  target: base,
}));
Sim.visibility(state);
Sim.tick(state, 0.05);
assert.equal(state.damageEvents.length, 1);
assert.equal(base.lastDamageEventAt, state.time);
assert.ok(!Object.hasOwn(view(state, 1).bases[1], 'lastDamageEventAt'));

// Old oversized states are trimmed even when no new damage occurs.
state.units = [];
state.damageEvents = Array.from({ length: 100 }, (_, index) => ({
  x: index,
  y: 0,
  team: 0,
  time: state.time,
}));
Sim.tick(state, 0.05);
assert.equal(state.damageEvents.length, 24);
assert.equal(state.damageEvents[0].x, 76);
console.log('PASS: bounded damage events, per-entity cooldown across requests, recent team events and offscreen alerts.');
