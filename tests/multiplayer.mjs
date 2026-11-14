import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handle, pack, unpack, view, command } from '../lib/match.mjs';
import { CendreSim as S } from '../public/game/sim.js';
const sql = new DatabaseSync(':memory:');
sql.exec(
  'CREATE TABLE matches(code TEXT PRIMARY KEY,data TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,expires INTEGER NOT NULL)',
);
const db = {
  prepare(q) {
    return {
      bind(...args) {
        return {
          async run() {
            return { meta: sql.prepare(q).run(...args) };
          },
          async first() {
            return sql.prepare(q).get(...args);
          },
        };
      },
    };
  },
};
const fund = (code, amount) => {
  const row = JSON.parse(sql.prepare('SELECT data FROM matches WHERE code=?').get(code).data);
  const state = unpack(row.state);
  state.rubies[0] += amount;
  row.state = pack(state);
  sql.prepare('UPDATE matches SET data=? WHERE code=?').run(JSON.stringify(row), code);
};
const now = 100000,
  a = await handle(db, { action: 'create', team: 0 }, now),
  b = await handle(db, { action: 'join', code: a.code }, now + 10);
assert.equal(b.team, 1);
assert.equal(b.status, 'countdown');
await assert.rejects(handle(db, { action: 'join', code: a.code }, now + 20), /complet/);
await assert.rejects(
  handle(db, { action: 'sync', code: a.code, token: 'fake' }, now + 20),
  /Session inconnue/,
);
const sync = (who, extra = {}, time = now + 4000) =>
  handle(db, { action: 'sync', code: a.code, token: who.token, ...extra }, time);
let r = await sync(a);
assert.equal(r.status, 'playing');
assert.equal(r.state.units.length, 1);
assert.equal(r.state.units[0].type, 'commis');
assert(r.state.units.every((u) => u.team === 0));
assert.equal(r.state.rubies[1], 0);
assert(r.state.visible[1].every((v) => v === 0));
await sync(a, { seq: 1, command: { kind: 'recruit', type: 'commis' } });
r = await sync(a, { seq: 1, command: { kind: 'recruit', type: 'commis' } });
assert.equal(r.state.units.length, 1);
assert.equal(r.state.queues[0].length, 1);
assert.equal(r.state.queues[0][0].remaining, 5);
const results = await Promise.all([
  sync(a, { seq: 2, command: { kind: 'recruit', type: 'knight' } }),
  sync(b, { seq: 1, command: { kind: 'recruit', type: 'archer' } }),
]);
assert.equal(results[0].state.units.length, 1);
assert.equal(results[0].state.queues[0].length, 1);
assert(results[0].error);
assert(results[1].error);
assert.equal(results[1].state.units.length, 1);
const read = () =>
  unpack(JSON.parse(sql.prepare('SELECT data FROM matches WHERE code=?').get(a.code).data).state);
let s = read(),
  enemy = s.units.find((u) => u.team === 1),
  enemyPath = enemy.path;
await sync(a, { seq: 3, command: { kind: 'move', ids: [enemy.id], x: 800, y: 400 } });
assert.deepEqual(read().units.find((u) => u.id === enemy.id).path, enemyPath);
fund(a.code, 100);
r = await sync(a, {
  seq: 4,
  command: { kind: 'construct', type: 'garde_manger', baseId: 'main_0' },
});
assert(!r.error);
r = await sync(a, { seq: 5, command: { kind: 'recruit', type: 'knight' } });
assert(!r.error);
assert.equal(r.state.queues[0].length, 2);
assert(r.state.queues[0][1].producerId.startsWith('main_0_slot_'));
assert.equal(r.state.slots[0].filter((p) => p.occupe).length, 1);
r = await sync(a, {}, now + 16000);
assert.equal(r.status, 'disconnected');
const time = r.state.time;
r = await sync(a, {}, now + 17000);
assert(r.state.time > time, 'HTTP fallback also continues during disconnect');
await sync(b, {}, now + 17000);
r = await sync(a, {}, now + 17500);
assert.equal(r.status, 'playing');
await handle(db, { action: 'leave', code: a.code, token: b.token }, now + 18000);
r = await sync(a, {}, now + 18100);
assert.equal(r.state.winner, 0);
await handle(db, { action: 'leave', code: a.code, token: a.token }, now + 18200);
assert.equal((await sync(b, {}, now + 18300)).state.winner, 0);
const wait = await handle(db, { action: 'create' }, now);
await handle(db, { ...wait, action: 'leave' }, now + 100);
await assert.rejects(handle(db, { action: 'join', code: wait.code }, now + 200), /fermé/);
s = S.create();
s.units[0].target = s.units[1];
s.units[1].target = s.units[0];
const restored = unpack(pack(s));
assert.equal(restored.units[0].target, restored.units[1]);
assert.equal(restored.units[1].target, restored.units[0]);
s.units[1].x = S.groves[0].x;
s.units[1].y = S.groves[0].y;
s.watchtowers[0].owner = 0;
S.visibility(s);
assert(!view(s, 0).units.some((u) => u.id === s.units[1].id));
assert.throws(() => command(s, 0, { kind: 'move', ids: [1], x: NaN, y: 10 }));
assert.throws(() => command(s, 0, { kind: 'recruit', type: '__proto__' }));
console.log(
  'PASS: rooms, authentication, capacity, concurrent commands, ownership, deduplication, fog filtering, reconnect, surrender and immutable outcome, cancellation, serialization.',
);

const c = await handle(db, { action: 'create' }, now),
  d = await handle(db, { action: 'join', code: c.code }, now + 10);
const cr = await handle(
  db,
  {
    action: 'sync',
    code: c.code,
    token: c.token,
    seq: 1,
    command: { kind: 'recruit', type: 'commis' },
  },
  now + 4000,
);
assert.equal(cr.state.units.filter((u) => u.type === 'commis').length, 1);
assert.equal(cr.state.queues[0][0].remaining, 5);
const dr = await handle(
  db,
  {
    action: 'sync',
    code: c.code,
    token: d.token,
    seq: 1,
    command: { kind: 'recruit', type: 'commis' },
  },
  now + 4000,
);
assert(!dr.error);
assert.equal(dr.state.queues[1][0].type, 'commis');
assert.equal(dr.state.queues[1][0].remaining, 5);
assert.equal(cr.state.queues[1].length, 0);

// Multiple commands processed in one transaction, in order, without duplicate spend.
const ba = await handle(db, { action: 'create', team: 0 }, now),
  bb = await handle(db, { action: 'join', code: ba.code }, now + 10);
fund(ba.code, 100);
const batch = [
  { seq: 1, command: { kind: 'construct', type: 'garde_manger', baseId: 'main_0' } },
  { seq: 2, command: { kind: 'recruit', type: 'knight' } },
  { seq: 3, command: { kind: 'recruit', type: 'commis' } },
];
const batchInput = { action: 'sync', code: ba.code, token: ba.token, commands: batch };
const first = await handle(db, batchInput, now + 4000);
assert(!first.error);
assert.equal(first.ack, 3);
assert.equal(first.state.rubies[0], 0);
assert.equal(first.state.queues[0].length, 2);
const again = await handle(db, batchInput, now + 4000);
assert.equal(again.state.rubies[0], 0);
assert.equal(again.state.queues[0].length, 2);
const rejected = await handle(
  db,
  {
    ...batchInput,
    commands: [
      { seq: 4, command: { kind: 'recruit', type: 'mage' } },
      { seq: 5, command: { kind: 'hold', ids: [first.state.units[0].id] } },
    ],
  },
  now + 4000,
);
assert(rejected.error);
assert.equal(rejected.ack, 5);
assert(rejected.state.units[0].hold);
console.log(
  'PASS: ordered command batches, deduplication, spend-once, error isolation and acknowledgement.',
);
