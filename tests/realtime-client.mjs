import assert from 'node:assert/strict';
import { RealtimeClient, RealtimeMotion, normalizeRoomCode, networkQuality } from '../public/game/realtime.js';
import { CendreSim as Sim } from '../public/game/sim.js';
class Clock {
  time = 0;
  next = 0;
  timers = new Map();
  setTimeout = (fn, delay) => {
    const id = ++this.next;
    this.timers.set(id, { fn, at: this.time + delay });
    return id;
  };
  clearTimeout = (id) => this.timers.delete(id);
  advance(end) {
    while (true) {
      const next = [...this.timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      this.time = next[1].at;
      this.timers.delete(next[0]);
      next[1].fn();
    }
    this.time = end;
  }
}
const clock = new Clock();
let offlineUntil = 0;
const sent = [];
const sockets = [];
class Socket {
  readyState = 1;
  constructor(url) {
    this.url = url;
    sockets.push(this);
    clock.setTimeout(() => {
      if (clock.time < offlineUntil) this.close();
      else {
        this.onopen?.();
        this.message({ type: 'session', code: 'ABCDEFG', token: 'secret', team: 0 });
        this.message({ type: 'snapshot', ack: 0 });
      }
    }, 1);
  }
  message(data) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  send(raw) {
    const message = JSON.parse(raw);
    sent.push(message);
    if (message.type === 'ping') clock.setTimeout(() => this.message({ type: 'pong' }), 150);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}
let rtt;
const statuses = [];
const client = new RealtimeClient({ Socket, clock, onStatus: (status) => statuses.push(status), now: () => clock.time, onRtt: (value) => { rtt = value; } });
const connected = client.connect({ action: 'create', team: 0 });
clock.advance(1);
await connected;
client.command({ kind: 'hold', ids: [1] }, 1);
assert.equal(sent.at(-1).type, 'cmd', 'commands leave synchronously');
clock.advance(151);
assert.equal(rtt, 150);
offlineUntil = 3151;
sockets.at(-1).close();
assert.equal(statuses.at(-1), 'reconnecting', 'backoff announces reconnection');
clock.advance(6000);
assert(sockets.every((socket) => !new URL(socket.url).searchParams.has('token')));
assert(sent.some((message) => message.type === 'hello' && message.token === 'secret'));
assert.equal(sent[0].type, 'hello');
assert.equal(normalizeRoomCode('  salon ab cd efg  '), 'ABCDEFG');
assert.equal(normalizeRoomCode('a b c d e f g'), 'ABCDEFG');
assert.deepEqual([79, 80, 160, 161].map(networkQuality), ['good', 'fair', 'fair', 'poor']);
assert(sent.filter((message) => message.type === 'cmd').length >= 2, 'unacked orders replay');
sockets.at(-1).message({ type: 'ack', seq: 1 });
assert.equal(client.pending.size, 0);
assert.equal(client.session.code, 'ABCDEFG');
client.close();

const motion = new RealtimeMotion();
const state = Sim.create();
const unit = state.units.find((entry) => entry.team === 0);
const start = { ...unit };
const frames = [];
// Deterministic latency between 70 and 230 ms, preserving WebSocket order.
let arrival = 0;
for (let time = 0; time <= 5000; time += 100) {
  const latency = 150 + Math.sin(time * 0.013) * 80;
  arrival = Math.max(arrival + 1, time + latency);
  frames.push({ at: arrival, time, unit: { ...start, x: start.x + time * 0.04 } });
}
let previous;
for (let now = 0; now < 5500; now += 1000 / 60) {
  while (frames.length && frames[0].at <= now) {
    const frame = frames.shift();
    motion.receive([frame.unit], now, frame.time / 1000);
  }
  if (!motion.snapshots.length) continue;
  const position = motion.position(start, now);
  if (previous) assert(Math.hypot(position.x - previous.x, position.y - previous.y) * 3.5 <= 6);
  previous = position;
}
const local = new RealtimeMotion();
local.receive([unit], 0, 0);
const before = local.position(unit, 0);
const originalState = JSON.stringify(state);
local.predict({ kind: 'move', ids: [unit.id], x: unit.x + 100, y: unit.y }, state, 0, 0);
const after = local.position(unit, 1000 / 60);
assert(after.x > before.x, 'local movement visible next frame without server reply');
assert.equal(JSON.stringify(state), originalState, 'prediction never mutates authoritative state');
local.receive([{ ...unit, x: unit.x + 2 }], 150, 0.15);
for (let now = 150; now <= 300; now += 10) local.position(unit, now);
assert.equal(local.corrections.size, 0, 'correction finishes within 120 ms');
const stopped = local.position(unit, 1000);
assert.equal(local.position(unit, 2000).x, stopped.x, 'no extrapolation after last snapshot');
local.receive([], 200, 0.2);
assert.equal(local.display.size, 0, 'hidden units removed immediately');
assert.equal(local.predictions.size, 0);
console.log('PASS: immediate commands, RTT, jitter at 60 FPS, local prediction, fog and session reconnect after 3 seconds.');
