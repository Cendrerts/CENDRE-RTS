// Presentation only: feedback never changes the authoritative simulation.
export function orderFeedback(action) {
  switch (action.kind) {
    case 'move':
      return { shape: 'circle', color: '#65e88b', duration: 0.4 };
    case 'patrol':
    case 'attackMove':
      return { shape: 'chevron', color: '#ffa347', duration: 0.4 };
    case 'attack':
      return { shape: 'flash', color: '#ff354f', duration: 0.4 };
    case 'gather':
      return { shape: 'ruby', color: '#ed3260', duration: 0.4 };
    default:
      return null;
  }
}

export function drawOrderFeedback(ctx, marker, elapsed, scale = 1) {
  if (elapsed < 0 || elapsed >= marker.duration) return;
  const progress = elapsed / marker.duration;
  if (marker.shape === 'flash' && Math.floor(progress * 4) % 2 === 1) return;
  ctx.save();
  ctx.translate(marker.x, marker.y);
  ctx.strokeStyle = marker.color;
  ctx.fillStyle = marker.color;
  ctx.lineWidth = 2 / scale;
  ctx.beginPath();
  if (marker.shape === 'ruby') {
    const radius = (8 + 4 * Math.sin(progress * Math.PI * 2)) / scale;
    ctx.moveTo(0, -radius);
    ctx.lineTo(radius * 0.7, 0);
    ctx.lineTo(0, radius);
    ctx.lineTo(-radius * 0.7, 0);
    ctx.closePath();
    ctx.fill();
  } else if (marker.shape === 'flash') {
    ctx.globalAlpha = 0.65;
    ctx.ellipse(0, marker.base ? -30 : -12, marker.base ? 65 : 18, marker.base ? 65 : 28, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const radius = (24 * (1 - progress) + 4) / scale;
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    if (marker.shape === 'chevron') {
      ctx.beginPath();
      ctx.moveTo(-6 / scale, -3 / scale);
      ctx.lineTo(0, 4 / scale);
      ctx.lineTo(6 / scale, -3 / scale);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function vibrateOrder(enabled, device = globalThis.navigator) {
  if (!enabled) return;
  try {
    device?.vibrate?.(8);
  } catch {
    // Some browsers expose the API but disallow vibration in this context.
  }
}
