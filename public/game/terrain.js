// Reassemble the existing Terres Brûlées artwork; collision comes from sim.js.
// The same raster is used by the battlefield and the minimap.
export function createSkirmishTerrain(atlas, sim) {
  const canvas = document.createElement('canvas');
  canvas.width = sim.W;
  canvas.height = sim.H;
  const context = canvas.getContext('2d');
  context.fillStyle = '#17251f';
  context.fillRect(0, 0, sim.W, sim.H);
  // Existing bare earth, tiled without stretching the buildings or trees.
  for (let y = 0; y < sim.H; y += 60) {
    for (let x = 0; x < sim.W; x += 100) {
      context.drawImage(atlas, 870, 560, 100, 60, x, y, 100, 60);
    }
  }
  // Forest walls follow the walk grid exactly, including the narrow passes.
  for (let row = 0; row < sim.ROWS; row++) {
    for (let column = 0; column < sim.COLS; column++) {
      if (sim.walk[row * sim.COLS + column]) continue;
      const x = column * sim.CELL;
      const y = row * sim.CELL;
      context.fillStyle = '#15291e';
      context.fillRect(x, y, sim.CELL, sim.CELL);
      context.save();
      context.beginPath();
      context.rect(x, y, sim.CELL, sim.CELL);
      context.clip();
      const tileX = Math.floor(column / 3) * 60;
      const tileY = Math.floor(row / 4) * 80;
      context.drawImage(atlas, 966, 262, 65, 75, tileX, tileY, 60, 80);
      context.restore();
    }
  }
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
