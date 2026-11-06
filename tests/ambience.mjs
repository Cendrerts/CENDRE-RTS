import assert from 'node:assert/strict';
import {
  ambienceVolume,
  createSeamlessBuffer,
  CuistotsAmbience,
} from '../public/game/cuistots-ambience.js';
const base = { x: 100, y: 100 };
assert.equal(ambienceVolume(base, base), 0.35);
assert.equal(ambienceVolume({ x: 250, y: 100 }, base), 0.35);
assert.equal(ambienceVolume({ x: 775, y: 100 }, base), 0.175);
assert.equal(ambienceVolume({ x: 1300, y: 100 }, base), 0);
assert.equal(ambienceVolume({ x: 2000, y: 100 }, base), 0);
let starts = 0,
  stops = 0,
  ramps = [];
const buffer = (channels, length, rate) => {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return { numberOfChannels: channels, length, sampleRate: rate, getChannelData: (i) => data[i] };
};
const input = buffer(2, 1000, 1000);
input.getChannelData(0).fill(0.5);
input.getChannelData(1).fill(-0.2);
const context = {
  destination: {},
  currentTime: 0,
  state: 'running',
  resume: async () => {},
  createBuffer: buffer,
  decodeAudioData: async () => input,
  createGain: () => ({
    gain: {
      value: 0,
      cancelAndHoldAtTime() {},
      linearRampToValueAtTime(v) {
        ramps.push(v);
      },
    },
    connect() {},
    disconnect() {},
  }),
  createBufferSource: () => ({
    connect() {},
    disconnect() {},
    start() {
      starts++;
    },
    stop() {
      stops++;
    },
  }),
};
const loop = createSeamlessBuffer(context, input);
assert.equal(loop.length, 900);
assert.equal(loop.numberOfChannels, 2);
assert.ok([...loop.getChannelData(0)].every((v) => v === 0.5));
let release;
globalThis.fetch = () =>
  new Promise(
    (resolve) =>
      (release = () => resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })),
  );
const a = new CuistotsAmbience({ context, basePosition: base });
a.updateCamera(base);
a.updateCamera(base);
assert.deepEqual(ramps, [0.35]);
a.updateCamera(base, false);
assert.equal(ramps.at(-1), 0);
const first = a.start();
assert.equal(a.start(), first);
release();
await first;
await a.start();
assert.equal(starts, 1);
assert.equal(a.source.loop, true);
a.dispose();
a.dispose();
assert.equal(stops, 1);
const b = new CuistotsAmbience({ context, basePosition: base });
const pending = b.start();
b.dispose();
release();
await pending;
assert.equal(starts, 1);
console.log(
  'PASS: attenuation, silence, crossfade, single loop, shared context lifecycle and disposal during load.',
);
