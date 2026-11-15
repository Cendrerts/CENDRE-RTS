// Instrument only the served copy: production rendering stays untouched.
export function instrumentDraw(source) {
  const start = source.indexOf('function draw() {');
  const end = source.indexOf('\nsetupPortraits();', start);
  if (start < 0 || end < 0) {
    throw new Error('Render benchmark: draw() boundaries not found');
  }
  let drawSource = source.slice(start, end);
  const boundaries = [
    ['  drawExpansionSites();', 'terrain'],
    ['  preparedUnits.forEach(unit);', 'effects'],
    ['  for (const event of state.devourEvents || []) {', 'units'],
    ['  drawFog();', 'effects'],
    ['  drawOrderQueues();', 'fog'],
  ];
  drawSource = drawSource.replace('function draw() {', `function draw() {
  benchUnitEffects = 0;
  const benchLayers = { terrain: 0, fog: 0, units: 0, effects: 0, hud: 0 };
  let benchLayerStarted = performance.now();`);
  for (const [anchor, layer] of boundaries) {
    if (drawSource.split(anchor).length !== 2) {
      throw new Error(`Render benchmark: ambiguous or missing anchor ${anchor}`);
    }
    drawSource = drawSource.replace(anchor, `  benchLayers.${layer} += performance.now() - benchLayerStarted;
  benchLayerStarted = performance.now();
${anchor}`);
  }
  const closingBrace = drawSource.lastIndexOf('\n}');
  drawSource = drawSource.slice(0, closingBrace) + `
  benchLayers.hud += performance.now() - benchLayerStarted;
  benchLayers.units -= benchUnitEffects;
  benchLayers.effects += benchUnitEffects;
  return benchLayers;` + drawSource.slice(closingBrace);
  let patchedSource = source.slice(0, start) + 'let benchUnitEffects = 0;\n' + drawSource + source.slice(end);
  // Steam and hero rings live inside unit helpers, so transfer their elapsed
  // time from the enclosing units segment to effects without double counting.
  for (const functionName of ['unit', 'drawCook']) {
    const helperStart = patchedSource.indexOf(`function ${functionName}(u) {`);
    const helperEnd = patchedSource.indexOf('\nfunction ', helperStart + 1);
    if (helperStart < 0 || helperEnd < 0) {
      throw new Error(`Render benchmark: missing helper ${functionName}`);
    }
    let helperSource = patchedSource.slice(helperStart, helperEnd);
    if (helperSource.split('    ctx.save();').length !== 2 ||
        helperSource.split('    ctx.restore();').length !== 2) {
      throw new Error(`Render benchmark: ambiguous effect in ${functionName}`);
    }
    helperSource = helperSource.replace('    ctx.save();', `    const benchEffectStarted = performance.now();
    ctx.save();`);
    helperSource = helperSource.replace('    ctx.restore();', `    ctx.restore();
    benchUnitEffects += performance.now() - benchEffectStarted;`);
    if (functionName === 'unit') {
      const steamAnchor = '  if (Sim.ragoutActive(state, u)) {';
      const steamEnd = '    }\n  }\n}';
      if (helperSource.split(steamAnchor).length !== 2 || helperSource.split(steamEnd).length !== 2) {
        throw new Error('Render benchmark: missing steam boundaries');
      }
      helperSource = helperSource.replace(steamAnchor, `${steamAnchor}
    const benchSteamStarted = performance.now();`);
      helperSource = helperSource.replace(steamEnd, `    }
    benchUnitEffects += performance.now() - benchSteamStarted;
  }
}`);
    }
    patchedSource = patchedSource.slice(0, helperStart) + helperSource + patchedSource.slice(helperEnd);
  }
  return patchedSource;
}

export function validateDrawMetrics(result) {
  const values = Object.values(result.layers ?? {});
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(result.drawMs) || result.drawMs <= 0 || values.length < 5 ||
      values.some((value) => !Number.isFinite(value) || value < 0) ||
      total < result.drawMs * 0.7 || total > result.drawMs * 1.1) {
    throw new Error('Render benchmark: invalid draw/layer measurements');
  }
}
