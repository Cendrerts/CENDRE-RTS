import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, SETTINGS_KEY, normalizeSettings, readSettings, writeSettings } from '../public/game/settings.js';

const entries = new Map();
const storage = {
  getItem: (key) => entries.get(key) ?? null,
  setItem: (key, value) => entries.set(key, value),
};
const getStorage = () => storage;
assert.deepEqual(readSettings(getStorage), DEFAULT_SETTINGS);
const custom = { vibration: false, joystick: true, voiceVolume: 0.25, ambienceVolume: 0, interfaceSize: 'large' };
assert.deepEqual(writeSettings(custom, getStorage), custom);
assert.deepEqual(JSON.parse(entries.get(SETTINGS_KEY)), custom);
assert.deepEqual(readSettings(getStorage), custom);
entries.set(SETTINGS_KEY, '{broken');
assert.deepEqual(readSettings(getStorage), DEFAULT_SETTINGS);
entries.set(SETTINGS_KEY, 'null');
assert.deepEqual(readSettings(getStorage), DEFAULT_SETTINGS);
assert.deepEqual(normalizeSettings({ vibration: 'false', joystick: 1, voiceVolume: Infinity, ambienceVolume: '0', interfaceSize: 'huge' }), DEFAULT_SETTINGS);
assert.equal(normalizeSettings({ voiceVolume: -1 }).voiceVolume, 0);
assert.equal(normalizeSettings({ ambienceVolume: 3 }).ambienceVolume, 1);
const unavailable = () => { throw new Error('Storage blocked'); };
assert.deepEqual(readSettings(unavailable), DEFAULT_SETTINGS);
assert.deepEqual(writeSettings(custom, unavailable), custom);
assert.deepEqual(readSettings(() => undefined), DEFAULT_SETTINGS);
assert.deepEqual(writeSettings(custom, () => undefined), custom);
const blockedStorage = () => ({ getItem() { throw new Error('Blocked read'); }, setItem() { throw new Error('Quota'); } });
assert.deepEqual(readSettings(blockedStorage), DEFAULT_SETTINGS);
assert.deepEqual(writeSettings(custom, blockedStorage), custom);
entries.delete(SETTINGS_KEY);
entries.set('cendre-haptics', 'off');
assert.equal(readSettings(getStorage).vibration, false);
assert.notEqual(readSettings(unavailable), DEFAULT_SETTINGS);
console.log('settings: OK');
