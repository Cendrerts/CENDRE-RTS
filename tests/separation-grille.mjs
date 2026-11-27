import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Référence quadratique de la séparation, avec les rayons au repos de #296.
// Seul le module temporaire expose les fonctions privées.
const reference = `function referenceSeparate(units, fighting, dt) {
  const maximumPush = 30 * dt;
  const radius = (u) => u.type === 'knight' ? 12 : u.type === 'mage' ? 11 : 9;
  const atRest = (u) => !fighting.has(u.id) && !u.path.length && !u.target && !u.autoTargetId &&
    !u.attackDestination && !u.orderQueue?.length && !u.patrol && !u.followId && !u.hold &&
    !u.manual && !u.harvest && !u.devour;
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    if (a.hp <= 0) continue;
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      if (b.hp <= 0) continue;
      if (a.team === b.team && (a.harvest || b.harvest)) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const bothSettled = atRest(a) && atRest(b);
      const combinedRadius = bothSettled
        ? RESTING_RADII[a.type] + RESTING_RADII[b.type]
        : radius(a) + radius(b);
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared >= combinedRadius * combinedRadius) continue;
      const distance = Math.hypot(dx, dy);
      const overlap = combinedRadius - distance;
      if (overlap <= 0) continue;
      if (distance === 0) {
        // Stable IDs break coincident positions without randomness.
        const angle = ((a.id * 31 + b.id * 17) % 360) * Math.PI / 180;
        dx = Math.cos(angle);
        dy = Math.sin(angle);
      } else {
        dx /= distance;
        dy /= distance;
      }
      // Incoming units yield to allies that have already settled in formation.
      const movableA = !fighting.has(a.id) && (a.path.length > 0 || b.path.length === 0);
      const movableB = !fighting.has(b.id) && (b.path.length > 0 || a.path.length === 0);
      const count = Number(movableA) + Number(movableB);
      if (!count) continue;
      const push = Math.min(overlap / count, bothSettled ? 1.2 * maximumPush : maximumPush);
      if (movableA) moveSafely(a, -dx * push, -dy * push);
      if (movableB) moveSafely(b, dx * push, dy * push);
    }
  }
}
`;
const directory = await mkdtemp(join(tmpdir(), 'cendre-separation-grille-'));
try {
  await cp(new URL('../public/game/', import.meta.url), directory, { recursive: true });
  await writeFile(join(directory, 'package.json'), '{"type":"module"}');
  const source = await readFile(join(directory, 'sim.js'), 'utf8');
  await writeFile(join(directory, 'sim.js'), `${source}\n${reference}\nexport { separate, referenceSeparate };\n`);
  const { CendreSim: Sim, separate, referenceSeparate } = await import(pathToFileURL(join(directory, 'sim.js')));
  Sim.create();
  for (const dt of [1 / 60, 0.1, 0.005, 0.5, 0]) {
    const maximumRestingPush = 1.2 * (30 * dt);
    const cellSize = 42 + 2 * 199 * maximumRestingPush;
    const units = Array.from({ length: 200 }, (_, index) => {
      // Interleave distant groups in array order; straddle grid boundaries.
      const group = index % 4;
      const pair = Math.floor(index / 2);
      const x = group < 2 ? cellSize * Math.max(1, Math.floor(850 / cellSize)) + (pair % 7 - 3) * 6 : 390 + pair % 9 * 19;
      const y = group < 2 ? 1750 + (Math.floor(pair / 7) % 5 - 2) * 7 : 450 + Math.floor(pair / 9) * 19;
      return {
        id: 1000 - index,
        type: ['knight', 'mage', 'commis', 'archer', 'hero'][index % 5],
        team: Math.floor(index / 3) % 2,
        hp: index % 23 === 0 ? 0 : 100,
        x: Math.min(Sim.W - 1, x),
        y,
        path: index % 3 === 0 ? [{ x: 950, y: 1750 }] : [],
        harvest: index % 7 === 0 ? { mine: 0 } : null,
      };
    });
    // Exact overlaps, including mobile units, fighters and harvesters.
    for (let index = 0; index < 40; index++) {
      units[index].x = 850;
      units[index].y = 1750;
    }
    const fighting = new Set(units.filter((_, index) => index % 6 === 0).map((unit) => unit.id));
    const expected = structuredClone(units);
    const initial = structuredClone(units);
    for (let pass = 0; pass < 100; pass++) {
      referenceSeparate(expected, fighting, dt);
      separate(units, fighting, dt);
      assert.deepEqual(units, expected, `dt=${dt}, passe ${pass + 1}`);
    }
    if (dt > 0) assert.notDeepEqual(units, initial, 'La foule doit effectivement bouger');
  }
  console.log('Séparation par grille : 200 unités, combat, récolte, superpositions, cinq dt, 100 passes identiques');
} finally {
  await rm(directory, { recursive: true, force: true });
}
