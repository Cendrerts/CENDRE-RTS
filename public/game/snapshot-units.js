// Snapshot defaults for freshly spawned units before any automatic orders.
export const SNAPSHOT_UNIT_DEFAULTS = Object.freeze({
  path: Object.freeze([]),
  orderQueue: Object.freeze([]),
  harvest: null,
  cargo: 0,
  hold: false,
});

const defaults = Object.entries(SNAPSHOT_UNIT_DEFAULTS);

export function omitSnapshotUnitDefaults(unit) {
  for (const [field, fallback] of defaults) {
    const value = unit[field];
    if (value === fallback || (Array.isArray(fallback) && Array.isArray(value) && value.length === 0)) {
      delete unit[field];
    }
  }
  return unit;
}

export function decodeSnapshotUnits(state) {
  for (const unit of state.units ?? []) {
    for (const [field, fallback] of defaults) {
      if (!Object.hasOwn(unit, field)) {
        unit[field] = Array.isArray(fallback) ? [] : fallback;
      }
    }
  }
}
