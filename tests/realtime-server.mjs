import assert from 'node:assert/strict';
import { Match } from '../server/match-do.js';
import worker from '../server/worker.js';
import { CendreSim as S } from '../public/game/sim.js';
import { decodeSnapshotFog } from '../public/game/snapshot-fog.js';

class Clock {
  time = 100000;
  timers = new Set();
  timeouts = new Map();
  setTimeout = (callback, delay) => {
    this.timeouts.set(callback, this.time + delay);
    return callback;
  };
  Date = { now: () => this.time };
  setInterval = (callback) => {
    this.timers.add(callback);
    return callback;
  };
  clearInterval = (callback) => this.timers.delete(callback);
  async advance(milliseconds) {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 50) {
      this.time += 50;
      for (const [callback, deadline] of this.timeouts) {
        if (this.time >= deadline) {
          this.timeouts.delete(callback);
          callback();
        }
      }
      for (const callback of this.timers) callback();
      await Promise.resolve();
    }
  }
}
class Socket {
  messages = [];
  send(raw) {
    this.messages.push(JSON.parse(raw));
  }
  serializeAttachment(value) {
    this.attachment = structuredClone(value);
  }
  deserializeAttachment() {
    return structuredClone(this.attachment);
  }
  close() {
    this.closed = true;
  }
}
function context(saved) {
  const sockets = [];
  const pending = [];
  const storage = {
    saved,
    writes: 0,
    async get() {
      return structuredClone(this.saved);
    },
    async put(key, value) {
      this.saved = structuredClone(value);
      this.writes++;
    },
    async setAlarm(time) {
      this.alarm = time;
    },
    async deleteAlarm() {
      this.alarm = null;
    },
  };
  return {
    storage,
    sockets,
    pending,
    blockConcurrencyWhile(callback) {
      return callback();
    },
    getWebSockets() {
      return sockets;
    },
    acceptWebSocket(socket) {
      sockets.push(socket);
    },
    waitUntil(promise) {
      pending.push(promise);
    },
  };
}
function heartbeat(match, clock) {
  clock.setInterval(() => {
    if (clock.time % 2000 !== 0) return;
    for (const socket of match.sockets()) {
      match.webSocketMessage(socket, JSON.stringify({ type: 'ping' }));
    }
  });
}
const clock = new Clock();
const ctx = context();
const match = new Match(ctx, {}, clock);
await match.ready;
heartbeat(match, clock);
const url = (query) => new URL(`https://cendre.test/api/ws?code=ABCDEFG&${query}`);
const a = await match.authenticate(url('action=create&team=0'));
const connect = (team) => {
  const socket = new Socket();
  socket.serializeAttachment({ team, closed: false });
  ctx.acceptWebSocket(socket);
  match.startTimer();
  return socket;
};
const sa = connect(a.team);
const b = await match.authenticate(url('action=join'));
const sb = connect(b.team);
assert.equal(b.team, 1);
assert.equal(b.status, 'countdown');
assert(!JSON.stringify(ctx.storage.saved).includes(a.token));
await assert.rejects(match.authenticate(url('action=join')), /complet/);
await assert.rejects(match.authenticate(url(''), 'invalid'), /inconnue/);
await clock.advance(3000);
assert.equal(match.sim.time, 0);
sa.messages = [];
sb.messages = [];
const writes = ctx.storage.writes;
await clock.advance(1000);
assert(Math.abs(match.sim.time - 1) < 1e-10, '20 fixed ticks per second');
assert.equal(sa.messages.filter((m) => m.type === 'snapshot').length, 10);
assert.equal(ctx.storage.writes, writes, 'no storage writes per tick');
const snapshot = sa.messages.at(-1).state;
decodeSnapshotFog(snapshot, a.team);
assert(snapshot.units.every((unit) => unit.team === a.team));
assert.equal(snapshot.rubies[1], 0);
assert(snapshot.visible[1].every((cell) => cell === 0));
const send = (socket, message) => match.webSocketMessage(socket, JSON.stringify(message));
sa.messages = [];
send(sa, { type: 'cmd', seq: 1, cmd: { kind: 'recruit', type: 'commis' } });
assert.deepEqual(sa.messages[0], { type: 'ack', seq: 1 }, 'ack is synchronous');
const rubies = match.sim.rubies[0];
assert.equal(match.sim.queues[0].length, 1);
send(sa, { type: 'cmd', seq: 1, cmd: { kind: 'recruit', type: 'commis' } });
assert.equal(match.sim.rubies[0], rubies);
assert.equal(match.sim.queues[0].length, 1);
const enemy = match.sim.units.find((unit) => unit.team === 1);
const beforeEnemy = JSON.stringify(enemy);
send(sa, { type: 'cmd', seq: 2, cmd: { kind: 'hold', ids: [enemy.id] } });
assert.equal(JSON.stringify(enemy), beforeEnemy, 'enemy orders have no effect, like HTTP');
send(sa, { type: 'cmd', seq: 3, cmd: { kind: 'recruit', type: 'knight' } });
assert.equal(sa.messages.at(-1).type, 'error');
assert.equal(match.sim.queues[0].length, 1);
match.webSocketMessage(sa, '{');
assert.equal(sa.messages.at(-1).type, 'error');
await clock.advance(1000);
await Promise.all(ctx.pending);
assert(ctx.storage.writes > writes, '5 second checkpoint');
match.webSocketClose(sb);
await clock.advance(10000);
assert.equal(match.status(), 'disconnected');
const paused = match.sim.time;
await clock.advance(1000);
assert(match.sim.time > paused, 'simulation continues during disconnect');
const rejoined = await match.authenticate(url(''), b.token);
assert.equal(rejoined.team, b.team);
const sb2 = connect(b.team);
await clock.advance(1000);
assert.equal(match.status(), 'playing');
assert(match.sim.time > paused);

// Simulate eviction, retaining hibernatable sockets and the persisted checkpoint.
await match.save();
match.stopTimer();
const restored = new Match(ctx, {}, clock);
await restored.ready;
assert.equal(restored.sim.time, match.sim.time);
const money = restored.sim.rubies[0];
restored.webSocketMessage(
  sa,
  JSON.stringify({ type: 'cmd', seq: 1, cmd: { kind: 'recruit', type: 'commis' } }),
);
assert.equal(restored.sim.rubies[0], money, 'sequence survives eviction');
restored.webSocketMessage(sb2, JSON.stringify({ type: 'leave' }));
assert.equal(restored.sim.winner, 0);
assert.equal(restored.status(), 'ended');
restored.webSocketMessage(sa, JSON.stringify({ type: 'leave' }));
assert.equal(restored.sim.winner, 0);
assert.equal(clock.timers.size, 1, 'only the mock heartbeat remains');
await Promise.all(ctx.pending);
assert.equal(ctx.storage.alarm, null);

const timeoutClock = new Clock();
const timeoutCtx = context();
const timeout = new Match(timeoutCtx, {}, timeoutClock);
await timeout.ready;
await timeout.authenticate(url('action=create'));
await timeout.authenticate(url('action=join'));
timeoutClock.time += 30000;
await timeout.alarm();
assert.equal(timeout.sim.winner, 1, '30 second absence ends game without HTTP or sockets');
// The surviving participant wins autonomously after a disconnect.
const survivorClock = new Clock();
const survivorCtx = context();
const survivor = new Match(survivorCtx, {}, survivorClock);
await survivor.ready;
await survivor.authenticate(url('action=create'));
await survivor.authenticate(url('action=join'));
for (const team of [0, 1]) {
  const socket = new Socket();
  socket.serializeAttachment({ team, closed: false });
  survivorCtx.acceptWebSocket(socket);
}
heartbeat(survivor, survivorClock);
survivor.startTimer();
survivor.webSocketClose(survivorCtx.sockets[1]);
await survivorClock.advance(30000);
assert.equal(survivor.sim.winner, 0);
assert.equal(survivorCtx.sockets[0].messages.at(-1).status, 'ended');

// A victory produced by sim.js is broadcast and stops the scheduler too.
const combatClock = new Clock();
const combatCtx = context();
const combat = new Match(combatCtx, {}, combatClock);
await combat.ready;
await combat.authenticate(url('action=create'));
await combat.authenticate(url('action=join'));
for (const team of [0, 1]) {
  const socket = new Socket();
  socket.serializeAttachment({ team, closed: false });
  combatCtx.acceptWebSocket(socket);
}
const attacker = combat.sim.units.find((unit) => unit.team === 0);
const enemyBase = combat.sim.bases[1];
attacker.x = enemyBase.x - 20;
attacker.y = enemyBase.y;
attacker.target = enemyBase;
attacker.harvest = null;
attacker.cool = 0;
enemyBase.hp = 1;
S.visibility(combat.sim);
combat.startTimer();
await combatClock.advance(3050);
assert.equal(combat.sim.winner, 0);
assert.equal(combatCtx.sockets[0].messages.at(-1).state.winner, 0);
assert.equal(combatClock.timers.size, 0);

const cancelled = new Match(context(), {}, new Clock());
await cancelled.ready;
await cancelled.authenticate(url('action=create'));
const lone = new Socket();
lone.serializeAttachment({ team: 0, closed: false });
cancelled.webSocketMessage(lone, JSON.stringify({ type: 'leave' }));
await assert.rejects(cancelled.authenticate(url('action=join')), /fermé/);

// Exercise the actual upgrade path with Cloudflare primitives replaced in Node.
const originalPair = globalThis.WebSocketPair;
const originalResponse = globalThis.Response;
globalThis.WebSocketPair = class {
  constructor() {
    return { 0: new Socket(), 1: new Socket() };
  }
};
globalThis.Response = class extends originalResponse {
  constructor(body, init) {
    if (init?.status === 101) return { status: 101, webSocket: init.webSocket };
    super(body, init);
  }
};
try {
  const upgrade = new Match(context(), {}, new Clock());
  await upgrade.ready;
  const request = (query, origin = 'https://cendre.test') =>
    new Request(url(query), {
      headers: { Upgrade: 'websocket', Origin: origin },
    });
  assert.equal((await upgrade.fetch(request('action=create', 'https://evil.test'))).status, 403);
  assert.equal((await upgrade.fetch(request('action=create'))).status, 101);
  const firstSocket = upgrade.ctx.sockets.at(-1);
  assert.equal(firstSocket.messages.length, 0, 'no session before hello');
  assert.equal(upgrade.room, null, 'no membership before hello');
  await upgrade.webSocketMessage(firstSocket, JSON.stringify({ type: 'hello' }));
  const session = firstSocket.messages.find((message) => message.type === 'session');
  assert(session);
  assert.equal((await upgrade.fetch(request(`token=${session.token}`))).status, 101);
  const oldProtocol = upgrade.ctx.sockets.at(-1);
  await upgrade.webSocketMessage(oldProtocol, JSON.stringify({ type: 'hello' }));
  assert(oldProtocol.closed, 'URL token cannot authenticate');
  assert(!firstSocket.closed);
  assert.equal((await upgrade.fetch(request(''))).status, 101);
  const replacement = upgrade.ctx.sockets.at(-1);
  await upgrade.webSocketMessage(replacement, JSON.stringify({ type: 'hello', token: session.token }));
  assert(firstSocket.closed);
  assert.equal(upgrade.sockets().length, 1);
  await upgrade.fetch(request(''));
  const silent = upgrade.ctx.sockets.at(-1);
  await upgrade.clock.advance(4950);
  assert(!silent.closed);
  await upgrade.clock.advance(50);
  assert(silent.closed, 'hello deadline is exactly 5 seconds');
  await upgrade.fetch(request(''));
  const premature = upgrade.ctx.sockets.at(-1);
  await upgrade.webSocketMessage(premature, JSON.stringify({ type: 'ping' }));
  assert(premature.closed, 'first message must be hello');
  await upgrade.fetch(request(''));
  const invalid = upgrade.ctx.sockets.at(-1);
  await upgrade.webSocketMessage(invalid, JSON.stringify({ type: 'hello', token: 'wrong' }));
  assert(invalid.closed, 'invalid hello closes connection');
  assert.equal((await upgrade.fetch(new Request(url('')))).status, 426);
  let routed;
  const env = {
    MATCH: {
      idFromName(code) {
        return code;
      },
      get(code) {
        return {
          fetch(req) {
            routed = { code, url: req.url };
            return 'DO';
          },
        };
      },
    },
    ASSETS: {
      fetch() {
        return 'static';
      },
    },
  };
  assert.equal(await worker.fetch(new Request('https://cendre.test/game/'), env), 'static');
  assert.equal(
    await worker.fetch(new Request('https://cendre.test/api/ws?action=create'), env),
    'DO',
  );
  assert.match(routed.code, /^[A-Z2-9]{7}$/);
  assert.equal(
    await worker.fetch(new Request('https://cendre.test/api/ws?code=%20salon%20ab%20cd%20efg%20'), env),
    'DO',
  );
  assert.equal(routed.code, 'ABCDEFG');
} finally {
  globalThis.WebSocketPair = originalPair;
  globalThis.Response = originalResponse;
}
console.log(
  'PASS: realtime rooms, 20 Hz simulation, synchronous ack, ownership, costs, deduplication, fog, 10 Hz snapshots, reconnect, eviction, surrender, timeouts and routing.',
);
