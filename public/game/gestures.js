// Pure input recognizer: coordinates and inertia are expressed in CSS pixels.
export function createGestures() {
  const pointers = new Map();
  let start = null;
  let mode = null;
  let multi = false;
  let selectionMode = false;
  let velocity = { x: 0, y: 0 };
  let remaining = 0;

  function pair() {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(b.x - a.x, b.y - a.y) };
  }

  function reset() {
    pointers.clear();
    start = null;
    mode = null;
    multi = false;
    remaining = 0;
    velocity = { x: 0, y: 0 };
  }

  function hold(time) {
    if (!start || multi || mode) return null;
    const progress = Math.max(0, Math.min(1, (time - start.time) / 300));
    if (progress === 1) mode = 'select-box';
    return { kind: 'hold', x: start.x, y: start.y, progress, ready: progress === 1 };
  }

  function tick(time, dt = 0) {
    if (start) return hold(time);
    if (remaining < 0.000001) return null;
    const elapsed = Math.min(Math.max(dt, 0), remaining, 0.05);
    remaining -= elapsed;
    const decay = Math.exp(-12 * elapsed);
    const dx = velocity.x * (1 - decay) / 12;
    const dy = velocity.y * (1 - decay) / 12;
    velocity.x *= decay;
    velocity.y *= decay;
    return { kind: 'camera', from: { x: 0, y: 0, distance: 0 }, to: { x: dx, y: dy, distance: 0 } };
  }

  function update(event) {
    const { type, id, x, y, time = 0, pointerType = 'mouse' } = event;
    if (type === 'down') {
      if (pointers.has(id)) return null;
      remaining = 0;
      pointers.set(id, { x, y, time });
      if (pointers.size === 1 && !multi) {
        start = { x, y, time, pointerType };
        mode = selectionMode ? 'select-box' : null;
      }
      if (pointers.size > 1) {
        multi = true;
        return { kind: 'camera', from: pair(), to: pair() };
      }
      return null;
    }
    if (!pointers.has(id)) return null;
    if (type === 'cancel') {
      multi = true;
      pointers.delete(id);
      if (!pointers.size) reset();
      return { kind: 'camera' };
    }
    const previous = pointers.get(id);
    const before = pointers.size >= 2 ? pair() : null;
    pointers.set(id, { x, y, time });
    let action = null;
    if (multi) {
      if (before && type === 'move') action = { kind: 'camera', from: before, to: pair() };
    } else {
      const distance = Math.hypot(x - start.x, y - start.y);
      const threshold = start.pointerType === 'touch' ? 14 : 8;
      hold(time);
      if (!mode && distance >= threshold) mode = 'camera';
      const quickTap = start.pointerType === 'touch' && time - start.time < 250 && distance < 24;
      if (type === 'up' && (quickTap || (!mode && distance < threshold) || (mode === 'select-box' && distance < threshold))) {
        action = { kind: 'tap', x, y, duration: time - start.time };
      } else if (mode === 'select-box') {
        action = { kind: 'select-box', start: { x: start.x, y: start.y }, end: { x, y }, final: type === 'up' };
      } else if (mode === 'camera') {
        action = { kind: 'camera', from: { ...previous, distance: 0 }, to: { x, y, distance: 0 } };
        if (type === 'move') {
          const elapsed = Math.max(16, time - previous.time) / 1000;
          const speed = Math.hypot(x - previous.x, y - previous.y) / elapsed;
          const factor = Math.min(1, 1200 / (speed || 1)) / elapsed;
          velocity = { x: (x - previous.x) * factor, y: (y - previous.y) * factor };
        }
      }
    }
    if (type === 'up') {
      const coast = !multi && mode === 'camera' && action?.kind === 'camera' && time - previous.time < 80;
      const releaseVelocity = velocity;
      pointers.delete(id);
      if (!pointers.size) {
        reset();
        if (coast) {
          velocity = releaseVelocity;
          remaining = 0.3;
        }
      }
    }
    return action;
  }

  return {
    update,
    reset,
    tick,
    setSelectionMode(value) {
      reset();
      selectionMode = Boolean(value);
    },
  };
}
