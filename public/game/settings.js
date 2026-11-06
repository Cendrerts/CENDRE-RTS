export const SETTINGS_KEY = 'cendre-settings';
export const DEFAULT_SETTINGS = Object.freeze({
  vibration: true,
  joystick: false,
  voiceVolume: 1,
  ambienceVolume: 1,
  interfaceSize: 'normal',
});

export function normalizeSettings(value) {
  const settings = { ...DEFAULT_SETTINGS };
  if (!value || typeof value !== 'object') return settings;
  for (const key of ['vibration', 'joystick']) {
    if (typeof value[key] === 'boolean') settings[key] = value[key];
  }
  for (const key of ['voiceVolume', 'ambienceVolume']) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key])) {
      settings[key] = Math.max(0, Math.min(1, value[key]));
    }
  }
  if (value.interfaceSize === 'large') settings.interfaceSize = 'large';
  return settings;
}

export function readSettings(getStorage = () => globalThis.localStorage) {
  try {
    const storage = getStorage();
    const saved = storage.getItem(SETTINGS_KEY);
    if (saved !== null) return normalizeSettings(JSON.parse(saved));
    return normalizeSettings({ vibration: storage.getItem('cendre-haptics') !== 'off' });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(value, getStorage = () => globalThis.localStorage) {
  const settings = normalizeSettings(value);
  try {
    getStorage().setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Settings remain usable for this session when storage is unavailable.
  }
  return settings;
}
