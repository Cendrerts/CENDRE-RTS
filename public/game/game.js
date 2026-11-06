'use strict';
import { CuistotsAmbience } from './cuistots-ambience.js';
import { UnitVoices, selectionVoice } from './unit-voices.js';
import { createRadialMenu } from './radial.js';
import { filterSelection, cameraBounds, unitsOfType, createPortraitTap, unitsInBox, boxSelection } from './selection.js';
import { createGestures } from './gestures.js';
import { resolveTap, isEmptyTap } from './tap.js';
import { installMobileDisplay } from './mobile-display.js';
import { initTouchUI } from './mobile.js';
import { createControlGroups, groupUnits, assignGroup, initControlGroups } from './control-groups.js';
import { NetworkMotion, pollDelay } from './network-motion.js';
import { ratSVG, ratSprites } from './rats.js';
import { RatsGout } from './rats-config.js';
import { cookSVG, cookSprites } from './cooks.js';
import { CendreSim as Sim } from './sim.js';
const { W, H, CELL, COLS, ROWS, TYPES, RULES } = Sim;
const canvas = document.querySelector('#field'),
  ctx = canvas.getContext('2d'),
  $ = (s) => document.querySelector(s),
  mini = $('#minimap'),
  mc = mini.getContext('2d');
const terrain = new Image();
terrain.src = 'assets/terres-brulees.png';
const fog = document.createElement('canvas');
fog.width = COLS;
fog.height = ROWS;
const fc = fog.getContext('2d');
let state = Sim.create(),
  selected = new Set(),
  player = 0,
  chosen = 0,
  running = false,
  paused = false,
  last = 0,
  toastTime = 0,
  lastUI = 0,
  zoom = 2,
  cameraX = 480,
  cameraY = 650,
  scale = 1,
  ox = 0,
  oy = 0,
  marker = null,
  attackMoveArmed = false,
  selectedMine = null,
  selectedProducer = null;
const portraitTap = createPortraitTap();
let networkGroups = createControlGroups();
let controlGroupsUI;
function controlGroups() {
  if (net) return networkGroups;
  state.controlGroups ??= createControlGroups();
  return state.controlGroups;
}
const voices = new UnitVoices();
let ambience = null;
function updateAmbience() {
  ambience?.updateCamera(
    { x: cameraX, y: cameraY },
    running && !paused && !document.hidden && state.bases[0].hp > 0,
  );
}
function unlockAmbience() {
  try {
    voices.initialize();
    ambience ??= new CuistotsAmbience({ context: voices.context, basePosition: state.bases[0] });
    updateAmbience();
    void ambience.start().catch(console.error);
  } catch (error) {
    console.error(error);
  }
}
document.addEventListener('pointerdown', unlockAmbience);
document.addEventListener('keydown', unlockAmbience);
document.addEventListener('visibilitychange', updateAmbience);
addEventListener('pagehide', () => ambience?.updateCamera({ x: cameraX, y: cameraY }, false));
function playSelectionVoice(units) {
  if (!running || paused) return;
  const voice = selectionVoice(units, player);
  if (voice) void voices.select(voice);
}
let radial = null,
  buildGhost = null;
let touchUI = null;
const gestures = createGestures();
const fieldPointers = new Set();
let selectionBox = null;
let viewWidth = canvas.clientWidth,
  viewHeight = canvas.clientHeight;
let unitNames = {};
const cookNames = {
    commis: 'Commis',
    knight: 'Gardes-Manger',
    archer: 'Bouchers-Tireurs',
    mage: 'Chefs de Brigade',
  },
  ghostNames = Object.fromEntries(Object.entries(RatsGout.unites).map(([k, v]) => [k, v.name]));
function portrait(type) {
  let body =
    type === 'mage'
      ? '<path d="M20 94L25 52 50 12 77 53 83 94Z" fill="#284b83" stroke="#c3a461" stroke-width="3"/><path d="M35 49L50 29 65 49 60 69 40 69Z" fill="#cdbda1"/><path d="M36 48L50 34 64 48 59 55 41 55Z" fill="#152735"/><path d="M42 71L50 86 59 71" fill="none" stroke="#dcbe76" stroke-width="3"/><path d="M79 94L79 31" stroke="#cba35d" stroke-width="5"/><circle cx="79" cy="28" r="7" fill="#f5d487"/>'
      : '<path d="M8 94L15 63 35 53 66 53 87 65 94 94Z" fill="#36547a"/><path d="M10 67L29 55 37 68 28 83 8 79Z M69 56L89 66 93 79 72 83 63 67Z" fill="#9fafa9" stroke="#d6b46b" stroke-width="3"/><path d="M31 33L42 18 59 18 70 35 67 63 51 75 33 62Z" fill="#aebbb5" stroke="#e0c484" stroke-width="3"/><path d="M34 39L47 43 47 52 35 48Z M54 43L67 38 66 48 54 52Z" fill="#112032"/><path d="M50 22L50 72" stroke="#dcba71" stroke-width="4"/><path d="M32 82L49 74 67 82 70 100 30 100Z" fill="#274c83" stroke="#c2a05e" stroke-width="2"/>' +
        (type === 'archer'
          ? '<path d="M13 88L84 63 M65 49L84 81" stroke="#e0bf7e" stroke-width="5"/><path d="M62 48Q89 57 85 83" fill="none" stroke="#72593c" stroke-width="5"/>'
          : '');
  return (
    '<svg viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="p-' +
    type +
    '"><stop stop-color="#4a6265"/><stop offset="1" stop-color="#101c27"/></radialGradient></defs><rect width="100" height="100" fill="url(#p-' +
    type +
    ')"/>' +
    body +
    '</svg>'
  );
}
function ghostPortrait(type) {
  return (
    '<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="#102629"/><path d="M10 99L25 44 50 7 76 44 92 99 70 87 61 100 44 87 29 100Z" fill="#253e40" stroke="#5da68e" stroke-width="2"/><path d="M32 45L50 23 67 46 61 69 38 69Z" fill="#091719"/><path d="M38 48L46 51 M55 51L63 47" stroke="#8bffd2" stroke-width="4"/><path d="M80 94L82 19" stroke="#b0a07b" stroke-width="4"/>' +
    (type === 'mage'
      ? '<circle cx="82" cy="19" r="8" fill="#6fe6c2"/>'
      : '<path d="M81 20Q56 4 27 28Q51 13 81 32" fill="#bed0c1"/>') +
    '</svg>'
  );
}
function portraitFor(type) {
  return player ? ratSVG(type) : cookSVG(type);
}
function setupPortraits() {
  voices.reset();
  portraitTap.reset();
  setupConstruction();
  unitNames = player ? ghostNames : cookNames;
  document
    .querySelectorAll('[data-select=commis],[data-unit=commis]')
    .forEach((b) => (b.hidden = false));
  document.querySelectorAll('[data-unit]').forEach((b) => {
    let t = b.dataset.unit;
    b.innerHTML =
      (unitNames[t] || 'Commis') +
      '<small>' +
      Sim.stats(t, player).cost +
      ' rubis · ' +
      Sim.stats(t, player).production +
      ' s</small>';
  });
  $('#recruitTitle').textContent = 'PRODUCTION DES UNITÉS';
  document.querySelectorAll('[data-select]').forEach((b) => {
    let t = b.dataset.select;
    b.title = unitNames[t] + ' · Retoucher pour désélectionner';
    b.innerHTML =
      '<div class="portrait">' +
      portraitFor(t) +
      '</div><b>[0 / 0]</b><span>' +
      unitNames[t] +
      '</span><div class="hp-track"><i></i></div>';
    b.onclick = () => {
      const units = state.units.filter((unit) => selected.has(unit.id) && unit.hp > 0);
      if (units.length && units.every((unit) => unit.team === player && unit.type === t)) {
        clearSelection();
        return;
      }
      selectType(t, portraitTap.tap(t, performance.now()));
    };
  });
  $('#focusPortrait').innerHTML = portraitFor('knight');
}
function layout() {
  scale = Math.max(viewWidth / W, viewHeight / H) * zoom;
  cameraX = Math.max(viewWidth / scale / 2, Math.min(W - viewWidth / scale / 2, cameraX));
  cameraY = Math.max(viewHeight / scale / 2, Math.min(H - viewHeight / scale / 2, cameraY));
  ox = viewWidth / 2 - cameraX * scale;
  oy = viewHeight / 2 - cameraY * scale;
}
function resize() {
  const rect = canvas.getBoundingClientRect();
  viewWidth = Math.max(1, rect.width);
  viewHeight = Math.max(1, rect.height);
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(viewWidth * dpr),
    height = Math.round(viewHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  layout();
}
installMobileDisplay({
  canvas,
  onResize: resize,
  onCancel: () => {
    touchUI?.stop();
    gestures.reset();
    selectionBox = null;
    for (const id of fieldPointers) {
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    }
    fieldPointers.clear();
    portraitTap.reset();
  },
});
function notify(text) {
  $('#toast').textContent = text;
  toastTime = 5;
}
function viewportUnits(t) {
  return unitsOfType(state.units, player, t, cameraBounds(ox, oy, scale, viewWidth, viewHeight));
}
function clearSelection() {
  selected.clear();
  selectedMine = null;
  portraitTap.reset();
  updateUI();
  notify('Sélection vidée');
}
function selectType(t, scope = 'all') {
  const groups = viewportUnits(t),
    units = scope === 'all' ? groups.total : groups.visible;
  selected = new Set(units.map((u) => u.id));
  selectedMine = null;
  playSelectionVoice(units);
  updateUI();
  notify(
    selected.size
      ? selected.size +
          ' ' +
          unitNames[t] +
          ' · ' +
          (scope === 'all' ? 'Toute la carte' : 'Vue actuelle')
      : groups.total.length
        ? 'Aucune unité de ce type dans la vue · Double-tap pour toute la carte'
        : 'Aucune unité de ce type',
  );
}

let selectionTypesSignature = '';
function refreshSelectionTypes(group) {
  const panel = $('#selectionTypes');
  const types = [...new Set(group.map((unit) => unit.type))];
  panel.hidden = types.length < 2;
  const signature = types.join(',');
  if (signature === selectionTypesSignature) return;
  selectionTypesSignature = signature;
  panel.replaceChildren();
  for (const type of types) {
    const button = document.createElement('button');
    button.innerHTML = portraitFor(type);
    button.setAttribute('aria-label', TYPES[type].name || type);
    button.title = type + ' : toucher pour isoler, appui long pour retirer';
    let timer = null;
    let removed = false;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    button.onpointerdown = (event) => {
      if (event.button !== 0) return;
      removed = false;
      button.setPointerCapture(event.pointerId);
      timer = setTimeout(() => {
        removed = true;
        selected = filterSelection(selected, state.units, type, true);
        updateUI();
      }, 550);
    };
    button.onpointerup = cancel;
    button.onpointercancel = () => {
      removed = true;
      cancel();
    };
    button.onlostpointercapture = cancel;
    button.oncontextmenu = (event) => event.preventDefault();
    button.onclick = () => {
      cancel();
      if (removed) return;
      selected = filterSelection(selected, state.units, type);
      updateUI();
    };
    panel.append(button);
  }
}
function updateUI() {
  let army = state.units.filter((u) => u.team === player);
  selected = new Set([...selected].filter((id) => army.some((u) => u.id === id)));
  let group = army.filter((u) => selected.has(u.id));
  refreshSelectionTypes(group);
  document.querySelectorAll('[data-select]').forEach((b) => {
    let counts = viewportUnits(b.dataset.select),
      us = counts.total,
      hp = us.reduce((n, u) => n + u.hp, 0),
      max = us.reduce((n, u) => n + u.max, 0);
    b.querySelector('b').textContent = '[' + counts.visible.length + ' / ' + us.length + ']';
    b.setAttribute(
      'aria-label',
      unitNames[b.dataset.select] +
        ' : ' +
        counts.visible.length +
        ' visibles sur ' +
        us.length +
        ' au total. Un tap : vue actuelle. Retoucher le type sélectionné : vider la sélection.',
    );
    b.querySelector('.hp-track i').style.width = (max ? (hp / max) * 100 : 0) + '%';
    b.disabled = !us.length;
    b.setAttribute('aria-pressed', String(us.some((u) => selected.has(u.id))));
  });
  $('#rubies').textContent = Math.floor(state.rubies[player]);
  $('#population').textContent = army.length + ' / 30';
  $('#income').textContent = army.filter((u) => u.harvest).length + ' en récolte';
  $('#clock').textContent =
    String(Math.floor(state.time / 60)).padStart(2, '0') +
    ':' +
    String(Math.floor(state.time % 60)).padStart(2, '0');
  let type = group[0]?.type;
  $('#focusName').textContent = group.length
    ? group.every((u) => u.type === type)
      ? unitNames[type]
      : 'Armée mixte'
    : 'VOTRE ARMÉE';
  $('#focusHealth').textContent = group.length
    ? Math.ceil(group.reduce((n, u) => n + u.hp, 0)) +
      ' / ' +
      group.reduce((n, u) => n + u.max, 0) +
      ' PV'
    : 'Sélectionnez un groupe';
  if (type && $('#focusPortrait').dataset.type !== player + type) {
    $('#focusPortrait').innerHTML = portraitFor(type);
    $('#focusPortrait').dataset.type = player + type;
  }
  updateProductionChoices();
  document.querySelectorAll('[data-unit]').forEach((b) => {
    const type = b.dataset.unit,
      all = Sim.producers(state, player, type),
      ps = all.filter((p) => !selectedProducer || p.id === selectedProducer),
      q = state.queues?.[player] || [],
      free = ps.some((p) => q.filter((j) => j.producerId === p.id).length < 8),
      required = Sim.BUILDINGS[player].find((c) => c.unit === type)?.name || 'Base principale';
    b.disabled =
      !running ||
      paused ||
      !free ||
      state.rubies[player] < Sim.stats(type, player).cost ||
      army.length + q.length >= 30;
    const html =
      unitNames[type] +
      '<small>' +
      (!all.length
        ? '🔒 ' + required + ' requis'
        : !ps.length
          ? 'Autre bâtiment requis'
          : Sim.stats(type, player).cost +
            ' rubis · ' +
            Sim.stats(type, player).production +
            ' s · ' +
            ps.length +
            ' bâtiment(s)') +
      '</small>';
    if (b.innerHTML !== html) b.innerHTML = html;
  });
  $('#towerStatus').textContent =
    state.tower.owner === player
      ? '◉ Tour : vision étendue'
      : state.tower.owner === 1 - player
        ? '◉ Tour : occupée par l’adversaire'
        : '◉ Tour : non contrôlée';
  $('#build').disabled = !running || state.rubies[player] < 120;
  updateConstruction();
  touchUI?.refresh();
  controlGroupsUI?.refresh();
  radial?.refresh();
  const q = state.queues?.[player] || [],
    active = q.filter((j, i) => q.findIndex((k) => k.producerId === j.producerId) === i);
  $('#productionStatus').textContent = q.length
    ? active.length +
      ' production(s) en parallèle · ' +
      q.length +
      ' en file : ' +
      active.map((j) => unitNames[j.type] + ' ' + Math.ceil(j.remaining) + ' s').join(' / ')
    : 'Files de production vides';
}

$('#chooseHuman').onclick = () => choose(0);
$('#chooseGhost').onclick = () => choose(1);
function choose(t) {
  chosen = t;
  $('#chooseHuman').setAttribute('aria-pressed', String(t === 0));
  $('#chooseGhost').setAttribute('aria-pressed', String(t === 1));
}
$('#start').onclick = () => {
  if (net) {
    notify('Quittez le salon avant de lancer le solo.');
    return;
  }
  state = Sim.create();
  controlGroupsUI?.reset();
  selected.clear();
  selectedProducer = null;
  player = chosen;
  running = true;
  paused = false;
  zoom = 2.6;
  cameraX = state.bases[player].x + (player ? -50 : 65);
  cameraY = state.bases[player].y + 70;
  layout();
  setupPortraits();
  $('#veil').style.display = 'none';
  $('#pause').textContent = 'Ⅱ';
  $('#recruitTray').hidden = true;
  $('#buildingsTray').hidden = true;
  updateUI();
  notify('Explorez avec vos unités. Glissez : sélectionner · 2 doigts : caméra et zoom');
};
$('#all').onclick = () => {
  const units = state.units.filter((u) => u.team === player);
  selected = new Set(units.map((u) => u.id));
  playSelectionVoice(units);
  updateUI();
};
$('#retreat').onclick = () => {
  const ids = [...selected];
  attackMoveArmed = false;
  $('#attackAction').setAttribute('aria-pressed', 'false');
  if (net) sendCommand({ kind: 'retreat', ids });
  else Sim.disengage(state, ids);
  notify('Décrocher · Déplacement sans riposte');
};
$('#hold').onclick = () => {
  if (net) {
    sendCommand({ kind: 'hold', ids: [...selected] });
    return;
  }
  state.units
    .filter((u) => selected.has(u.id))
    .forEach((u) => {
      u.manual = null;
      u.harvest = null;
      u.retreat = false;
      u.path = [];
      u.target = null;
      u.hold = true;
    });
  notify('Position tenue · Attaque des ennemis à portée');
};
$('#pause').onclick = () => {
  if (!running) return;
  if (net) {
    notify('Le duel ne peut pas être mis en pause.');
    return;
  }
  paused = !paused;
  $('#pause').textContent = paused ? '▶' : 'Ⅱ';
  notify(paused ? 'En pause' : 'Combat repris');
};
$('#help').onclick = () =>
  notify(
    'Ouvrier + mine à vous : récolter · Bâtiment principal : recruter · Portrait : sélectionner / désélectionner · Appui long dans le vide : désélectionner · Glissez : sélectionner · 2 doigts : caméra et zoom · Tour : 4 s sur place · Base secondaire : 120 rubis près d’une mine · Bois : −2 PV/s',
  );
$('#recruitToggle').onclick = () => {
  selectedProducer = null;
  $('#buildingsTray').hidden = true;
  $('#recruitTray').hidden = !$('#recruitTray').hidden;
  updateUI();
};
document.querySelectorAll('[data-unit]').forEach(
  (b) =>
    (b.onclick = () => {
      if (net) {
        sendCommand({ kind: 'recruit', type: b.dataset.unit, producerId: selectedProducer });
        return;
      }
      if (!paused && Sim.recruit(state, b.dataset.unit, player, selectedProducer)) {
        notify('Production ajoutée à la file');
        updateUI();
      }
    }),
);
$('#build').onclick = () => {
  if (!running || paused) return;
  selectedMine = Number($('#expansionMine').value);
  let group = state.units.filter(
      (u) => u.team === player && (selected.size === 0 || selected.has(u.id)),
    ),
    m = state.mines
      .map((m, i) => ({ m, i }))
      .filter(
        (a) =>
          a.i === selectedMine &&
          (a.m.owner !== player || (a.i >= 2 && !a.m.depot)) &&
          group.some((u) => Math.hypot(u.x - a.m.x, u.y - a.m.y) < 95),
      )
      .sort((a, b) => (a.i === selectedMine ? -1 : b.i === selectedMine ? 1 : a.i - b.i))[0];
  if (!m) {
    notify('Approchez une unité d’une mine, puis construisez une base secondaire.');
    return;
  }
  if (net) {
    sendCommand({ kind: 'build', index: m.i });
    return;
  }
  if (Sim.build(state, player, m.i)) {
    notify('Base secondaire construite · Dépôt local disponible');
    updateUI();
  } else notify('Construction impossible : zone contestée ou rubis insuffisants.');
};
$('#zoomIn').onclick = () => {
  zoom = Math.min(3.5, zoom + 0.3);
  layout();
};
$('#zoomOut').onclick = () => {
  zoom = Math.max(1, zoom - 0.3);
  layout();
};
$('#home').onclick = () => {
  cameraX = state.bases[player].x;
  cameraY = state.bases[player].y;
  layout();
};
$('#fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen)
      await document.documentElement.requestFullscreen();
    else
      notify(
        navigator.standalone || matchMedia('(display-mode: standalone)').matches
          ? 'Mode application actif · Les barres système restent gérées par iOS.'
          : 'Safari → Partager → Sur l’écran d’accueil, puis lancez CENDRE depuis son icône.',
      );
  } catch {
    notify('Plein écran indisponible dans cette vue. Ouvrez le lien dans votre navigateur.');
  }
};
function world(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left - ox) / scale,
    y: (e.clientY - rect.top - oy) / scale,
  };
}
function handleFieldPointer(e, type) {
  if (type === 'down') {
    if (!running || paused) return;
    fieldPointers.add(e.pointerId);
    canvas.setPointerCapture(e.pointerId);
  } else if (!fieldPointers.has(e.pointerId)) return;
  const rect = canvas.getBoundingClientRect();
  const action = gestures.update({
    type,
    id: e.pointerId,
    pointerType: e.pointerType,
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
    time: performance.now(),
  });
  if (type === 'up' || type === 'cancel') fieldPointers.delete(e.pointerId);
  if (!action) return;
  if (action.kind === 'camera') {
    selectionBox = null;
    if (!action.from) return;
    const anchorX = (action.from.x - ox) / scale;
    const anchorY = (action.from.y - oy) / scale;
    const ratio = action.from.distance > 0 ? action.to.distance / action.from.distance : 1;
    zoom = Math.max(1, Math.min(3.5, zoom * ratio));
    layout();
    cameraX = anchorX - (action.to.x - viewWidth / 2) / scale;
    cameraY = anchorY - (action.to.y - viewHeight / 2) / scale;
    layout();
    return;
  }
  if (action.kind === 'select-box') {
    selectionBox = action;
    if (action.final) {
      const start = { x: (action.start.x - ox) / scale, y: (action.start.y - oy) / scale };
      const end = { x: (action.end.x - ox) / scale, y: (action.end.y - oy) / scale };
      const units = unitsInBox(state.units, player, start, end);
      selectionBox = null;
      const nextSelection = boxSelection(selected, units);
      if (nextSelection === selected) return;
      selected = nextSelection;
      selectedMine = null;
      portraitTap.reset();
      playSelectionVoice(units);
      selectionBox = null;
      updateUI();
    }
    return;
  }
  selectionBox = null;
  handleFieldTap(e, action.duration);
}
for (const [event, type] of Object.entries({
  pointerdown: 'down',
  pointermove: 'move',
  pointerup: 'up',
  pointercancel: 'cancel',
  lostpointercapture: 'cancel',
})) {
  canvas.addEventListener(event, (e) => handleFieldPointer(e, type));
}
function handleFieldTap(e, duration) {
  let p = world(e);
  p.unitRadius = Math.max(22, 16 / scale);
  if (radial?.isGhost) {
    pickGhostSlot(p);
    return;
  }
  if (duration >= 550 && isEmptyTap(state, player, p)) {
    clearSelection();
    return;
  }
  const action = attackMoveArmed && selected.size
    ? { kind: 'move' }
    : resolveTap(state, player, selected, p);
  if (action.kind === 'radial') {
    if (action.context.mine !== undefined) selectedMine = action.context.mine;
    openRadial(e, action.context);
    return;
  }
  if (action.kind === 'enemyBase') {
    selectedMine = action.index;
    notify('Base adverse');
    return;
  }
  if (action.kind === 'production') {
    selectedProducer = action.id;
    $('#recruitTray').hidden = false;
    $('#buildingsTray').hidden = true;
    updateUI();
    return;
  }
  if (action.kind === 'select') {
    selected = new Set([action.id]);
    playSelectionVoice(state.units.filter((unit) => unit.id === action.id));
    updateUI();
    return;
  }
  if (action.kind === 'gather') {
    if (net) sendCommand(action);
    else Sim.gather(state, player, action.ids, action.index);
    notify('Récolte automatique · Retour à la base pour déposer');
    updateUI();
    return;
  }
  if (action.kind === 'mine') {
    selectedMine = action.index;
    const mine = state.mines[action.index];
    notify(
      mine.name + ' · ' + (mine.boost ? 'Rendement ×2 · ' : '') + 'Base secondaire : 120 rubis',
    );
    return;
  }
  if (action.kind === 'move' || action.kind === 'attack') {
    const target = action.target || null;
    if (net) {
      sendCommand({
        kind: attackMoveArmed ? 'attackMove' : 'move',
        ids: [...selected],
        x: p.x,
        y: p.y,
        target: target ? (target.base ? { base: true } : { id: target.id }) : null,
      });
    } else Sim.order(state, [...selected], p.x, p.y, target, !target && !attackMoveArmed);
    attackMoveArmed = false;
    $('#attackAction').setAttribute('aria-pressed', 'false');
    const nearest = Sim.nearest(p.x, p.y);
    marker = {
      x: (nearest % COLS) * CELL + 10,
      y: Math.floor(nearest / COLS) * CELL + 10,
      life: 1,
    };
  } else notify('Sélectionnez vos unités avec les portraits en bas.');
}
mini.addEventListener('pointerdown', (e) => {
  let r = mini.getBoundingClientRect();
  cameraX = ((e.clientX - r.left) / r.width) * W;
  cameraY = ((e.clientY - r.top) / r.height) * H;
  layout();
});
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === 'Space') {
    e.preventDefault();
    $('#all').click();
  }
  if (e.key === 'Escape') $('#pause').click();
  if (e.key.toLowerCase() === 'a') $('#attackAction').click();
  if (e.key === 'r') $('#retreat').click();
  if (e.key === '4') selectType('commis');
  if (['1', '2', '3'].includes(e.key)) selectType(['knight', 'archer', 'mage'][+e.key - 1]);
});
function ai(dt) {
  let t = 1 - player;
  if (state.aiClock < 6) return;
  state.aiClock = 0;
  let army = state.units.filter((u) => u.team === t);
  const type = ['knight', 'archer', 'mage'][Math.floor(state.time / 6) % 3];
  if (!Sim.producers(state, t, type).length)
    Sim.construct(state, t, Sim.BUILDINGS[t].find((b) => b.unit === type).id);
  if (army.length < 16) Sim.recruit(state, type, t);
  let mine = state.mines.findIndex(
    (m) =>
      (m.owner !== t || (!m.depot && state.mines.indexOf(m) >= 2)) &&
      army.some((u) => Math.hypot(u.x - m.x, u.y - m.y) < 95),
  );
  if (mine >= 0) Sim.build(state, t, mine);
  let destination =
    state.time > 95
      ? state.bases[player]
      : state.mines.find(
          (m) => m.owner !== t && m.name !== (t ? 'Mine de la Braise' : 'Mine du Voile'),
        ) || state.tower;
  let idle = army.filter((u) => u.type !== 'commis' && !u.path.length && !u.target);
  Sim.order(
    state,
    idle.map((u) => u.id),
    destination.x,
    destination.y,
    destination.base && Sim.canSee(state, t, destination) ? destination : null,
    false,
  );
}
function finish() {
  running = false;
  if (net)
    $('#roomStatus').textContent = 'Duel terminé. Quittez le salon pour en créer un nouveau.';
  $('#modalTitle').textContent = state.winner === player ? 'Victoire !' : 'Votre base est tombée';
  $('#modalText').textContent =
    'La bataille est terminée. Changez de camp ou relancez pour essayer une autre stratégie.';
  $('#start').innerHTML = 'Nouvelle escarmouche →';
  $('#veil').style.display = 'flex';
}
function poly(points, fill, stroke) {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}
function ellipse(x, y, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}
function line(x, y, xx, yy, color, width = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(xx, yy);
  ctx.stroke();
}
function bar(x, y, hp, max, w = 30) {
  ctx.fillStyle = '#071413';
  ctx.fillRect(x - w / 2, y, w, 4);
  ctx.fillStyle = hp / max > 0.35 ? '#91bf91' : '#e27c65';
  ctx.fillRect(x - w / 2, y, w * Math.max(0, hp / max), 4);
}
function building(b) {
  let { x, y, team } = b,
    c = team ? '#5bc8ad' : '#d6b77e';
  ellipse(x, y + 25, 80, 35, '#07121088');
  poly(
    [
      [x - 60, y],
      [x, y + 32],
      [x + 62, y],
      [x, y - 30],
    ],
    '#35423e',
  );
  ctx.fillStyle = team ? '#273b3b' : '#7e8070';
  ctx.fillRect(x - 42, y - 65, 84, 68);
  poly(
    [
      [x - 42, y - 65],
      [x, y - 112],
      [x + 42, y - 65],
    ],
    team ? '#162b2c' : '#2e4972',
    c,
  );
  for (let k of [-1, 1]) {
    ctx.fillStyle = team ? '#374744' : '#a4a18b';
    ctx.fillRect(x + k * 46 - 12, y - 74, 24, 80);
    poly(
      [
        [x + k * 46 - 16, y - 74],
        [x + k * 46, y - 117],
        [x + k * 46 + 16, y - 74],
      ],
      team ? '#233b38' : '#354f79',
      c,
    );
  }
  ctx.fillStyle = c;
  ctx.fillRect(x - 12, y - 35, 24, 40);
  if (team) {
    ctx.shadowBlur = 20;
    ctx.shadowColor = c;
    ellipse(x, y - 20, 9, 22, c);
    ctx.shadowBlur = 0;
  } else {
    line(x + 14, y - 110, x + 14, y - 145, c);
    poly(
      [
        [x + 14, y - 145],
        [x + 43, y - 137],
        [x + 14, y - 128],
      ],
      '#436baa',
      '#d6b77e',
    );
  }
  bar(x, y - 150, b.hp, b.max, 100);
  ctx.fillStyle = '#d4d9bd';
  ctx.font = '12px Georgia';
  ctx.textAlign = 'center';
  ctx.fillText(team ? 'CRYPTE DU VOILE' : 'CITADELLE DE LA BRAISE', x, y + 65);
}
function unit(u) {
  drawCook(u);
}
function drawFog() {
  fc.clearRect(0, 0, COLS, ROWS);
  for (let i = 0; i < walkLength; i++) {
    if (state.visible[player][i]) continue;
    fc.fillStyle = state.explored[player][i] ? 'rgba(5,12,18,.67)' : '#080e14';
    fc.fillRect(i % COLS, Math.floor(i / COLS), 1, 1);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(fog, 0, 0, W, H);
}
const walkLength = COLS * ROWS;
function drawMini() {
  mc.fillStyle = '#080e14';
  mc.fillRect(0, 0, 168, 94);
  if (terrain.complete && terrain.naturalWidth) mc.drawImage(terrain, 0, 0, 168, 94);
  mc.drawImage(fog, 0, 0, 168, 94);
  for (let u of state.units)
    if (Sim.canSee(state, player, u)) {
      mc.fillStyle = u.team === player ? '#a1c9ff' : '#75edc8';
      mc.fillRect(u.x / 10 - 1, u.y / 10 - 1, 2, 2);
    }
  mc.strokeStyle = '#ddc998';
  mc.lineWidth = 1;
  mc.strokeRect(
    -ox / scale / 10,
    -oy / scale / 10,
    viewWidth / scale / 10,
    viewHeight / scale / 10,
  );
}
function draw() {
  ctx.setTransform(canvas.width / viewWidth, 0, 0, canvas.height / viewHeight, 0, 0);
  ctx.fillStyle = '#080e14';
  ctx.fillRect(0, 0, viewWidth, viewHeight);
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  if (terrain.complete && terrain.naturalWidth) ctx.drawImage(terrain, 0, 0, W, H);
  else {
    ctx.fillStyle = '#514535';
    ctx.fillRect(0, 0, W, H);
  }
  drawExpansionSites();
  for (let m of state.mines) {
    if (!Sim.visibleAt(state, player, m.x, m.y)) continue;
    ctx.strokeStyle = m.owner === player ? '#aac9f5' : m.owner === -1 ? '#d6b579' : '#6ee2ba';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, 42, 22, 0, 0, 7);
    ctx.stroke();
    ctx.font = '11px Arial';
    ctx.fillStyle = '#e5d4ad';
    ctx.textAlign = 'center';
    ctx.fillText(
      m.owner === player
        ? m.boost
          ? '20 / LIVRAISON · VEINE RICHE'
          : '10 / LIVRAISON'
        : m.boost
          ? 'VEINE RICHE · RENDEMENT ×2'
          : 'EMPLACEMENT DE BASE',
      m.x,
      m.y + 38,
    );
  }
  let tw = state.tower;
  if (Sim.visibleAt(state, player, tw.x, tw.y)) {
    ctx.strokeStyle = tw.owner === player ? '#f4cb79' : '#998969';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(tw.x, tw.y, 64, 33, 0, 0, 7);
    ctx.stroke();
    if (Math.abs(tw.progress) > 0) {
      ctx.beginPath();
      ctx.arc(tw.x, tw.y, 43, -Math.PI / 2, -Math.PI / 2 + (Math.abs(tw.progress) / 4) * 6.28);
      ctx.stroke();
    }
  }
  drawSlots();
  state.units
    .filter((u) => Sim.canSee(state, player, u))
    .sort((a, b) => a.y - b.y)
    .forEach((u) => {
      unit(u);
      if (Sim.forest(u) && u.team === player) {
        ctx.font = '9px Arial';
        ctx.fillStyle = '#edbc84';
        ctx.textAlign = 'center';
        ctx.fillText('CACHÉ · −2 PV/s', u.x, u.y + 22);
      }
    });
  for (let b of state.bases)
    if (Sim.canSee(state, player, b)) {
      bar(b.x, b.y - 80, b.hp, b.max, 85);
      {
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f4dab0';
        ctx.fillText(b.team ? 'GRANDE DÉCHARGE' : 'CUISINE CENTRALE', b.x, b.y - 91);
      }
    }
  for (let s of state.shots)
    if (Sim.visibleAt(state, player, s.x, s.y) && Sim.visibleAt(state, player, s.tx, s.ty))
      line(s.x, s.y, s.tx, s.ty, s.team ? '#8ef1ce' : '#ffd388', 2);
  if (marker) {
    ctx.strokeStyle = '#e9d6a8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(marker.x, marker.y, 22, 12, 0, 0, 7);
    ctx.stroke();
  }
  drawFog();
  drawBuildGhost();
  drawMini();
  if (selectionBox) {
    ctx.save();
    ctx.setTransform(canvas.width / viewWidth, 0, 0, canvas.height / viewHeight, 0, 0);
    const { start, end } = selectionBox;
    ctx.fillStyle = '#8ef1ce22';
    ctx.strokeStyle = '#8ef1ce';
    ctx.lineWidth = 2;
    ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    const worldStart = { x: (start.x - ox) / scale, y: (start.y - oy) / scale };
    const worldEnd = { x: (end.x - ox) / scale, y: (end.y - oy) / scale };
    const count = String(unitsInBox(state.units, player, worldStart, worldEnd).length);
    ctx.font = 'bold 14px sans-serif';
    const badgeWidth = ctx.measureText(count).width + 16;
    const badgeX = Math.max(0, Math.min(viewWidth - badgeWidth, Math.max(start.x, end.x) - badgeWidth));
    const badgeY = Math.max(0, Math.min(viewHeight - 24, Math.min(start.y, end.y)));
    ctx.fillStyle = '#183c32';
    ctx.fillRect(badgeX, badgeY, badgeWidth, 24);
    ctx.fillStyle = '#8ef1ce';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(count, badgeX + badgeWidth / 2, badgeY + 12);
    ctx.restore();
  }
}
setupPortraits();
updateUI();
function frame(t) {
  let dt = Math.min((t - last) / 1000, 0.05);
  last = t;
  touchUI?.tick(dt);
  if (running && !paused) {
    if (!net) {
      ai(dt);
      Sim.tick(state, dt);
    }
    if (state.winner !== null) finish();
    if (toastTime > 0 && (toastTime -= dt) <= 0) $('#toast').textContent = '';
    if (marker && (marker.life -= dt) <= 0) marker = null;
  }
  lastUI += dt;
  if (lastUI > 0.15) {
    updateUI();
    lastUI = 0;
  }
  updateAmbience();
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Player-filtered snapshots from the authoritative room server.
let net = null,
  netTimer = null,
  netBusy = false,
  pending = [],
  seq = 0,
  motion = new NetworkMotion(),
  lastRtt = 0;
const savedKey = 'cendre-room-v1';
async function requestMatch(body) {
  const r = await fetch('/api/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  let data;
  try {
    data = await r.json();
  } catch {
    throw new Error('Serveur indisponible, réessayez.');
  }
  if (!r.ok)
    throw Object.assign(new Error(data.error || 'Connexion impossible.'), { status: r.status });
  return data;
}
function persistRoom() {
  try {
    sessionStorage.setItem(savedKey, JSON.stringify({ ...net, seq }));
  } catch {}
}
function lobbyControls(connected) {
  $('#lobby').hidden = !connected;
  for (const id of ['start', 'createRoom', 'joinRoom', 'chooseHuman', 'chooseGhost', 'roomInput'])
    $('#' + id).disabled = connected;
  $('#leaveMatch').hidden = !connected;
  $('#netBadge').hidden = !connected;
}
function resetNetwork() {
  clearTimeout(netTimer);
  net = null;
  pending = [];
  seq = 0;
  motion.clear();
  sessionStorage.removeItem(savedKey);
  lobbyControls(false);
  $('#pause').disabled = false;
  $('#networkError').textContent = '';
}
function showSnapshot(data) {
  if (!net) return;
  net.team = data.team;
  player = data.team;
  seq = Math.max(seq, data.ack || 0);
  if (data.state) {
    motion.receive(data.state.units, performance.now());
    state = data.state;
  }
  if (data.error) notify(data.error);
  const labels = {
    waiting: 'En attente de votre ami…',
    countdown: 'Début du duel dans ' + data.countdown + '…',
    playing: '1v1 · Connecté',
    disconnected: 'Adversaire déconnecté · Partie suspendue (2 min maximum)',
    ended: 'Duel terminé',
  };
  $('#roomStatus').textContent = labels[data.status] || 'Connexion…';
  $('#netBadge').textContent =
    (labels[data.status] || 'Connexion…') +
    (data.status === 'playing' ? ' · ' + Math.round(lastRtt) + ' ms' : '');
  $('#networkError').textContent = '';
  if (data.status === 'playing' && !net.begun) {
    net.begun = true;
    networkGroups = createControlGroups();
    controlGroupsUI?.reset();
    selected.clear();
    running = true;
    paused = false;
    zoom = 2.6;
    cameraX = state.bases[player].x;
    cameraY = state.bases[player].y + 70;
    layout();
    setupPortraits();
    $('#veil').style.display = 'none';
    $('#recruitTray').hidden = true;
    $('#pause').disabled = true;
    notify('Duel commencé · Détruisez la base adverse.');
  }
  if (data.status === 'ended' && state.winner !== null && !net.finished) {
    net.finished = true;
    finish();
  }
  paused = data.status !== 'playing';
  updateUI();
  persistRoom();
}
async function pollRoom() {
  if (!net || netBusy) return;
  clearTimeout(netTimer);
  netBusy = true;
  const current = net,
    batch = pending.slice(0, 12),
    started = performance.now();
  let failed = false;
  try {
    const data = await requestMatch({
      action: 'sync',
      code: current.code,
      token: current.token,
      ...(batch.length ? { commands: batch } : {}),
    });
    if (net !== current) return;
    lastRtt = performance.now() - started;
    pending = pending.filter((item) => item.seq > (data.ack || 0));
    showSnapshot(data);
  } catch (e) {
    failed = true;
    if (net !== current) return;
    $('#netBadge').textContent = 'Connexion perdue · Reconnexion…';
    $('#networkError').textContent = e.message;
    paused = true;
    if ([401, 404, 410].includes(e.status)) {
      running = false;
      resetNetwork();
      $('#veil').style.display = 'flex';
      $('#networkError').textContent = e.message;
    }
  } finally {
    netBusy = false;
    if (net) {
      clearTimeout(netTimer);
      netTimer = setTimeout(
        pollRoom,
        net === current
          ? pollDelay(performance.now() - started, pending.length, failed, net.finished)
          : 0,
      );
    }
  }
}
function sendCommand(command) {
  if (!net || paused || !running) {
    notify('Connexion en cours, patientez.');
    return;
  }
  if (
    command.kind === 'steer' &&
    pending.at(-1)?.command.kind === 'steer' &&
    JSON.stringify(pending.at(-1).command.ids) === JSON.stringify(command.ids)
  )
    pending.pop();
  if (pending.length >= 12) {
    notify('Ordres en cours d’envoi…');
    return;
  }
  pending.push({ command, seq: ++seq });
  persistRoom();
  clearTimeout(netTimer);
  if (!netBusy) pollRoom();
  return true;
}

async function enterRoom(action) {
  $('#networkError').textContent = 'Connexion au salon…';
  $('#createRoom').disabled = true;
  $('#joinRoom').disabled = true;
  try {
    const data = await requestMatch({
      action,
      team: chosen,
      code: $('#roomInput').value.trim().toUpperCase(),
    });
    net = { code: data.code, token: data.token, team: data.team, begun: false, finished: false };
    seq = 0;
    persistRoom();
    lobbyControls(true);
    $('#roomCode').textContent = 'SALON ' + data.code;
    showSnapshot(data);
    pollRoom();
  } catch (e) {
    $('#networkError').textContent = e.message;
    $('#createRoom').disabled = false;
    $('#joinRoom').disabled = false;
  }
}
$('#createRoom').onclick = () => enterRoom('create');
$('#joinRoom').onclick = () => enterRoom('join');
$('#copyRoom').onclick = async () => {
  if (!net) return;
  const link = new URL(location.href);
  link.search = '';
  link.searchParams.set('room', net.code);
  try {
    await navigator.clipboard.writeText(link.href);
    $('#roomStatus').textContent = 'Lien copié. Envoyez-le à votre ami.';
  } catch {
    $('#roomStatus').textContent = 'Partagez le code : ' + net.code;
  }
};
async function leaveRoom() {
  if (!net) return;
  const old = net;
  resetNetwork();
  running = false;
  paused = false;
  $('#veil').style.display = 'flex';
  $('#modalTitle').textContent = 'Explorez. Occupez. Conquérez.';
  $('#modalText').textContent = 'Créez un nouveau duel ou lancez une escarmouche solo.';
  try {
    await requestMatch({ action: 'leave', code: old.code, token: old.token });
  } catch {
    notify('Salon quitté. Une déconnexion prolongée compte comme un abandon.');
  }
}
$('#cancelRoom').onclick = leaveRoom;
$('#leaveMatch').onclick = () => {
  if (!running || confirm('Quitter le duel ? Cela compte comme un abandon.')) leaveRoom();
};
const invite = new URL(location.href).searchParams.get('room');
if (invite) $('#roomInput').value = invite.toUpperCase().slice(0, 7);
try {
  const saved = JSON.parse(sessionStorage.getItem(savedKey) || 'null');
  if (saved?.token && (!invite || saved.code === invite.toUpperCase())) {
    net = { ...saved, begun: false, finished: false };
    seq = saved.seq || 0;
    lobbyControls(true);
    $('#roomCode').textContent = 'SALON ' + net.code;
    pollRoom();
  }
} catch {
  sessionStorage.removeItem(savedKey);
}

function drawCook(u) {
  let { x, y } = net ? motion.position(u, performance.now()) : u;
  const size = u.type === 'commis' ? 34 : u.type === 'archer' ? 52 : u.type === 'mage' ? 49 : 46;
  const bob =
    u.type === 'mage'
      ? Math.sin(state.time * 3 + u.id) * 3
      : Math.sin(state.time * 8 + u.id) * (u.path?.length || net ? 1 : 0);
  ellipse(x, y + 4, size * 0.28, 6, '#06100d77');
  if (selected.has(u.id)) {
    ctx.strokeStyle = '#f7cb78';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y + 3, size * 0.36, 9, 0, 0, 7);
    ctx.stroke();
  }
  const img = (u.team === 1 ? ratSprites : cookSprites)[u.type];
  if (img?.complete) ctx.drawImage(img, x - size / 2, y - size + 5 + bob, size, size * 1.125);
  if (u.type === 'commis' && u.team === player && (u.harvest || u.cargo)) {
    ctx.textAlign = 'center';
    ctx.font = '9px Arial';
    ctx.fillStyle = '#ffe3a0';
    ctx.fillText(
      u.cargo
        ? 'Sac : ' + u.cargo
        : u.harvest?.phase === 'MINAGE'
          ? 'Récolte ' + Math.min(100, Math.floor((u.harvest.elapsed / 3) * 100)) + ' %'
          : 'Vers la mine',
      x,
      y + 17,
    );
  }
  if (u.hp < u.max || selected.has(u.id)) bar(x, y - size - 3, u.hp, u.max);
}

function setupConstruction() {
  const box = $('#buildingChoices');
  box.replaceChildren();
  for (const b of Sim.BUILDINGS[player]) {
    const button = document.createElement('button');
    button.textContent = b.name + ' · ' + b.cost + ' rubis';
    button.dataset.cost = b.cost;
    button.onclick = () => {
      if (!running || paused) return;
      const baseId = $('#constructionBase').value;
      if (net) {
        sendCommand({ kind: 'construct', type: b.id, baseId });
        return;
      }
      notify(
        Sim.construct(state, player, b.id, baseId)
          ? b.name + ' construit · Production disponible'
          : 'Ressources insuffisantes ou aucun emplacement libre.',
      );
      updateUI();
    };
    box.append(button);
  }
}
function refreshOptions(select, options) {
  const signature = JSON.stringify(options);
  if (select.dataset.options === signature) return;
  const previous = select.value;
  select.replaceChildren(
    ...options.map(([value, label]) => {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      return o;
    }),
  );
  if (options.some(([v]) => v === previous)) select.value = previous;
  select.dataset.options = signature;
}
function updateConstruction() {
  const bases = Sim.baseSites(state, player);
  refreshOptions(
    $('#constructionBase'),
    bases.map((b) => [b.id, b.name]),
  );
  const slots = (state.slots?.[player] || []).filter(
      (p) => p.baseId === $('#constructionBase').value,
    ),
    used = slots.filter((p) => p.occupe).length;
  $('#slotStatus').textContent = used + ' / ' + slots.length + ' emplacements occupés';
  for (const b of $('#buildingChoices').children)
    b.disabled =
      !running ||
      paused ||
      !slots.length ||
      used === slots.length ||
      state.rubies[player] < Number(b.dataset.cost);
  const mines = state.mines.flatMap((m, i) =>
    i >= 2 && (!m.depot || m.owner !== player) && Sim.visibleAt(state, player, m.x, m.y)
      ? [[String(i), m.name]]
      : [],
  );
  refreshOptions($('#expansionMine'), mines.length ? mines : [['', 'Explorez une nouvelle mine']]);
  $('#build').disabled = !running || paused || state.rubies[player] < 120 || !mines.length;
}
function updateProductionChoices() {
  const ps = Object.keys(TYPES).flatMap((t) => Sim.producers(state, player, t));
  if (selectedProducer && !ps.some((p) => p.id === selectedProducer)) selectedProducer = null;
  refreshOptions($('#productionBuilding'), [
    ['', 'Automatique · bâtiment le moins occupé'],
    ...ps.map((p, i) => [p.id, p.name + ' · ' + (i + 1)]),
  ]);
  $('#productionBuilding').value = selectedProducer || '';
}
function openBuildings() {
  $('#recruitTray').hidden = true;
  $('#buildingsTray').hidden = false;
  updateUI();
}
function drawSlots() {
  for (const slots of state.slots || [])
    for (const s of slots) {
      if (s.team !== player && !Sim.visibleAt(state, player, s.x, s.y)) continue;
      const { x, y } = s;
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.setLineDash(s.occupe ? [] : [3, 3]);
      poly(
        [
          [x - 23, y],
          [x, y - 12],
          [x + 23, y],
          [x, y + 12],
        ],
        '#0b171cbb',
        s.team ? '#a8cb65' : '#d6b77e',
      );
      ctx.setLineDash([]);
      if (s.occupe) {
        const index = Sim.BUILDINGS[s.team].findIndex((b) => b.id === s.batiment.type);
        drawFactionBuilding(x, y, s.team, index, 0.65);
        ctx.font = '9px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e3c891';
        ctx.fillText(['II', 'III', 'IV'][index] + ' · N1', x, y + 22);
      } else if (s.team === player) {
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e3c891';
        ctx.fillText('+', x, y + 4);
      }
      ctx.restore();
    }
}

function drawFactionBuilding(x, y, team, kind = 3, size = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  ellipse(0, 5, 34, 13, '#07121099');
  ctx.lineWidth = 2;
  if (team) {
    poly(
      [
        [-28, 0],
        [-26, -32],
        [-6, -45],
        [24, -27],
        [30, 3],
      ],
      '#65584c',
      '#c4aa8b',
    );
    ctx.fillStyle = '#343b3c';
    ctx.fillRect(-16, -26, 33, 25);
    for (const k of [-23, 0, 23])
      poly(
        [
          [k - 5, -25],
          [k, -52],
          [k + 6, -25],
        ],
        '#a2a69a',
        '#45473d',
      );
    if (kind === 1) {
      ctx.fillStyle = '#85e34f';
      ctx.fillRect(-8, -26, 17, 17);
      line(20, -20, 28, 1, '#9ef455', 5);
    } else if (kind === 2) {
      ellipse(0, 0, 30, 10, '#53743d');
      line(0, 0, 0, -48, '#9c8661', 5);
      ellipse(0, -47, 10, 12, '#a8ee4c');
    } else {
      ctx.fillStyle = '#171c1a';
      ctx.fillRect(-9, -17, 18, 20);
      ellipse(16, -14, 6, 6, '#a2cf4a');
    }
  } else {
    poly(
      [
        [-28, 2],
        [-28, -33],
        [26, -33],
        [28, 2],
      ],
      '#c2ac7d',
      '#665640',
    );
    ctx.fillStyle = '#6f462f';
    ctx.fillRect(-10, -16, 20, 19);
    if (kind === 1) {
      poly(
        [
          [-32, -25],
          [-22, -43],
          [24, -43],
          [33, -25],
        ],
        '#a74a3f',
        '#e9cc9f',
      );
      for (let k = -24; k < 26; k += 12)
        poly(
          [
            [k, -40],
            [k + 5, -40],
            [k + 10, -26],
            [k + 3, -26],
          ],
          '#f1debd',
        );
      line(3, -43, 3, -61, '#71583e', 4);
      poly(
        [
          [3, -62],
          [20, -62],
          [19, -51],
          [3, -51],
        ],
        '#c5d0c3',
        '#766d58',
      );
    } else if (kind === 2) {
      ctx.fillStyle = '#685139';
      ctx.fillRect(-17, -44, 34, 14);
      ellipse(0, -47, 15, 6, '#e4b352');
      ellipse(0, -57, 9, 14, '#ffd36c');
    } else {
      poly(
        [
          [-32, -33],
          [0, -51],
          [32, -33],
        ],
        '#49708a',
        '#e1cf9b',
      );
      ctx.fillStyle = '#dfc9a3';
      ctx.fillRect(13, -57, 9, 26);
      ellipse(-10, -31, 8, 7, '#e3c38d');
    }
  }
  ctx.restore();
}
function drawExpansionSites() {
  for (let i = 2; i < state.mines.length; i++) {
    const m = state.mines[i];
    if (!m.site || !Sim.visibleAt(state, player, m.x, m.y)) continue;
    const { x, y } = m.site;
    ctx.save();
    ctx.font = '9px Arial';
    ctx.textAlign = 'center';
    if (m.depot) {
      drawFactionBuilding(x, y, m.owner, 3, 0.95);
      ctx.fillStyle = m.owner === player ? '#edcf8e' : '#a7dd83';
      ctx.fillText(m.owner ? 'GRANDE DÉCHARGE' : 'CUISINE CENTRALE', x, y + 21);
      ctx.fillText('DÉPÔT LOCAL', x, y + 32);
    } else {
      ctx.setLineDash([4, 4]);
      poly(
        [
          [x - 32, y],
          [x, y - 17],
          [x + 32, y],
          [x, y + 17],
        ],
        '#0c191bbb',
        '#d6bd83',
      );
      ctx.setLineDash([]);
      ctx.fillStyle = '#e8ce91';
      ctx.fillText('BASE · 120', x, y + 30);
    }
    ctx.restore();
    if (i >= 5) {
      for (const [dx, dy] of [
        [-15, 0],
        [0, -8],
        [15, 0],
      ])
        poly(
          [
            [m.x + dx - 8, m.y + dy],
            [m.x + dx - 4, m.y + dy - 15],
            [m.x + dx + 7, m.y + dy - 11],
            [m.x + dx + 10, m.y + dy],
          ],
          '#d7b451',
          '#f2da85',
        );
    }
  }
}

$('#buildingsToggle').onclick = () => {
  if (!$('#buildingsTray').hidden) $('#buildingsTray').hidden = true;
  else openBuildings();
};
$('#closeBuildings').onclick = () => ($('#buildingsTray').hidden = true);
$('#constructionBase').onchange = updateUI;
$('#productionBuilding').onchange = () => {
  selectedProducer = $('#productionBuilding').value || null;
  updateUI();
};

// Touch controls use the same authoritative simulation commands as desktop orders.
touchUI = initTouchUI({
  get: () => ({ state, selected, player, running, paused, net: !!net }),
  steer: (ids, dx, dy) => {
    if (net) sendCommand({ kind: 'steer', ids, dx, dy });
    else Sim.steer(state, ids, dx, dy);
  },
  attack: () => {
    attackMoveArmed = !attackMoveArmed;
    $('#attackAction').setAttribute('aria-pressed', String(attackMoveArmed));
    notify(attackMoveArmed ? 'Attaque-déplacement · Touchez le sol' : 'Attaque-déplacement annulée');
  },
  focusGroup: () => {
    const us = state.units.filter((u) => selected.has(u.id));
    if (us.length) {
      cameraX = us.reduce((n, u) => n + u.x, 0) / us.length;
      cameraY = us.reduce((n, u) => n + u.y, 0) / us.length;
      layout();
    }
  },
  notify,
});

controlGroupsUI = initControlGroups({
  enabled: () => running && !paused && !document.body.classList.contains('base-open'),
  units: (index) => groupUnits(controlGroups(), index, state.units, player),
  icon: portraitFor,
  assign: (index) => {
    const units = assignGroup(controlGroups(), index, selected, state.units, player);
    notify('Groupe ' + (index + 1) + ' assigné · ' + units.length + ' unités');
  },
  select: (index, center) => {
    const units = groupUnits(controlGroups(), index, state.units, player);
    selected = new Set(units.map((unit) => unit.id));
    selectedMine = null;
    if (center && units.length) {
      cameraX = units.reduce((sum, unit) => sum + unit.x, 0) / units.length;
      cameraY = units.reduce((sum, unit) => sum + unit.y, 0) / units.length;
      layout();
    }
    playSelectionVoice(units);
    updateUI();
  },
});

function openRadial(e, context) {
  radial.open(e.clientX, e.clientY, { ...context, team: player });
}
function pickGhostSlot(p) {
  if (!buildGhost || buildGhost.option.kind === 'depot') return;
  const slots = (state.slots[player] || []).filter((s) => s.baseId === buildGhost.context.baseId);
  const slot = slots.find((s) => Math.hypot(s.x - p.x, s.y - p.y) < 30);
  if (slot) buildGhost.slotId = slot.id;
  else notify('Touchez un emplacement de cette base.');
  radial.refresh();
}
function ghostStatus() {
  if (!buildGhost) return { valid: false, message: 'Choisissez un bâtiment.' };
  const { context, option, slotId } = buildGhost;
  if (!running || paused || context.team !== player)
    return { valid: false, message: 'Construction indisponible.' };
  if (option.kind === 'depot') {
    const m = state.mines[context.mine],
      near =
        m && state.units.some((u) => u.team === player && Math.hypot(u.x - m.x, u.y - m.y) < 95),
      enemy =
        m && state.units.some((u) => u.team !== player && Math.hypot(u.x - m.x, u.y - m.y) < 95);
    const valid = !!m && !m.depot && state.rubies[player] >= 120 && near && !enemy;
    return {
      valid,
      message:
        !m || m.depot
          ? 'Emplacement indisponible.'
          : state.rubies[player] < 120
            ? '120 rubis nécessaires.'
            : !near
              ? 'Approchez une unité de la mine.'
              : enemy
                ? 'Mine contestée.'
                : 'Base secondaire · 120 rubis · Confirmez cet emplacement.',
    };
  }
  const slot = (state.slots[player] || []).find(
    (s) => s.id === slotId && s.baseId === context.baseId,
  );
  const cost = Sim.BUILDINGS[player].find((b) => b.id === option.id)?.cost;
  return {
    valid: !!slot && !slot.occupe && state.rubies[player] >= cost,
    message: !slot
      ? 'Aucun emplacement libre autour de cette base.'
      : slot.occupe
        ? 'Emplacement occupé · Touchez un autre terrain.'
        : state.rubies[player] < cost
          ? cost + ' rubis nécessaires · Ressources insuffisantes.'
          : 'Fantôme · ' + cost + ' rubis · Confirmez pour construire.',
  };
}
function drawBuildGhost() {
  if (!buildGhost) return;
  const { context, option, slotId } = buildGhost;
  const pos =
    option.kind === 'depot'
      ? state.mines[context.mine]?.site
      : (state.slots[player] || []).find((s) => s.id === slotId);
  if (!pos) return;
  const valid = ghostStatus().valid;
  ctx.save();
  ctx.globalAlpha = 0.55;
  drawFactionBuilding(
    pos.x,
    pos.y,
    player,
    option.kind === 'depot' ? 3 : Sim.BUILDINGS[player].findIndex((b) => b.id === option.id),
    option.kind === 'depot' ? 0.95 : 0.65,
  );
  ctx.globalAlpha = 1;
  ctx.lineWidth = 3;
  ctx.setLineDash([4, 3]);
  poly(
    [
      [pos.x - 29, pos.y],
      [pos.x, pos.y - 16],
      [pos.x + 29, pos.y],
      [pos.x, pos.y + 16],
    ],
    valid ? '#8edba633' : '#ff645433',
    valid ? '#9cebb4' : '#ff796c',
  );
  ctx.restore();
}
radial = createRadialMenu({
  onOpen: () => {
    touchUI?.stop();
    $('#recruitTray').hidden = true;
    $('#buildingsTray').hidden = true;
  },
  available: (c) =>
    running &&
    !paused &&
    c.team === player &&
    (!c.baseId || Sim.baseSites(state, player).some((b) => b.id === c.baseId)),
  clearGhost: () => (buildGhost = null),
  options: (c, category) => {
    if (category === 'economy')
      return c.baseId
        ? [{ name: 'Production des unités', detail: 'Ouvrir', action: 'production' }]
        : [
            {
              name: player ? 'Grande Décharge' : 'Cuisine Centrale',
              detail: '120 rubis',
              kind: 'depot',
            },
          ];
    if (!c.baseId) return [];
    return Sim.BUILDINGS[player]
      .filter((b) =>
        category === 'military'
          ? ['knight', 'archer'].includes(b.unit)
          : category === 'technology'
            ? b.unit === 'mage'
            : false,
      )
      .map((b) => ({ ...b, detail: b.cost + ' rubis', kind: 'building' }));
  },
  action: (c) => {
    selectedProducer = null;
    $('#recruitTray').hidden = false;
    $('#buildingsTray').hidden = true;
    updateUI();
  },
  preview: (context, option) => {
    buildGhost = {
      context,
      option,
      slotId:
        context.slotId ||
        (state.slots[player] || []).find((s) => s.baseId === context.baseId && !s.occupe)?.id,
    };
  },
  ghostStatus,
  confirm: () => {
    if (!ghostStatus().valid) return false;
    const { context, option, slotId } = buildGhost;
    if (net) {
      const sent = sendCommand(
        option.kind === 'depot'
          ? { kind: 'build', index: context.mine }
          : { kind: 'construct', type: option.id, baseId: context.baseId, slotId },
      );
      if (sent) notify('Construction envoyée au serveur');
      return !!sent;
    }
    const ok =
      option.kind === 'depot'
        ? Sim.build(state, player, context.mine)
        : Sim.construct(state, player, option.id, context.baseId, slotId);
    notify(ok ? 'Construction terminée' : 'Construction impossible : emplacement indisponible.');
    updateUI();
    return ok;
  },
});
