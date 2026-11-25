import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createMatch, snapshot } from '../scripts/ia-diagnostic.mjs';

for (const reversed of [false, true]) {
  const { state } = createMatch(1, reversed);
  for (const team of [0, 1]) {
    const base = state.bases[team];
    for (const slot of state.slots[team]) {
      assert(Math.hypot(slot.x - base.x, slot.y - base.y) < 200);
      const cell = Math.floor(slot.y / Sim.CELL) * Sim.COLS + Math.floor(slot.x / Sim.CELL);
      assert.equal(Sim.walk[cell], 1);
    }
    for (const mine of state.mines.filter((mine) => mine.owner === team)) {
      assert(Math.hypot(mine.x - base.x, mine.y - base.y) < 200);
    }
  }
}

const state = Sim.create();
const controller = { metrics: { waves: 0 } };
for (const team of [0, 1]) {
  const report = snapshot(state, team, controller);
  assert.equal(report.population, 1);
  assert.equal(report.workers, 1);
  assert.equal(report.rubies, 100);
  assert.equal(report.military, 0);
  assert.equal(report.ingredients, 0);
  assert.equal(report.heroAlive, false);
  assert.equal(report.militaryNearEnemyBase, 0);
}

const worker = state.units.find((unit) => unit.team === 0);
Sim.gather(state, 0, [worker.id], 0);
assert.equal(snapshot(state, 0, controller).exploitedMines, 1);
Sim.spawn(state, 'hero', 0);
const hero = state.units.at(-1);
hero.x = state.bases[1].x + 599;
hero.y = state.bases[1].y;
controller.metrics.waves = 3;
let report = snapshot(state, 0, controller);
assert.equal(report.population, 4);
assert.equal(report.military, 1);
assert.equal(report.heroAlive, true);
assert.equal(report.waves, 3);
assert.equal(report.militaryNearEnemyBase, 1);
hero.x = state.bases[1].x + 600;
assert.equal(snapshot(state, 0, controller).militaryNearEnemyBase, 0);
hero.hp = 0;
state.mines[0].remaining = 0;
report = snapshot(state, 0, controller);
assert.equal(report.heroAlive, false);
assert.equal(report.military, 0);
assert.equal(report.exploitedMines, 0);

const scriptPath = fileURLToPath(new URL('../scripts/ia-diagnostic.mjs', import.meta.url));
for (const factions of ['cuistots-rats', 'rats-cuistots']) {
  const result = spawnSync(process.execPath, [scriptPath, 'brutal', '1', '--factions', factions, '--minutes', '2'], {
    encoding: 'utf8',
    timeout: 60000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.length, 3);
  for (const [team, line] of lines.slice(0, 2).entries()) {
    assert(line.startsWith('releve '));
    const measurement = JSON.parse(line.slice('releve '.length));
    assert.equal(measurement.seconds, 120);
    assert.equal(measurement.team, team);
  }
  const summary = JSON.parse(lines[2]);
  assert.deepEqual(Object.keys(summary).sort(), ['seed', 'winner', 'seconds', 'maxBankSeconds'].sort());
  assert.equal(summary.seed, 1);
  assert.equal(summary.seconds, 120);
  assert.equal(summary.winner, null);
  assert.equal(summary.maxBankSeconds.length, 2);
  assert(summary.maxBankSeconds.every((seconds) => Number.isFinite(seconds) && seconds >= 0 && seconds <= 120));
}
console.log('ia-diagnostic : snapshot, placements et parties de deux minutes dans les deux orientations vérifiés.');
