import assert from 'node:assert/strict';
import { CendreSim as S } from '../public/game/sim.js';
import { pack, unpack, view, command } from '../lib/match.mjs';

function legacySave() {
  const saved = JSON.parse(pack(S.create()));
  saved.gold = [321, 654];
  delete saved.rubies;
  saved.mines.find((mine) => mine.boost).name = 'Mine de rubis';
  return saved;
}

const solo = S.migrateState(legacySave());
assert.deepEqual(solo.rubies, [321, 654]);
assert.equal(Object.hasOwn(solo, 'gold'), false);
assert.equal(solo.mines.find((mine) => mine.boost).name, 'Veine riche');
assert.equal(S.migrateState(solo), solo);
assert.equal(S.recruit(solo, 'commis', 0), true);
assert.equal(solo.rubies[0], 321 - S.stats('commis', 0).cost);

const resumed = legacySave();
S.tick(resumed, 0);
assert.deepEqual(resumed.rubies, [321, 654]);
assert.equal(Object.hasOwn(resumed, 'gold'), false);

const server = unpack(JSON.stringify(legacySave()));
assert.deepEqual(server.rubies, [321, 654]);
assert.equal(Object.hasOwn(server, 'gold'), false);
assert.deepEqual(view(server, 0).rubies, [321, 0]);
assert.deepEqual(view(server, 1).rubies, [0, 654]);
command(server, 0, { kind: 'recruit', type: 'commis' });
assert.equal(server.rubies[0], 321 - S.stats('commis', 0).cost);
assert.deepEqual(unpack(pack(server)).rubies, server.rubies);
assert.equal(Object.hasOwn(JSON.parse(pack(server)), 'gold'), false);

const mixed = legacySave();
mixed.rubies = [0, 17];
S.migrateState(mixed);
assert.deepEqual(mixed.rubies, [0, 17]);
assert.equal(Object.hasOwn(mixed, 'gold'), false);
assert.deepEqual(S.create().rubies, [100, 100]);
console.log('PASS: legacy solo and server saves migrate to rubies without changing balances.');
