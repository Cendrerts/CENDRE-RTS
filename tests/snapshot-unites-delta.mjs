import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { view } from '../lib/match.mjs';
import { createAI } from '../public/game/ai.js';
import { CendreSim as Sim } from '../public/game/sim.js';
import { Match } from '../server/match-do.js';
import { RealtimeClient } from '../public/game/realtime.js';

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
    return [];
  },
};

const match = new Match(context, {}, clock);
await match.ready;
const url = (query) => new URL(`https://cendre.test/api/ws?code=ABCDEFG&${query}`);
const initialRandom = Math.random;
let seed = 18;
Math.random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

function attachSocket(peer) {
  peer.socket = new Socket();
  peer.socket.serializeAttachment({ team: peer.player.team, closed: false, lastMessageAt: clock.time });
}

async function connectPeer(player) {
  const peer = { player };
  attachSocket(peer);
  peer.client = new RealtimeClient({
    Socket,
    clock,
    onSnapshot: ({ state }) => {
      peer.decoded = state;
    },
  });
  const connected = peer.client.connect({ code: player.code, token: player.token });
  const wire = snapshot(peer);
  await connected;
  assert.deepEqual(wire.units.map((unit) => unit.id), wire.unitIds);
  return peer;
}

function snapshot(peer) {
  match.snapshot(peer.socket);
  const raw = peer.socket.messages.pop();
  peer.client.socket.receive(raw);
  const { state } = JSON.parse(raw);
  const expected = view(match.sim, peer.player.team, { compactUnits: false }).units;
  assert.deepEqual(peer.decoded.units, expected);
  assert.deepEqual(state.unitIds, expected.map((unit) => unit.id));
  return state;
}

let peers;
let before = 0;
let after = 0;
let idsOverhead = 0;
let count = 0;
try {
  const players = [
    await match.authenticate(url('action=create&team=0')),
    await match.authenticate(url('action=join')),
  ];
  peers = await Promise.all(players.map(connectPeer));
  const controllers = players.map(({ team }) => createAI(team, 'brutal', match.sim));

  for (let tick = 1; tick <= 3600; tick++) {
    for (const controller of controllers) {
      controller.update(match.sim);
    }
    Sim.tick(match.sim, 0.05);
    if (tick % 2 !== 0) continue;
    for (const peer of peers) {
      const fullUnits = view(match.sim, peer.player.team).units;
      const wire = snapshot(peer);
      before += Buffer.byteLength(JSON.stringify(fullUnits));
      after += Buffer.byteLength(JSON.stringify(wire.units));
      idsOverhead += Buffer.byteLength(`,"unitIds":${JSON.stringify(wire.unitIds)}`);
      count++;
    }
  }
} finally {
  Math.random = initialRandom;
}

assert(match.sim.time >= 180);
assert.equal(count, 3600);
assert(after < before);

for (const peer of peers) {
  const previous = peer.decoded.units;
  assert(previous.length > 0);
  const stable = snapshot(peer);
  assert.deepEqual(stable.units, []);
  assert.deepEqual(stable.unitIds, previous.map((unit) => unit.id));
  for (const [index, unit] of peer.decoded.units.entries()) {
    assert.notStrictEqual(unit, previous[index]);
    assert.notStrictEqual(unit.orderQueue, previous[index].orderQueue);
  }
  peer.decoded.units[0].orderQueue.push({ kind: 'test' });
  snapshot(peer);
}

const [observer, opponent] = peers;
const enemy = match.sim.units.find((unit) => unit.team === opponent.player.team);
const ally = match.sim.units.find((unit) => unit.team === observer.player.team);
enemy.x = ally.x;
enemy.y = ally.y;

const visible = match.sim.visible[observer.player.team];
const cell = Math.floor(enemy.y / Sim.CELL) * Sim.COLS + Math.floor(enemy.x / Sim.CELL);
visible[cell] = 1;
assert(snapshot(observer).unitIds.includes(enemy.id));

visible[cell] = 0;
assert(!snapshot(observer).unitIds.includes(enemy.id));
assert(match.sim.units.includes(enemy));

visible[cell] = 1;
assert(snapshot(observer).units.some((unit) => unit.id === enemy.id));

enemy.hp = 0;
Sim.tick(match.sim, 0.05);
assert(!match.sim.units.includes(enemy));
assert(!snapshot(opponent).unitIds.includes(enemy.id));

for (const peer of peers) {
  const { player } = peer;
  await match.authenticate(url(''), player.token);
  attachSocket(peer);
  peer.client.open();
  const wire = snapshot(peer);
  assert.deepEqual(wire.units.map((unit) => unit.id), wire.unitIds);
}

console.log(`Brutal miroir (graine 18, ${count} snapshots) — units : ${(before / count).toFixed(1)} → ${(after / count).toFixed(1)} octets en moyenne.`);
console.log(`Avec le champ unitIds : ${((after + idsOverhead) / count).toFixed(1)} octets en moyenne.`);

const gameDirectory = new URL('../public/game/', import.meta.url);
for (const file of await readdir(gameDirectory, { recursive: true, withFileTypes: true })) {
  if (!file.isFile() || ['sim.js', 'ai.js'].includes(file.name)) continue;
  if (!/\.(?:[cm]?js|html)$/.test(file.name)) continue;
  const source = await readFile(`${file.parentPath}/${file.name}`, 'utf8');
  assert.doesNotMatch(source, /\b(?:harvest|h)\s*(?:\?\.|\.)\s*elapsed\b/, file.name);
}

match.sim = Sim.create();
const team = observer.player.team;
const miner = match.sim.units.find((unit) => unit.team === team && unit.type === 'commis');
assert(Sim.gather(match.sim, team, [miner.id], team));
for (let tick = 0; tick < 100 && miner.harvest.phase !== 'MINAGE'; tick++) {
  Sim.tick(match.sim, 0.05);
}
assert.equal(miner.harvest.phase, 'MINAGE');

attachSocket(observer);
const firstSnapshot = snapshot(observer);
const firstMiner = firstSnapshot.units.find((unit) => unit.id === miner.id);
assert.deepEqual(firstMiner.harvest, { mine: team, phase: 'MINAGE' });
const getVisibleMiner = () => view(match.sim, team, { compactUnits: false }).units
  .find((unit) => unit.id === miner.id);
const initialMinerView = getVisibleMiner();
assert.deepEqual(initialMinerView.harvest, firstMiner.harvest);
const initialElapsed = miner.harvest.elapsed;

for (let tick = 1; tick <= 40; tick++) {
  Sim.tick(match.sim, 0.05);
  if (tick % 2 !== 0) continue;
  const wire = snapshot(observer);
  assert(wire.unitIds.includes(miner.id));
  assert(!wire.units.some((unit) => unit.id === miner.id));
  assert.deepEqual(getVisibleMiner(), initialMinerView);
}
assert(Math.abs(miner.harvest.elapsed - initialElapsed - 2) < 1e-8);
