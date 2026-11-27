// Raster resources are owned by the renderer, never by the shared simulation.
export function createRenderCache(createCanvas) {
  const terrain = createCanvas();
  let terrainKey = '';
  let spriteScale = null;
  const sprites = new Map();
  let fogPixels = null;
  return {
    terrain(image, width, height, ox, oy, scale, worldWidth, worldHeight) {
      const readyWidth = image.complete ? image.naturalWidth : 0;
      const key = [width, height, ox, oy, scale, image.src, readyWidth].join(':');
      if (key !== terrainKey) {
        terrain.width = width;
        terrain.height = height;
        const context = terrain.getContext('2d');
        context.fillStyle = '#080e14';
        context.fillRect(0, 0, width, height);
        context.translate(ox, oy);
        context.scale(scale, scale);
        if (readyWidth) {
          context.drawImage(image, 0, 0, worldWidth, worldHeight);
        } else {
          context.fillStyle = '#514535';
          context.fillRect(0, 0, worldWidth, worldHeight);
        }
        terrainKey = key;
      }
      return terrain;
    },
    sprite(image, type, team, scale, width, height) {
      if (!image?.complete || !image.naturalWidth) return null;
      if (spriteScale !== scale) {
        sprites.clear();
        spriteScale = scale;
      }
      const key = `${team}:${type}`;
      if (!sprites.has(key)) {
        const sprite = createCanvas();
        sprite.width = Math.max(1, Math.ceil(width * scale));
        sprite.height = Math.max(1, Math.ceil(height * scale));
        sprite.getContext('2d').drawImage(image, 0, 0, sprite.width, sprite.height);
        sprites.set(key, sprite);
      }
      return sprites.get(key);
    },
    updateFog(context, visible, explored, columns) {
      if (!fogPixels || fogPixels.length !== visible.length) fogPixels = new Uint8Array(visible.length).fill(255);
      let changed = false;
      for (let index = 0; index < visible.length; index++) {
        const value = visible[index] ? 0 : explored[index] ? 1 : 2;
        if (fogPixels[index] === value) continue;
        fogPixels[index] = value;
        const x = index % columns;
        const y = Math.floor(index / columns);
        context.clearRect(x, y, 1, 1);
        if (value) {
          context.fillStyle = value === 1 ? 'rgba(5,12,18,.67)' : '#080e14';
          context.fillRect(x, y, 1, 1);
        }
        changed = true;
      }
      return changed;
    },
  };
}

export function prepareDrawList(state, player, canSee) {
  return state.units.filter((unit) => canSee(state, player, unit)).sort((a, b) => a.y - b.y);
}
