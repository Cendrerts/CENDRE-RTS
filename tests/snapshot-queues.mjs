import assert from 'node:assert/strict';
import { command, pack, view } from '../lib/match.mjs';
import { RealtimeClient } from '../public/game/realtime.js';
import { CendreSim as Sim } from '../public/game/sim.js';
import { Match } from '../server/match-do.js';

const clock = {
  Date: { now: () => 0 },
  setInterval() {},
  setTimeout() {},
  clearTimeout() {},
};
const match = new Match({
  storage: {
    get: async () => ({
      code: 'ABCDEFG',
      started: true,
      startAt: 0,
      players: [{ team: 0, seen: 0, seq: 0 }],
      state: pack(Sim.create()),
    }),
  },
  blockConcurrencyWhile: (callback) => callback(),
  getWebSockets: () => [],
}, {}, clock);
await match.ready;

let received;
const client = new RealtimeClient({
  Socket: class {
    close() {}
  },
  clock,
  onSnapshot: ({ state }) => {
    received = state.queues;
  },
});
const connected = client.connect({ code: 'ABCDEFG' });
function makeSocket() {
  return {
    deserializeAttachment: () => ({ team: 0 }),
    send(raw) {
      this.raw = raw;
    },
  };
}
const socket = makeSocket();
function checkSnapshot(complete, peer = socket) {
  const previous = received;
  match.snapshot(peer);
  assert.equal(Object.hasOwn(JSON.parse(peer.raw).state, 'queues'), complete);
  client.socket.onmessage({ data: peer.raw });
  const expected = view(match.sim, 0, { compactUnits: false }).queues;
  assert.notEqual(received, previous);
  assert.equal(received.length, expected.length);
  for (const [team, queue] of received.entries()) {
    assert.notEqual(queue, previous?.[team]);
    assert.equal(queue.length, expected[team].length);
    for (const [index, { remaining, ...shape }] of queue.entries()) {
      const { remaining: expectedRemaining, ...expectedShape } = expected[team][index];
      assert.deepEqual(shape, expectedShape);
      assert.ok(Math.abs(remaining - expectedRemaining) <= 1e-6);
      assert.notEqual(queue[index], previous?.[team][index]);
    }
  }
}

checkSnapshot(true);
await connected;
checkSnapshot(false);
match.sim.rubies[0] = 1000;
command(match.sim, 0, { kind: 'construct', type: Sim.BUILDINGS[0][0].id });
match.sim.time = match.sim.slots[0][0].batiment.readyAt;
const kitchen = Sim.producers(match.sim, 0, 'knight')[0];
for (let index = 0; index < 3; index++) {
  command(match.sim, 0, { kind: 'recruit', type: 'commis', producerId: 'main_0' });
  checkSnapshot(true);
}
command(match.sim, 0, { kind: 'recruit', type: 'knight', producerId: kitchen.id });
checkSnapshot(true);
received[0][0].remaining = -1;
received[0][1].remaining = -1;

function advanceBetweenSnapshots() {
  Sim.tick(match.sim, 0.05);
  Sim.tick(match.sim, 0.05);
}
for (let index = 0; index < 40; index++) {
  advanceBetweenSnapshots();
  checkSnapshot(false);
}
const { id: jobId, producerId } = match.sim.queues[0][0];
command(match.sim, 0, { kind: 'cancelProduction', producerId, jobId });
checkSnapshot(true);
for (let index = 0; index < 49; index++) {
  advanceBetweenSnapshots();
  checkSnapshot(false);
}
const unitsProduced = match.sim.matchCounters[0].unitsProduced;
advanceBetweenSnapshots();
assert.equal(match.sim.matchCounters[0].unitsProduced, unitsProduced + 1);
checkSnapshot(true);
advanceBetweenSnapshots();
checkSnapshot(false);
checkSnapshot(true, makeSocket());
client.close();
console.log('Files WebSocket vérifiées après recrutement, annulation, sortie et remplacement du socket.');
