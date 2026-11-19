import assert from 'node:assert/strict';
import { command, view } from '../lib/match.mjs';
import { Match } from '../server/match-do.js';
import { RealtimeClient } from '../public/game/realtime.js';
import { CendreSim as Sim } from '../public/game/sim.js';

const stableFields = ['camps', 'watchtowers', 'braises', 'bases', 'corpses'];

class Socket {
  messages = [];

  send(raw) {
    this.messages.push(raw);
  }

  serializeAttachment(attachment) {
    this.attachment = structuredClone(attachment);
  }

  deserializeAttachment() {
    return structuredClone(this.attachment);
  }

  receive(raw) {
    this.onmessage({ data: raw });
  }
}

const clock = {
  time: 100000,
  setTimeout(callback) {
    return callback;
  },
  clearTimeout() {},
  setInterval(callback) {
    return callback;
  },
};
clock.Date = { now: () => clock.time };

const sockets = [];
let saved;
const context = {
  storage: {
    async get() {
      return structuredClone(saved);
    },
    async put(key, room) {
      saved = structuredClone(room);
    },
    async setAlarm() {},
  },
  blockConcurrencyWhile(callback) {
    return callback();
  },
  getWebSockets() {
    return sockets;
  },
};

const match = new Match(context, {}, clock);
await match.ready;
const url = (query) => new URL(`https://cendre.test/api/ws?code=ABCDEFG&${query}`);
const player = await match.authenticate(url('action=create&team=0'));
await match.authenticate(url('action=join'));

function connectSocket() {
  const socket = new Socket();
  socket.serializeAttachment({ team: player.team, closed: false, lastMessageAt: clock.time });
  sockets.push(socket);
  return socket;
}

const socket = connectSocket();
match.snapshot(socket);
const complete = socket.messages.at(-1);
const firstState = JSON.parse(complete).state;
assert(Object.hasOwn(firstState, 'slots'));
assert.equal(typeof firstState.explored, 'string');
assert(Array.isArray(firstState.mines));
const firstView = view(match.sim, player.team, { compactUnits: false });
for (const field of stableFields) {
  assert(Array.isArray(firstState[field]), field);
  assert.deepEqual(firstState[field], firstView[field], field);
}

clock.time += 100;
match.advance();
const reduced = socket.messages.at(-1);
const reducedState = JSON.parse(reduced).state;
assert(!Object.hasOwn(reducedState, 'slots'));
assert(!Object.hasOwn(reducedState, 'explored'));
assert(!Object.hasOwn(reducedState, 'mines'));
for (const field of stableFields) {
  assert(!Object.hasOwn(reducedState, field), field);
}
assert.equal(typeof reducedState.visible, 'string');
const savings = complete.length - reduced.length;

const received = [];
const client = new RealtimeClient({
  Socket,
  clock,
  onSnapshot: ({ state }) => received.push(state),
});
const connected = client.connect({ code: player.code, token: player.token });
client.socket.receive(JSON.stringify({ type: 'session', code: player.code, token: player.token }));
client.socket.receive(complete);
await connected;
client.socket.receive(reduced);
assert.equal(received.length, 2);
const expectedExplored = match.sim.explored.map((grid, team) =>
  Array.from(grid, (cell) => team === player.team ? cell : 0),
);
assert.deepEqual(received[0].explored, expectedExplored);
assert.deepEqual(received[1].explored, expectedExplored);
assert.deepEqual(received[1].slots, firstState.slots);
assert.deepEqual(received[1].mines, firstState.mines);
for (const field of stableFields) {
  assert.deepEqual(received[1][field], firstState[field], field);
}
assert.deepEqual(received[1].visible, received[0].visible);

clock.time = match.room.startAt;
match.sim.rubies[player.team] = 100;
match.webSocketMessage(socket, JSON.stringify({
  type: 'cmd',
  seq: 1,
  cmd: { kind: 'construct', type: 'garde_manger', baseId: 'main_0' },
}));
match.snapshot(socket);
const constructed = socket.messages.at(-1);
const builtState = JSON.parse(constructed).state;
assert.equal(builtState.slots[player.team].filter((slot) => slot.occupe).length, 1);
assert(!Object.hasOwn(builtState, 'explored'));
client.socket.receive(constructed);
assert.deepEqual(received.at(-1).slots, builtState.slots);
assert.deepEqual(received.at(-1).explored, expectedExplored);

const explored = match.sim.explored[player.team];
const newCell = explored.indexOf(0);
assert(newCell >= 0);
explored[newCell] = 1;
expectedExplored[player.team][newCell] = 1;
match.snapshot(socket);
const discovery = socket.messages.at(-1);
const discoveryState = JSON.parse(discovery).state;
assert(!Object.hasOwn(discoveryState, 'slots'));
assert.equal(typeof discoveryState.explored, 'string');
client.socket.receive(discovery);
assert.deepEqual(received.at(-1).slots, builtState.slots);
assert.deepEqual(received.at(-1).explored, expectedExplored);

match.sim.mines[0].remaining--;
match.snapshot(socket);
const mining = socket.messages.at(-1);
const minedState = JSON.parse(mining).state;
assert.equal(minedState.mines[0].remaining, firstState.mines[0].remaining - 1);
client.socket.receive(mining);
assert.deepEqual(received.at(-1).mines, minedState.mines);

Sim.spawn(match.sim, 'knight', player.team);
const attacker = match.sim.units.at(-1);
Sim.spawn(match.sim, 'knight', 1 - player.team);
const victim = match.sim.units.at(-1);
Object.assign(victim, { x: attacker.x + 10, y: attacker.y, hp: 1 });
Sim.visibility(match.sim);
assert(Sim.visibleAt(match.sim, player.team, victim.x, victim.y));
command(match.sim, player.team, {
  kind: 'move',
  ids: [attacker.id],
  x: victim.x,
  y: victim.y,
  target: { id: victim.id },
});
Sim.tick(match.sim, 0.05);
assert(victim.hp <= 0);

match.snapshot(socket);
const casualty = socket.messages.at(-1);
const casualtyState = JSON.parse(casualty).state;
const visibleCorpses = view(match.sim, player.team).corpses;
assert.deepEqual(visibleCorpses.map(({ id }) => id), [victim.id]);
assert.deepEqual(casualtyState.corpses, visibleCorpses);
client.socket.receive(casualty);
assert.deepEqual(received.at(-1).corpses, visibleCorpses);

await match.authenticate(url(''), player.token);
const replacement = connectSocket();
match.snapshot(replacement);
const replacementSnapshot = replacement.messages.at(-1);
const replacementState = JSON.parse(replacementSnapshot).state;
assert.deepEqual(replacementState.slots, builtState.slots);
assert.equal(replacementState.explored, casualtyState.explored ?? discoveryState.explored);
assert.deepEqual(replacementState.mines, minedState.mines);
const disconnectedSocket = client.socket;
disconnectedSocket.onclose();
client.retry();
assert.notEqual(client.socket, disconnectedSocket);
client.socket.receive(JSON.stringify({ type: 'session', code: player.code, token: player.token }));
client.socket.receive(replacementSnapshot);
const replacementView = view(match.sim, player.team, { compactUnits: false });
for (const field of stableFields) {
  assert.deepEqual(replacementState[field], replacementView[field], field);
  assert.deepEqual(received.at(-1)[field], replacementView[field], field);
}

match.snapshot(replacement);
const replacementDelta = replacement.messages.at(-1);
client.socket.receive(replacementDelta);
const replacementDeltaState = JSON.parse(replacementDelta).state;
for (const field of stableFields) {
  assert(!Object.hasOwn(replacementDeltaState, field), field);
  assert.deepEqual(received.at(-1)[field], replacementView[field], field);
}

await match.save();
const restored = new Match(context, {}, clock);
await restored.ready;
restored.snapshot(replacement);
const restoredState = JSON.parse(replacement.messages.at(-1)).state;
assert.deepEqual(restoredState.slots, replacementState.slots);
assert.equal(restoredState.explored, replacementState.explored);
assert.deepEqual(restoredState.mines, replacementState.mines);

console.log(`Snapshot stable : ${complete.length} → ${reduced.length} caractères (−${savings}).`);
