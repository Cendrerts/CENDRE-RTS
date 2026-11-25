import assert from 'node:assert/strict';
import { command, view } from '../lib/match.mjs';
import { Match } from '../server/match-do.js';
import { RealtimeClient } from '../public/game/realtime.js';
import { CendreSim as Sim } from '../public/game/sim.js';

const stableFields = ['camps', 'watchtowers', 'braises', 'bases', 'corpses', 'ragout', 'festin', 'fumets', 'pantries'];

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
const opponent = await match.authenticate(url('action=join'));

function connectSocket(team = player.team) {
  const socket = new Socket();
  socket.serializeAttachment({ team, closed: false, lastMessageAt: clock.time });
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
assert.equal(typeof firstState.visible, 'string');
assert.equal(firstState.visible, firstView.visible);
assert.deepEqual(firstState.mines, firstView.mines);
assert(!Object.hasOwn(firstState, 'minesChanged'));
for (const field of stableFields) {
  assert(Object.hasOwn(firstState, field), field);
  assert.deepEqual(firstState[field], firstView[field], field);
}

clock.time += 100;
match.advance();
const reduced = socket.messages.at(-1);
const reducedState = JSON.parse(reduced).state;
assert(!Object.hasOwn(reducedState, 'slots'));
assert(!Object.hasOwn(reducedState, 'explored'));
assert(!Object.hasOwn(reducedState, 'mines'));
assert(!Object.hasOwn(reducedState, 'minesChanged'));
for (const field of stableFields) {
  assert(!Object.hasOwn(reducedState, field), field);
}
assert(!Object.hasOwn(reducedState, 'visible'));
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
const secondView = view(match.sim, player.team);
for (const field of stableFields) {
  assert.deepEqual(received[1][field], secondView[field], field);
}
const visibleForPlayer = () => match.sim.visible.map((grid, team) =>
  Array.from(grid, (cell) => team === player.team ? cell : 0),
);
assert.deepEqual(received[0].visible, visibleForPlayer());
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
assert(!Object.hasOwn(discoveryState, 'explored'));
assert(Object.hasOwn(discoveryState, 'exploredAdded'));
client.socket.receive(discovery);
assert.deepEqual(received.at(-1).slots, builtState.slots);
assert.deepEqual(received.at(-1).explored, expectedExplored);

const mineIndex = 1;
match.sim.mines[mineIndex].remaining--;
match.snapshot(socket);
const mining = socket.messages.at(-1);
const minedState = JSON.parse(mining).state;
const minedView = view(match.sim, player.team, { compactUnits: false });
assert(!Object.hasOwn(minedState, 'mines'));
assert.deepEqual(minedState.minesChanged, [[mineIndex, minedView.mines[mineIndex]]]);
const beforeMining = received.at(-1);
client.socket.receive(mining);
assert.deepEqual(received.at(-1).mines, minedView.mines);
assert(!Object.hasOwn(received.at(-1), 'minesChanged'));
assert.deepEqual(beforeMining.mines, firstState.mines);

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

const exploredBeforeMove = explored.slice();
const startX = attacker.x;
const startY = attacker.y;
command(match.sim, player.team, {
  kind: 'move',
  ids: [attacker.id],
  x: 1100,
  y: 1550,
});
let discoveredCell = -1;
for (let tick = 0; tick < 200 && discoveredCell === -1; tick++) {
  Sim.tick(match.sim, 0.05);
  discoveredCell = match.sim.visible[player.team].findIndex((cell, index) =>
    cell === 1 && exploredBeforeMove[index] === 0,
  );
}
assert(attacker.x !== startX || attacker.y !== startY);
assert(discoveredCell >= 0);
match.snapshot(socket);
const movement = socket.messages.at(-1);
const movementState = JSON.parse(movement).state;
assert.equal(typeof movementState.visible, 'string');
assert.equal(movementState.visible, view(match.sim, player.team).visible);
client.socket.receive(movement);
assert.equal(received.at(-1).visible[player.team][discoveredCell], 1);
assert.deepEqual(received.at(-1).visible, visibleForPlayer());

await match.authenticate(url(''), player.token);
const replacement = connectSocket();
match.snapshot(replacement);
const replacementSnapshot = replacement.messages.at(-1);
const replacementState = JSON.parse(replacementSnapshot).state;
assert.deepEqual(replacementState.slots, builtState.slots);
assert.equal(replacementState.explored, view(match.sim, player.team).explored);
assert.equal(replacementState.visible, movementState.visible);
assert(!Object.hasOwn(replacementState, 'minesChanged'));
const disconnectedSocket = client.socket;
disconnectedSocket.onclose();
client.retry();
assert.notEqual(client.socket, disconnectedSocket);
client.socket.receive(JSON.stringify({ type: 'session', code: player.code, token: player.token }));
client.socket.receive(replacementSnapshot);
const replacementView = view(match.sim, player.team, { compactUnits: false });
assert.deepEqual(received.at(-1).visible, visibleForPlayer());
assert.deepEqual(replacementState.mines, replacementView.mines);
assert.deepEqual(received.at(-1).mines, replacementView.mines);
for (const field of stableFields) {
  assert.deepEqual(replacementState[field], replacementView[field], field);
  assert.deepEqual(received.at(-1)[field], replacementView[field], field);
}

match.snapshot(replacement);
const replacementDelta = replacement.messages.at(-1);
client.socket.receive(replacementDelta);
const replacementDeltaState = JSON.parse(replacementDelta).state;
assert(!Object.hasOwn(replacementDeltaState, 'visible'));
assert.deepEqual(received.at(-1).visible, visibleForPlayer());
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
assert.equal(restoredState.visible, replacementState.visible);
assert.deepEqual(restoredState.mines, replacementState.mines);

const opponentSocket = connectSocket(opponent.team);
let opponentState;
const opponentClient = new RealtimeClient({
  Socket,
  clock,
  onSnapshot: ({ state }) => {
    opponentState = state;
  },
});
const opponentConnected = opponentClient.connect({ code: opponent.code, token: opponent.token });
opponentClient.socket.receive(JSON.stringify({ type: 'session', code: opponent.code, token: opponent.token }));

function checkDishes(serverSocket, realtimeClient, team, latestState, sentFields) {
  match.snapshot(serverSocket);
  const snapshot = serverSocket.messages.at(-1);
  const wireState = JSON.parse(snapshot).state;
  const serverView = view(match.sim, team);
  realtimeClient.socket.receive(snapshot);
  for (const field of ['ragout', 'festin', 'fumets']) {
    assert.equal(Object.hasOwn(wireState, field), sentFields.includes(field), field);
    if (sentFields.includes(field)) {
      assert.deepEqual(wireState[field], serverView[field], field);
    }
    assert.deepEqual(latestState()[field], serverView[field], field);
  }
}

const checkPlayer = (sentFields) => checkDishes(
  replacement, client, player.team, () => received.at(-1), sentFields,
);
const checkOpponent = (sentFields) => checkDishes(
  opponentSocket, opponentClient, opponent.team, () => opponentState, sentFields,
);
checkOpponent(['ragout', 'festin', 'fumets']);
await opponentConnected;

match.sim.ingredients[0].viande = 80;
match.sim.ingredients[1].viande = 80;
command(match.sim, player.team, { kind: 'cookDish', dish: 'ragout' });
command(match.sim, opponent.team, { kind: 'cookDish', dish: 'festin' });
checkPlayer(['ragout', 'fumets']);
checkOpponent(['festin', 'fumets']);
assert.notEqual(received.at(-1).ragout.readyAt, null);
assert.notEqual(opponentState.festin.readyAt, null);
assert.deepEqual(opponentState.ragout, { readyAt: null, expiresAt: 0 });
assert.deepEqual(received.at(-1).festin, { readyAt: null });
checkPlayer([]);
checkOpponent([]);

Sim.tick(match.sim, 20);
checkPlayer(['ragout', 'fumets']);
checkOpponent(['festin', 'fumets']);
assert.equal(received.at(-1).ragout.readyAt, null);
assert(received.at(-1).ragout.expiresAt > match.sim.time);
assert.equal(opponentState.festin.readyAt, null);
assert.deepEqual(opponentState.ragout, { readyAt: null, expiresAt: 0 });
assert.deepEqual(received.at(-1).festin, { readyAt: null });
checkPlayer([]);
checkOpponent([]);

match.sim.pantries[player.team].stock++;
match.snapshot(replacement);
match.snapshot(opponentSocket);
const pantrySnapshot = replacement.messages.at(-1);
const opponentPantrySnapshot = opponentSocket.messages.at(-1);
assert.deepEqual(JSON.parse(pantrySnapshot).state.pantries, view(match.sim, player.team).pantries);
assert(!Object.hasOwn(JSON.parse(opponentPantrySnapshot).state, 'pantries'));
client.socket.receive(pantrySnapshot);
opponentClient.socket.receive(opponentPantrySnapshot);
assert.equal(received.at(-1).pantries[player.team].stock, match.sim.pantries[player.team].stock);
assert.equal(opponentState.pantries[player.team].stock, null);

const shot = { x: 100.456, y: 200.789, tx: 300.12, ty: 400.98, team: player.team, life: 0.15 };
match.sim.visible[player.team].fill(1);
match.sim.shots = [shot];
match.snapshot(socket);
client.socket.receive(socket.messages.at(-1));
assert.deepEqual(received.at(-1).shots, [
  { x: 100, y: 201, tx: 300, ty: 401, team: player.team },
]);
assert.deepEqual(view(match.sim, player.team).shots, [
  { x: 100.456, y: 200.789, tx: 300.12, ty: 400.98, team: player.team, life: 0.15 },
]);

console.log(`Snapshot stable : ${complete.length} → ${reduced.length} caractères (−${savings}).`);
