import assert from 'node:assert/strict';
import { view } from '../lib/match.mjs';
import { RealtimeClient } from '../public/game/realtime.js';
import { CendreSim as Sim } from '../public/game/sim.js';
import { decodeSnapshotFog } from '../public/game/snapshot-fog.js';
import { Match } from '../server/match-do.js';

class Socket {
  send(raw) {
    this.raw = raw;
  }

  deserializeAttachment() {
    return { team };
  }
}

const team = 1;
const clock = {
  Date: { now: () => 0 },
  setTimeout(callback) {
    return callback;
  },
  clearTimeout() {},
};
const match = new Match({
  storage: { get: async () => undefined },
  blockConcurrencyWhile: (callback) => callback(),
}, {}, clock);
await match.ready;
match.room = { code: 'ABCDEFG', startAt: 0, players: [{ team, seq: 0 }] };
match.sim = Sim.create();
const grid = match.sim.explored[team];
grid.fill(0);

let decoded;
const client = new RealtimeClient({
  Socket,
  clock,
  onSnapshot: ({ state }) => {
    decoded = state;
  },
});
const connected = client.connect({ code: match.room.code, token: 'test' });
const session = JSON.stringify({ type: 'session', code: match.room.code, token: 'test' });
client.socket.onmessage({ data: session });
let serverSocket = new Socket();

function snapshot() {
  match.snapshot(serverSocket);
  const { raw } = serverSocket;
  const { state } = JSON.parse(raw);
  const http = view(match.sim, team, { compactUnits: false });
  if (Object.hasOwn(state, 'explored')) assert.equal(state.explored, http.explored);
  decodeSnapshotFog(http, team);
  client.socket.onmessage({ data: raw });
  assert.deepEqual(decoded.explored, http.explored);
  assert(!Object.hasOwn(decoded, 'exploredAdded'));
  return state;
}

const first = snapshot();
await connected;
assert.equal(typeof first.explored, 'string');
assert(!Object.hasOwn(first, 'exploredAdded'));
const initialExplored = decoded.explored;

grid.fill(1, 100, 103);
grid[grid.length - 1] = 1;
const discovery = snapshot();
assert(!Object.hasOwn(discovery, 'explored'));
assert.equal(typeof discovery.exploredAdded, 'string');
assert.equal(initialExplored[team][100], 0);

grid[0] = 1;
const single = snapshot();
assert(!Object.hasOwn(single, 'explored'));
assert.deepEqual(single.exploredAdded, [[0, 1]]);

const unchanged = snapshot();
assert(!Object.hasOwn(unchanged, 'explored'));
assert(!Object.hasOwn(unchanged, 'exploredAdded'));

grid[0] = 0;
grid[500] = 1;
const reset = snapshot();
assert.equal(typeof reset.explored, 'string');
assert(!Object.hasOwn(reset, 'exploredAdded'));

const disconnectedSocket = client.socket;
disconnectedSocket.onclose();
client.retry();
assert.notEqual(client.socket, disconnectedSocket);
client.socket.onmessage({ data: session });
serverSocket = new Socket();
const reconnected = snapshot();
assert.equal(typeof reconnected.explored, 'string');
assert(!Object.hasOwn(reconnected, 'exploredAdded'));

console.log('Brouillard exploré : deltas, grille complète après régression et reconnexion.');
