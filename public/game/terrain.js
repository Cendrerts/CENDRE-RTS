const ZONE_AXIS_X = 0.58;
const ZONE_AXIS_Y = 0.42;
const ZONE_COLORS = [
  [65, 90, 120], // Cendres
  [117, 73, 68], // Braises
  [64, 88, 62], // Marécage
];

function smoothstep(start, end, value) {
  const position = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return position * position * (3 - 2 * position);
}

export function terrainZone(x, y, width, height) {
  // Fold the diagonal gradient at the center so every region has a rotated counterpart.
  const projection = (x - width / 2) * (ZONE_AXIS_X / width) + (y - height / 2) * (ZONE_AXIS_Y / height);
  const distance = Math.round(Math.abs(projection) * 1e9) / 1e9;
  const braises = 1 - smoothstep(0.075, 0.145, distance);
  const marecage = smoothstep(0.26, 0.34, distance);
  return [1 - braises - marecage, braises, marecage];
}

export function hedgeOffset(row, column) {
  const seed = Math.imul(row + 1, 0x9e3779b1) ^ Math.imul(column + 1, 0x85ebca6b);
  const hash = Math.imul(seed ^ (seed >>> 16), 0x7feb352d);
  const variation = (hash ^ (hash >>> 15)) >>> 0;
  return {
    // Cubic control points yield an outward bulge of at most 8 world pixels.
    depth: 6 + (variation & 255) / 255 * 3.2,
    shift: (((variation >>> 8) & 255) / 255 - 0.5) * 5,
  };
}

function tintGround(context, width, height) {
  const axisX = ZONE_AXIS_X / width;
  const axisY = ZONE_AXIS_Y / height;
  const halfLength = 0.5 / (axisX * axisX + axisY * axisY);
  const deltaX = axisX * halfLength;
  const deltaY = axisY * halfLength;
  const gradient = context.createLinearGradient(
    width / 2 - deltaX, height / 2 - deltaY,
    width / 2 + deltaX, height / 2 + deltaY,
  );

  for (let stop = 0; stop <= 100; stop++) {
    const position = stop / 100;
    const x = width / 2 + (2 * position - 1) * deltaX;
    const y = height / 2 + (2 * position - 1) * deltaY;
    const weights = terrainZone(x, y, width, height);
    const color = ZONE_COLORS[0].map((_, channel) =>
      ZONE_COLORS.reduce((sum, zone, index) => sum + zone[channel] * weights[index], 0),
    );
    gradient.addColorStop(position, `rgba(${color.join(', ')}, 0.65)`);
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function paintHedges(context, atlas, sim) {
  const tile = document.createElement('canvas');
  tile.width = 60;
  tile.height = 80;
  const tileContext = tile.getContext('2d');
  tileContext.fillStyle = '#15291e';
  tileContext.fillRect(0, 0, tile.width, tile.height);
  tileContext.drawImage(atlas, 966, 262, 65, 75, 0, 0, tile.width, tile.height);

  const size = sim.CELL;
  const corners = [[0, 0], [size, 0], [size, size], [0, size]];
  const normals = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const isWalkable = (row, column) =>
    row >= 0 && row < sim.ROWS && column >= 0 && column < sim.COLS &&
    sim.walk[row * sim.COLS + column];

  context.beginPath();
  for (let row = 0; row < sim.ROWS; row++) {
    for (let column = 0; column < sim.COLS; column++) {
      if (isWalkable(row, column)) continue;
      const x = column * size;
      const y = row * size;
      const exposed = normals.map(([dx, dy]) => isWalkable(row + dy, column + dx));
      if (!exposed.some(Boolean)) {
        context.rect(x, y, size, size);
        continue;
      }

      const { depth, shift } = hedgeOffset(row, column);
      for (let side = 0; side < corners.length; side++) {
        const previous = (side + 3) % 4;
        const next = (side + 1) % 4;
        const [cornerX, cornerY] = corners[side];
        const [endX, endY] = corners[next];
        const [normalX, normalY] = normals[side];
        const [tangentX, tangentY] = normals[next];
        const roundStart = exposed[side] && exposed[previous] ? 7 : 0;
        const roundEnd = exposed[side] && exposed[next] ? 7 : 0;
        // Neighboring exposed edges share the same outward endpoint at the grid seam.
        const startOverhang = exposed[side] && !exposed[previous] &&
          isWalkable(row + normalY - tangentY, column + normalX - tangentX) ? 4 : 0;
        const endOverhang = exposed[side] && !exposed[next] &&
          isWalkable(row + normalY + tangentY, column + normalX + tangentX) ? 4 : 0;
        const startX = x + cornerX + tangentX * roundStart + normalX * startOverhang;
        const startY = y + cornerY + tangentY * roundStart + normalY * startOverhang;
        const finishX = x + endX - tangentX * roundEnd + normalX * endOverhang;
        const finishY = y + endY - tangentY * roundEnd + normalY * endOverhang;

        if (side === 0) {
          context.moveTo(startX, startY);
        } else if (roundStart) {
          context.quadraticCurveTo(x + cornerX, y + cornerY, startX, startY);
        } else {
          context.lineTo(startX, startY);
        }
        if (exposed[side]) {
          context.bezierCurveTo(
            x + cornerX + tangentX * (size * 0.27 + shift) + normalX * depth,
            y + cornerY + tangentY * (size * 0.27 + shift) + normalY * depth,
            x + endX - tangentX * (size * 0.27 - shift) + normalX * depth,
            y + endY - tangentY * (size * 0.27 - shift) + normalY * depth,
            finishX, finishY,
          );
        } else {
          context.lineTo(finishX, finishY);
        }
        if (side === 3 && roundEnd) {
          context.quadraticCurveTo(x, y, x + roundEnd, y);
        }
      }
      context.closePath();
    }
  }
  context.fillStyle = context.createPattern(tile, 'repeat');
  context.fill();
}

// Reassemble the existing Terres Brûlées artwork; collision comes from sim.js.
// The same raster is used by the battlefield and the minimap.
export function createSkirmishTerrain(atlas, sim) {
  const canvas = document.createElement('canvas');
  canvas.width = sim.W;
  canvas.height = sim.H;
  const context = canvas.getContext('2d');
  context.fillStyle = '#17251f';
  context.fillRect(0, 0, sim.W, sim.H);
  for (let y = 0; y < sim.H; y += 60) {
    for (let x = 0; x < sim.W; x += 100) {
      context.drawImage(atlas, 870, 560, 100, 60, x, y, 100, 60);
    }
  }
  tintGround(context, sim.W, sim.H);
  paintHedges(context, atlas, sim);
  function patch(sx, sy, sw, sh, x, y, width, height) {
    context.save();
    context.beginPath();
    context.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2);
    context.clip();
    context.drawImage(atlas, sx, sy, sw, sh, x - width / 2, y - height / 2, width, height);
    context.restore();
  }
  patch(275, 555, 190, 180, 450, 1725, 190, 180);
  patch(1135, 72, 250, 270, 3550, 400, 250, 270);
  patch(466, 347, 100, 155, 1948, 941, 100, 155);
  for (const grove of sim.groves) {
    patch(657, 348, 250, 195, grove.x, grove.y, grove.rx * 2, grove.ry * 2);
  }
  return canvas;
}
