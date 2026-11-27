const ZONE_AXIS_X = 0.58;
const ZONE_AXIS_Y = 0.42;
const TILE_SIZE = 256;
const TILE_STEP = 200;
const GROUND = ['sol-terre', 'sol-cendres', 'sol-braises', 'sol-mousse', 'sol-paves'];
const HEDGES = ['haie-1', 'haie-2', 'haie-3'];
const ROCKS = ['rocher-1', 'rocher-2', 'rocher-3'];
const PONDS = ['mare-1', 'mare-2'];

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

function cellHash(row, column) {
  const seed = Math.imul(row + 1, 0x9e3779b1) ^ Math.imul(column + 1, 0x85ebca6b);
  const hash = Math.imul(seed ^ (seed >>> 16), 0x7feb352d);
  return (hash ^ (hash >>> 15)) >>> 0;
}

function isRotatedHalf(row, column, rows, columns) {
  return row * columns + column > (rows * columns - 1) / 2;
}

function symmetricHash(row, column, rows, columns) {
  return isRotatedHalf(row, column, rows, columns)
    ? cellHash(rows - 1 - row, columns - 1 - column)
    : cellHash(row, column);
}

export function groundRotation(row, column, rows, columns) {
  const turns = symmetricHash(row, column, rows, columns) & 3;
  return (turns + (isRotatedHalf(row, column, rows, columns) ? 2 : 0)) % 4;
}

export function obstacleVariant(row, column, rows, columns, variants) {
  return (symmetricHash(row, column, rows, columns) >>> 1) % variants;
}

export function hedgeOffset(row, column) {
  const variation = cellHash(row, column);
  return {
    // Cubic control points yield an outward bulge of at most 8 world pixels.
    depth: 6 + (variation & 255) / 255 * 3.2,
    shift: (((variation >>> 8) & 255) / 255 - 0.5) * 5,
  };
}

function zoneMask(context, width, height, zone) {
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
    gradient.addColorStop(position, `rgba(0, 0, 0, ${weights[zone]})`);
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function traceBlockedGround(context, sim, isWalkable) {
  const size = sim.CELL;
  const corners = [[0, 0], [size, 0], [size, size], [0, size]];
  const normals = [[0, -1], [1, 0], [0, 1], [-1, 0]];
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

      const rotated = isRotatedHalf(row, column, sim.ROWS, sim.COLS);
      const { depth, shift } = rotated
        ? hedgeOffset(sim.ROWS - 1 - row, sim.COLS - 1 - column)
        : hedgeOffset(row, column);
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
}

function raster(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext('2d');
}

function featheredTile(image, turns) {
  const context = raster(TILE_SIZE, TILE_SIZE);
  context.save();
  context.translate(TILE_SIZE / 2, TILE_SIZE / 2);
  context.rotate(turns * Math.PI / 2);
  context.drawImage(image, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
  context.restore();

  // Complementary ramps add to one where adjacent rotated tiles overlap.
  const overlap = (TILE_SIZE - TILE_STEP) / TILE_SIZE;
  context.globalCompositeOperation = 'destination-in';
  for (const [x, y] of [[TILE_SIZE, 0], [0, TILE_SIZE]]) {
    const mask = context.createLinearGradient(0, 0, x, y);
    mask.addColorStop(0, 'transparent');
    mask.addColorStop(overlap, 'black');
    mask.addColorStop(1 - overlap, 'black');
    mask.addColorStop(1, 'transparent');
    context.fillStyle = mask;
    context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  }
  return context.canvas;
}

function paintTiles(context, image) {
  const { width, height } = context.canvas;
  const columns = Math.ceil(width / TILE_STEP) + 2;
  const rows = Math.ceil(height / TILE_STEP) + 2;
  const left = (width - (columns - 1) * TILE_STEP - TILE_SIZE) / 2;
  const top = (height - (rows - 1) * TILE_STEP - TILE_SIZE) / 2;
  const tiles = [0, 1, 2, 3].map((turns) => featheredTile(image, turns));

  context.save();
  context.globalCompositeOperation = 'lighter';
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const turns = groundRotation(row, column, rows, columns);
      context.drawImage(tiles[turns], left + column * TILE_STEP, top + row * TILE_STEP);
    }
  }
  context.restore();
}

function paintPavingMask(context, sim) {
  // The shared map data supplies the base centers and the narrow connectors.
  context.fillStyle = 'black';
  context.strokeStyle = 'black';
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.filter = 'blur(14px)';
  const mainLane = sim.lanes[0].points;
  const baseApproaches = [mainLane.slice(0, 2), mainLane.slice(-2)];
  for (const [[x, y], [endX, endY]] of baseApproaches) {
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(endX, endY);
    context.lineWidth = 104;
    context.stroke();
  }
  for (const [x, y] of [mainLane[0], mainLane.at(-1)]) {
    context.beginPath();
    context.ellipse(x, y, 214, 164, 0, 0, Math.PI * 2);
    context.fill();
  }
  for (const passage of sim.passages) {
    context.beginPath();
    const [[x, y], ...points] = passage.points;
    context.moveTo(x, y);
    for (const [nextX, nextY] of points) {
      context.lineTo(nextX, nextY);
    }
    context.lineWidth = passage.width * 0.72;
    context.stroke();
  }
  context.filter = 'none';
}

function drawObstacle(context, variants, assets, sim, row, column, x, y, width, height = null) {
  const variant = obstacleVariant(row, column, sim.ROWS, sim.COLS, variants.length);
  const image = assets[variants[variant]];
  const spriteHeight = height ?? width * image.naturalHeight / image.naturalWidth;
  context.drawImage(image, x - width / 2, y - spriteHeight / 2, width, spriteHeight);
}

function paintObstacles(context, earth, assets, sim) {
  const { ROWS, COLS, CELL, walk } = sim;
  const isWalkable = (row, column) =>
    row >= 0 && row < ROWS && column >= 0 && column < COLS && walk[row * COLS + column] === 1;

  context.save();
  traceBlockedGround(context, sim, isWalkable);
  context.clip();
  context.drawImage(earth, 0, 0);
  context.fillStyle = 'rgba(26, 20, 11, 0.36)';
  context.fillRect(0, 0, sim.W, sim.H);

  const sides = [[-1, 0], [0, -1], [0, 1], [1, 0]];
  const corners = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const ponds = [];
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLS; column++) {
      if (isWalkable(row, column)) continue;
      const x = (column + 0.5) * CELL;
      const y = (row + 0.5) * CELL;
      const openSides = sides.filter(([dy, dx]) => isWalkable(row + dy, column + dx)).length;
      const openCorners = corners.filter(([dy, dx]) => isWalkable(row + dy, column + dx)).length;
      const openings = openSides + openCorners;
      if (openings >= 7 || (openSides === 4 && openCorners >= 2)) {
        ponds.push({ row, column, x, y });
        continue;
      }

      const rotated = isRotatedHalf(row, column, ROWS, COLS);
      const anchorRow = rotated ? ROWS - 1 - row : row;
      const anchorColumn = rotated ? COLS - 1 - column : column;
      const hash = symmetricHash(row, column, ROWS, COLS);
      if (openings === 0 && (anchorRow % 3 !== 1 || anchorColumn % 3 !== 1)) continue;
      if (openings > 0 && openings < 5 && hash % 5 >= 2) continue;

      const borderDistance = Math.min(x, y, sim.W - x, sim.H - y);
      const variants = borderDistance < 100 + (hash % 90) ? ROCKS : HEDGES;
      const width = openings >= 5 ? 48 : 76 + (hash % 30);
      const direction = rotated ? -1 : 1;
      const shiftX = direction * (((hash >>> 8) % 23) - 11);
      const shiftY = direction * (((hash >>> 16) % 23) - 11);
      drawObstacle(context, variants, assets, sim, row, column, x + shiftX, y + shiftY, width);
    }
  }
  context.restore();

  for (const { row, column, x, y } of ponds) {
    drawObstacle(context, PONDS, assets, sim, row, column, x, y, CELL + 14);
  }

  // Concealing groves are painted over walkable ground.
  for (const { x, y, rx, ry } of sim.groves) {
    for (const offset of [-0.48, 0, 0.48]) {
      const spriteX = x + rx * offset;
      const row = x < sim.W / 2 ? Math.floor(y / CELL) : ROWS - 1 - Math.floor((sim.H - y) / CELL);
      const column = Math.floor(spriteX / CELL);
      drawObstacle(context, HEDGES, assets, sim, row, column, spriteX, y, rx * 1.05, ry * 1.35);
    }
  }
}

function createSkirmishTerrain(assets, sim) {
  const { W, H } = sim;
  const ground = raster(W, H);
  const earth = raster(W, H);
  const layer = raster(W, H);
  const pavingMask = raster(W / 2, H / 2);
  pavingMask.scale(0.5, 0.5);
  paintPavingMask(pavingMask, sim);
  paintTiles(earth, assets['sol-terre']);
  ground.drawImage(earth.canvas, 0, 0);
  paintTiles(layer, assets['sol-cendres']);
  ground.drawImage(layer.canvas, 0, 0);

  const overlays = [['sol-braises', 1], ['sol-mousse', 2], ['sol-paves', null]];
  for (const [texture, zone] of overlays) {
    layer.clearRect(0, 0, W, H);
    paintTiles(layer, assets[texture]);
    layer.globalCompositeOperation = 'destination-in';
    if (zone === null) {
      layer.drawImage(pavingMask.canvas, 0, 0, W, H);
    } else {
      zoneMask(layer, W, H, zone);
    }
    layer.globalCompositeOperation = 'source-over';
    ground.drawImage(layer.canvas, 0, 0);
  }

  paintObstacles(ground, earth.canvas, assets, sim);
  for (const scratch of [earth, layer, pavingMask]) {
    scratch.canvas.width = 0;
  }
  return ground.canvas;
}

// The battlefield and minimap share one raster; collision comes from sim.js.
export async function loadSkirmishTerrain(sim, terrain) {
  const entries = await Promise.all([...GROUND, ...HEDGES, ...ROCKS, ...PONDS].map(async (name) => {
    const image = new Image();
    image.src = new URL(`./assets/tuiles/${name}.png`, import.meta.url).href;
    await image.decode();
    return [name, image];
  }));
  const canvas = createSkirmishTerrain(Object.fromEntries(entries), sim);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve));
  canvas.width = 0;
  if (!blob) throw new Error('Impossible de générer la texture du terrain.');
  const url = URL.createObjectURL(blob);
  try {
    terrain.src = url;
    await terrain.decode();
  } finally {
    URL.revokeObjectURL(url);
  }
}
