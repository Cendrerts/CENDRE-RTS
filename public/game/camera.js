const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function minimapToWorld(x, y, width, height, worldWidth, worldHeight) {
  return {
    x: clamp(x / width, 0, 1) * worldWidth,
    y: clamp(y / height, 0, 1) * worldHeight,
  };
}

export function clampCamera(x, y, width, height, scale, worldWidth, worldHeight) {
  const marginX = width / scale / 4;
  const marginY = height / scale / 4;
  return {
    x: clamp(x, marginX, worldWidth - marginX),
    y: clamp(y, marginY, worldHeight - marginY),
  };
}

export function attackDirection(point, camera, width, height, scale, inset = 24) {
  const dx = (point.x - camera.x) * scale;
  const dy = (point.y - camera.y) * scale;
  if (Math.abs(dx) <= width / 2 && Math.abs(dy) <= height / 2) return null;
  const ratio = Math.min((width / 2 - inset) / Math.abs(dx), (height / 2 - inset) / Math.abs(dy));
  return { x: width / 2 + dx * ratio, y: height / 2 + dy * ratio, angle: Math.atan2(dy, dx) };
}

// Fixed world zones keep the cooldown independent of camera movement and zoom.
export function groupAttackAlerts(alerts, point, time, zoneSize = 240) {
  const recent = alerts.filter((alert) => time - alert.time < 5);
  const zone = `${Math.floor(point.x / zoneSize)},${Math.floor(point.y / zoneSize)}`;
  if (recent.some((alert) => alert.zone === zone)) return recent;
  return [...recent, { x: point.x, y: point.y, time, zone }];
}
