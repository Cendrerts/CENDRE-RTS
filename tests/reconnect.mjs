import assert from 'node:assert/strict';
import { Match } from '../server/match-do.js';

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

const url = (query = '') => new URL('https://cendre.test/api/ws?code=ABCDEFG&' + query);
async function setup() {
  const clock = new Clock();
  const ctx = context();
  const match = new Match(ctx, {}, clock);
  await match.ready;
  const first = await match.authenticate(url('action=create'));
  const second = await match.authenticate(url('action=join'));
  const attach = (team) => {
    const socket = new Socket();
    socket.serializeAttachment({ team, closed: false });
    ctx.acceptWebSocket(socket);
    return socket;
  };
  const a = attach(first.team);
  const b = attach(second.team);
  match.startTimer();
  await clock.advance(4000);
  return { match, clock, ctx, a, b, second };
}
const game = await setup();
const unit = game.match.sim.units.find((entry) => entry.team === game.second.team);
game.match.webSocketMessage(game.b, JSON.stringify({
  type: 'cmd', seq: 1, cmd: { kind: 'move', ids: [unit.id], x: unit.x + 200, y: unit.y },
}));
const initialX = unit.x;
const tickN = game.match.sim.time;
game.match.webSocketClose(game.b);
assert.equal(game.a.messages.at(-1).disconnectCountdown, 30);
await game.clock.advance(10000);
assert(game.match.sim.time > tickN + 9, 'simulation advances while disconnected');
assert(unit.x > initialX, 'disconnected units retain orders');
assert.equal(game.a.messages.at(-1).disconnectCountdown, 20);
game.match.webSocketMessage(game.a, JSON.stringify({
  type: 'cmd', seq: 1, cmd: { kind: 'hold', ids: [] },
}));
assert.equal(game.a.messages.at(-1).type, 'ack', 'opponent can still issue orders');
const reconnect = new Socket();
reconnect.serializeAttachment({ url: url().href, deadline: game.clock.time + 5000, closed: false });
game.ctx.acceptWebSocket(reconnect);
await game.match.webSocketMessage(reconnect, JSON.stringify({ type: 'hello', token: game.second.token }));
assert.equal(reconnect.messages[0].type, 'session');
const snapshot = reconnect.messages[1];
assert.equal(snapshot.type, 'snapshot');
assert.equal(snapshot.state.time, game.match.sim.time);
assert(snapshot.state.units.some((entry) => entry.id === unit.id));
assert.equal(snapshot.state.visible[game.second.team].length, game.match.sim.visible[game.second.team].length);
assert.equal(snapshot.status, 'playing');
game.match.webSocketMessage(reconnect, JSON.stringify({
  type: 'cmd', seq: 2, cmd: { kind: 'hold', ids: [unit.id] },
}));
assert.equal(unit.hold, true, 'commands accepted after reconnect');
await game.clock.advance(100);
assert.equal(reconnect.messages.at(-1).type, 'snapshot', 'normal snapshots resume');
await assert.rejects(game.match.authenticate(url(), 'unknown-token'), /inconnue/);
const invalid = new Socket();
invalid.serializeAttachment({ url: url().href, deadline: game.clock.time + 5000, closed: false });
game.ctx.acceptWebSocket(invalid);
await game.match.webSocketMessage(invalid, JSON.stringify({ type: 'hello', token: 'unknown-token' }));
assert(invalid.closed);
assert.equal(invalid.messages[0].type, 'error');
const timeout = await setup();
timeout.match.webSocketClose(timeout.b);
await timeout.clock.advance(29950);
assert.equal(timeout.match.sim.winner, null);
await timeout.clock.advance(50);
assert.equal(timeout.match.sim.winner, 0);
assert.equal(timeout.a.messages.at(-1).reason, 'déconnexion');
assert.equal(timeout.a.messages.at(-1).status, 'ended');
await timeout.match.authenticate(url(), timeout.second.token);
assert.equal(timeout.match.sim.winner, 0, 'late reconnect cannot undo defeat');
const both = await setup();
both.match.webSocketClose(both.b);
both.match.webSocketClose(both.a);
const before = both.match.sim.time;
await both.clock.advance(1000);
assert(both.match.sim.time > before, 'simulation also runs with both sockets closed');
console.log('PASS: reconnect snapshot, continued orders and ticks, countdown, unknown token and exact 30 second defeat.');
