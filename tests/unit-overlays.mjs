import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { healthBarBounds, drawHealthBar, unitFeet, selectionRing, TEAM_COLORS, drawCargoRuby, drawMine } from '../public/game/unit-overlays.js';
import { minimapPoint, drawMinimap } from '../public/game/minimap.js';

function recordingContext() {
  const calls = [];
  return {
    calls,
    canvas: { width: 168, height: 94 },
    save() {},
    restore() {},
    beginPath() {},
    arc(...args) {
      calls.push(['arc', ...args]);
    },
    closePath() {},
    moveTo(x, y) {
      calls.push(['moveTo', x, y]);
    },
    lineTo(x, y) {
      calls.push(['lineTo', x, y]);
    },
    fill() {
      calls.push(['fill', this.fillStyle]);
    },
    stroke() {
      calls.push(['stroke', this.strokeStyle, this.lineWidth]);
    },
    fillRect(...args) {
      calls.push(['fillRect', this.fillStyle, ...args]);
    },
    strokeRect(...args) {
      calls.push(['strokeRect', this.strokeStyle, this.lineWidth, ...args]);
    },
    ellipse(...args) {
      calls.push(['ellipse', ...args]);
    },
    drawImage() {},
  };
}

for (const scale of [0.25, 0.5, 1, 2, 4]) {
  const bounds = healthBarBounds(150, 90, scale);
  assert.equal(bounds.width * scale, 24);
  assert.equal(bounds.height * scale, 4);
  assert.equal((bounds.x + bounds.width / 2) * scale, 150 * scale);
  assert.equal((90 - bounds.y) * scale, 8);
  const ctx = recordingContext();
  drawHealthBar(ctx, { hp: 50, max: 100, team: 0 }, 150, 90, scale, 0, false);
  assert.deepEqual(ctx.calls[0], ['fillRect', '#091215', bounds.x, bounds.y, bounds.width, bounds.height]);
  assert.deepEqual(ctx.calls[1], ['fillRect', '#51e078', bounds.x, bounds.y, bounds.width / 2, bounds.height]);
  for (const team of [0, 1]) {
    const feet = unitFeet(150, 120, 46, team);
    assert.equal(feet.x, 150);
    const ratio = team === 1 ? 73 / 80 : 69 / 72;
    assert.equal(feet.y, 120 - 46 + 5 + 46 * 1.125 * ratio);
    const ring = recordingContext();
    selectionRing(ring, feet, 46, scale, team);
    assert.deepEqual(ring.calls[0].slice(0, 3), ['ellipse', feet.x, feet.y]);
    assert.deepEqual(ring.calls[1], ['stroke', TEAM_COLORS[team], 2 / scale]);
  }
}
for (const selected of [false, true]) {
  const ctx = recordingContext();
  drawHealthBar(ctx, { hp: 100, max: 100, team: 1 }, 0, 0, 1, 0, selected);
  assert.equal(ctx.calls.length, selected ? 2 : 0);
  if (selected) assert.equal(ctx.calls[1][1], '#ff5353');
}
const ruby = recordingContext();
drawCargoRuby(ruby, 50, 100, 2, { type: 'commis', cargo: 10 });
assert.deepEqual(ruby.calls[0], ['moveTo', 50, 90]);
assert.ok(ruby.calls.some((call) => call[0] === 'fill'));

for (const cargo of [0, 10, 20]) {
  const worker = recordingContext();
  drawCargoRuby(worker, 50, 100, 2, { type: 'commis', cargo });
  assert.equal(worker.calls.filter((call) => call[0] === 'fill').length, cargo > 0 ? 1 : 0);
}
const soldier = recordingContext();
drawCargoRuby(soldier, 50, 100, 2, { type: 'soldat', cargo: 10 });
assert.equal(soldier.calls.length, 0);

for (const owner of [-1, 0, 1]) {
  for (const boost of [false, true]) {
    const mine = recordingContext();
    drawMine(mine, { x: 100, y: 200, owner, boost }, 2, 0);
    const strokes = mine.calls.filter((call) => call[0] === 'stroke');
    assert.deepEqual(strokes[0], ['stroke', TEAM_COLORS[owner] ?? '#969ca5', 0.75]);
    const points = mine.calls.filter((call) => call[0] === 'moveTo' || call[0] === 'lineTo');
    const width = Math.max(...points.map((call) => call[1])) - Math.min(...points.map((call) => call[1]));
    const height = Math.max(...points.map((call) => call[2])) - Math.min(...points.map((call) => call[2]));
    assert.ok(Math.abs(width - 26 * (boost ? 1.4 : 1)) < 1e-8);
    assert.ok(Math.abs(height - 34 * (boost ? 1.4 : 1)) < 1e-8);
    assert.equal(mine.calls.filter((call) => call[0] === 'fill' && call[1] === '#f12d61').length, 3);
    assert.equal(strokes.filter((call) => call[1] === '#ffc1d2').length, 3);
    if (boost) {
      const pulse = recordingContext();
      drawMine(pulse, { x: 100, y: 200, owner, boost }, 2, Math.PI / 4);
      assert.notEqual(mine.calls.find((call) => call[0] === 'fill')[1], pulse.calls.find((call) => call[0] === 'fill')[1]);
    }
  }
}

assert.deepEqual(minimapPoint(840, 470, 168, 94, 1680, 940), { x: 84, y: 47 });
const mini = recordingContext();
drawMinimap(mini, {
  terrain: {},
  fog: {},
  units: [{ x: 840, y: 470, team: 1 }, { x: 420, y: 235, team: 0 }],
  mines: [{ x: 100, y: 100 }],
  watchtowers: [-1, 0, 1].map((owner) => ({ x: 1800, y: 650, owner })),
  camera: { x: 200, y: 100, width: 800, height: 400 },
  player: 1,
  worldWidth: 1680,
  worldHeight: 940,
});
assert.ok(mini.calls.some((call) => call[0] === 'fillRect' && call[1] === '#65ff97'));
assert.ok(mini.calls.some((call) => call[0] === 'fillRect' && call[1] === '#ff4545'));
assert.ok(mini.calls.some((call) => call[0] === 'fill' && call[1] === '#ffd477'));
for (const color of ['#a0a0a0', ...TEAM_COLORS]) {
  assert(mini.calls.some((call) => call[0] === 'fill' && call[1] === color), 'Couleur du propriétaire de tour sur la mini-carte');
}
assert.deepEqual(mini.calls.at(-1), ['strokeRect', '#fff2bd', 2, 20, 10, 80, 40]);

for (const file of ['game.js', 'unit-overlays.js', 'minimap.js']) {
  let source = readFileSync(new URL('../public/game/' + file, import.meta.url), 'utf8');
  // Issues #107 et #129 : seuls le gain de dévoration et le niveau du héros flottent sur le terrain.
  if (file === 'game.js') {
    source = source.replace(/ctx\.fillText\('\+' \+ event\.amount, [^;\n]+\);/g, '');
    source = source.replace('ctx.fillText(String(u.level), x, headY - 18 / scale);', '');
  }
  assert.doesNotMatch(source, /\.(?:fillText|strokeText)\s*\(/, 'No floating canvas text in ' + file);
}
console.log('PASS: constant screen health bars, feet anchors, team rings, ruby and minimap rendering.');
