// Pure input recognizer: coordinates are CSS pixels, independent of the camera.
export function createGestures() {
  const pointers = new Map();
  let start = null;
  let selecting = false;
  let multi = false;

  function pair() {
    const [a, b] = [...pointers.values()];
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      distance: Math.hypot(b.x - a.x, b.y - a.y),
    };
  }

  function reset() {
    pointers.clear();
    start = null;
    selecting = false;
    multi = false;
  }

  function update(event) {
    const { type, id, x, y, time = 0, pointerType = 'mouse' } = event;
    if (type === 'down') {
      if (pointers.has(id)) return null;
      pointers.set(id, { x, y });
      if (pointers.size === 1 && !multi) start = { x, y, time, pointerType };
      if (pointers.size > 1) {
        multi = true;
        return { kind: 'camera', from: pair(), to: pair() };
      }
      return null;
    }
    if (!pointers.has(id)) return null;
    if (type === 'cancel') {
      // Keep the other fingers quarantined until they too leave the surface.
      multi = true;
      pointers.delete(id);
      if (!pointers.size) reset();
      return { kind: 'camera' };
    }
    const before = pointers.size >= 2 ? pair() : null;
    pointers.set(id, { x, y });
    let action = null;
    if (multi) {
      if (before && type === 'move') action = { kind: 'camera', from: before, to: pair() };
    } else {
      const distance = Math.hypot(x - start.x, y - start.y);
      const threshold = start.pointerType === 'touch' ? 14 : 8;
      const quickTouchTap = start.pointerType === 'touch' && time - start.time < 250 && distance < 24;
      if (distance >= threshold) selecting = true;
      if (type === 'up' && quickTouchTap) {
        action = { kind: 'tap', x, y, duration: time - start.time };
      } else if (selecting) {
        action = { kind: 'select-box', start: { x: start.x, y: start.y }, end: { x, y }, final: type === 'up' };
      } else if (type === 'up') {
        action = { kind: 'tap', x, y, duration: time - start.time };
      }
    }
    if (type === 'up') {
      pointers.delete(id);
      if (!pointers.size) reset();
    }
    return action;
  }

  return { update, reset };
}
