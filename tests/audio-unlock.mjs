import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { SharedAudio, bindAudioUnlock } from '../public/game/audio-unlock.js';
import { UnitVoices } from '../public/game/unit-voices.js';

class Events extends EventTarget {
  hidden = false;
}
let created = 0;
let resumes = 0;
let silentStarts = 0;
let inGesture = false;
let requireGesture = true;
class FakeAudioContext extends Events {
  state = 'suspended';
  destination = {};
  sampleRate = 44100;
  constructor() {
    super();
    created++;
  }
  resume() {
    if (requireGesture) assert(inGesture, 'resume must run synchronously inside the gesture');
    resumes++;
    this.state = 'running';
    return Promise.resolve();
  }
  createBuffer(channels, length, rate) {
    assert.equal(channels, 1);
    assert.equal(length, 1);
    assert.equal(rate, 44100);
    return {};
  }
  createBufferSource() {
    return {
      connect() {},
      disconnect() {},
      start() { silentStarts++; },
    };
  }
  createGain() {
    return { gain: {}, connect() {} };
  }
}
const document = new Events();
const window = new Events();
const button = new Events();
const audioSession = { type: 'auto' };
const audio = new SharedAudio({ webkitAudioContext: FakeAudioContext, navigator: { audioSession } });
bindAudioUnlock({ audio, document, window, button });
assert.equal(button.hidden, false);
window.dispatchEvent(new Event('pageshow'));
assert.equal(created, 0, 'restoring before a gesture must not create audio');
assert.equal(audioSession.type, 'auto');
for (const type of ['touchend', 'pointerup']) {
  audioSession.type = 'auto';
  inGesture = true;
  document.dispatchEvent(new Event(type));
  assert.equal(audioSession.type, 'playback');
  inGesture = false;
  await new Promise(setImmediate);
}
assert.equal(created, 1);
assert.equal(resumes, 2);
assert.equal(silentStarts, 2);
assert.equal(button.hidden, true);
requireGesture = false;
audio.context.state = 'suspended';
audio.context.dispatchEvent(new Event('statechange'));
assert.equal(button.hidden, false);
document.hidden = true;
document.dispatchEvent(new Event('visibilitychange'));
assert.equal(resumes, 2);
document.hidden = false;
document.dispatchEvent(new Event('visibilitychange'));
await new Promise(setImmediate);
assert.equal(resumes, 3);
audio.context.state = 'suspended';
window.dispatchEvent(new Event('pageshow'));
await new Promise(setImmediate);
assert.equal(resumes, 4);
audio.context.state = 'interrupted';
audio.context.dispatchEvent(new Event('statechange'));
await new Promise(setImmediate);
assert.equal(resumes, 5);
assert.equal(button.hidden, true);
requireGesture = true;
inGesture = true;
button.dispatchEvent(new Event('click'));
inGesture = false;
await new Promise(setImmediate);
assert.equal(created, 1);

const absent = new SharedAudio({});
bindAudioUnlock({ audio: absent, document: new Events(), window: new Events(), button: new Events() });
assert.equal(await absent.resume(true), false);
assert.equal(await absent.resume(), false);
const denied = new SharedAudio({ AudioContext: class extends FakeAudioContext {
  resume() { return Promise.reject(new Error('blocked')); }
} });
assert.equal(await denied.resume(true), false);

// The actual voice client obtains the same shared context as the ambience client.
globalThis.AudioContext = FakeAudioContext;
const first = new UnitVoices();
const second = new UnitVoices();
first.initialize();
second.initialize();
assert.equal(first.context, second.context);
for (const name of readdirSync(new URL('../public/game/', import.meta.url))) {
  if (!/\.(js|html|css)$/.test(name)) continue;
  assert(!/\.aiff?\b/i.test(readFileSync(new URL(`../public/game/${name}`, import.meta.url), 'utf8')), name);
}
console.log('PASS: shared audio, synchronous gestures, silent buffer, lifecycle recovery, HUD and absent API.');
