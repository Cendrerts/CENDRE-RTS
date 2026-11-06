import assert from 'node:assert/strict';
import { minimapToWorld, clampCamera, attackDirection, groupAttackAlerts } from '../public/game/camera.js';
import { CendreSim as Sim } from '../public/game/sim.js';
import { view } from '../lib/match.mjs';

assert.deepEqual(minimapToWorld(70, 40, 140, 80, 2400, 1600), { x: 1200, y: 800 });
assert.deepEqual(minimapToWorld(-10, 100, 140, 80, 2400, 1600), { x: 0, y: 1600 });
for (const zoom of [1, 3.5]) {
  const width = 844;
  const height = 390;
  const scale = Math.max(width / 2400, height / 1600) * zoom;
  const low = clampCamera(-10000, -10000, width, height, scale, 2400, 1600);
  const high = clampCamera(10000, 10000, width, height, scale, 2400, 1600);
  assert.ok(Math.abs((low.x - width / scale / 2) * scale + width / 4) < 1e-9);
  assert.ok(Math.abs((low.y - height / scale / 2) * scale + height / 4) < 1e-9);
  assert.ok(Math.abs((high.x + width / scale / 2 - 2400) * scale - width / 4) < 1e-9);
  assert.ok(Math.abs((high.y + height / scale / 2 - 1600) * scale - height / 4) < 1e-9);
  assert.deepEqual(clampCamera(1200, 800, width, height, scale, 2400, 1600), { x: 1200, y: 800 });
}
const camera = { x: 1000, y: 1000 };
assert.equal(attackDirection(camera, camera, 844, 390, 1), null);
for (const [x, y, angle] of [[2000, 1000, 0], [0, 1000, Math.PI], [1000, 2000, Math.PI / 2], [1000, 0, -Math.PI / 2]]) {
  const direction = attackDirection({ x, y }, camera, 844, 390, 1);
  assert.equal(direction.angle, angle);
  assert.ok(direction.x >= 24 && direction.x <= 820);
  assert.ok(direction.y >= 24 && direction.y <= 366);
}
const diagonal = attackDirection({ x: 2000, y: 2000 }, camera, 844, 390, 1);
assert.equal(diagonal.angle, Math.PI / 4);
assert.equal(diagonal.y, 366);
let alerts = groupAttackAlerts([], { x: 100, y: 100 }, 0);
alerts = groupAttackAlerts(alerts, { x: 110, y: 120 }, 4.999);
assert.equal(alerts.length, 1);
assert.equal(alerts[0].time, 0);
alerts = groupAttackAlerts(alerts, { x: 600, y: 100 }, 4.999);
assert.equal(alerts.length, 2);
alerts = groupAttackAlerts(alerts, { x: 100, y: 100 }, 5);
assert.equal(alerts.length, 2);
assert.equal(alerts.find((alert) => alert.x === 100).time, 5);

const state = Sim.create();
const attacker = state.units.find((unit) => unit.team === 1);
const victim = state.units.find((unit) => unit.team === 0);
attacker.x = victim.x + 5;
attacker.y = victim.y;
attacker.type = 'archer';
attacker.harvest = null;
attacker.path = [];
attacker.retreat = false;
attacker.cool = 0;
victim.hold = true;
Sim.visibility(state);
attacker.target = victim;
Sim.tick(state, 0.05);
assert.ok(state.damageEvents.some((event) => event.team === 0));
assert.ok(view(state, 0).damageEvents.length > 0);
assert.ok(view(state, 0).damageEvents.every((event) => event.team === 0));
console.log('PASS: minimap conversion, camera bounds, attack direction, zone cooldown and shared damage events.');
