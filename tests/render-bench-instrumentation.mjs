import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { instrumentDraw, validateDrawMetrics } from '../scripts/render-bench-instrumentation.mjs';

const source = await readFile(new URL('../public/game/game.js', import.meta.url), 'utf8');
const instrumented = instrumentDraw(source);
const start = source.indexOf('function unit(u) {');
const end = source.indexOf('\nfunction openedRallyBuilding()');
assert.equal(instrumented.slice(0, start), source.slice(0, start));
assert(instrumented.endsWith(source.slice(end)));
assert.throws(() => instrumentDraw(source.replace('  drawFog();', '  missingFog();')), /anchor/);

// Execute the injected draw with deterministic work at each real boundary.
const fixture = `function unit(u) {
  if (u.hero) {
    ctx.save();
    work(23);
    ctx.restore();
  }
  drawCook(u);
  if (Sim.ragoutActive(state, u)) {
    for (const offset of [-7, 7]) {
      work(29);
    }
  }
}
function drawCook(u) {
  work(13);
  if (u.hero) {
    ctx.save();
    work(31);
    ctx.restore();
  }
}
function draw() {
  work(2);
  drawExpansionSites();
  work(3);
  preparedUnits.forEach(unit);
  for (const event of state.devourEvents || []) {
    work(5);
  }
  drawFog();
  drawOrderQueues();
  work(7);
}
setupPortraits();`;
let clock = 0;
const context = vm.createContext({
  performance: { now: () => clock },
  work: (duration) => {
    clock += duration;
  },
  drawExpansionSites: () => {
    clock += 11;
  },
  preparedUnits: [{ hero: true }],
  ctx: { save() {}, restore() {} },
  Sim: { ragoutActive: () => true },
  state: { devourEvents: [1] },
  drawFog: () => {
    clock += 17;
  },
  drawOrderQueues: () => {
    clock += 19;
  },
  setupPortraits: () => {},
});
vm.runInContext(instrumentDraw(fixture), context);
const layers = vm.runInContext('draw()', context);
assert.deepEqual({ ...layers }, { terrain: 2, effects: 131, units: 13, fog: 17, hud: 26 });
validateDrawMetrics({ drawMs: clock, layers });
for (const result of [
  { drawMs: clock * 2, layers },
  { drawMs: clock / 2, layers },
  { drawMs: clock, layers: { ...layers, units: -1 } },
  { drawMs: NaN, layers },
  { drawMs: clock, layers: { terrain: clock } },
]) {
  assert.throws(() => validateDrawMetrics(result), /measurements/);
}
console.log('render-bench: injected layer boundaries and measurement validation passed');
