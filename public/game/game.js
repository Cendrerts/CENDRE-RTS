import { initProduction, recruitToastText } from './production.js';
import { panelModel, panelVisibility } from './panel.js';
import { readSettings, writeSettings } from './settings.js';
import { bindAudioUnlock } from './audio-unlock.js';
import { shouldAutoPause } from './auto-pause.js';
import { minimapToWorld, clampCamera, attackDirection, groupAttackAlerts } from './camera.js';
'use strict';
import { CuistotsAmbience } from './cuistots-ambience.js';
import { orderFeedback, drawOrderFeedback, vibrateOrder } from './order-feedback.js';
import { UnitVoices, selectionVoice } from './unit-voices.js';
import { createRadialMenu } from './radial.js';
import { armyUnits, armyToastText, groupToastText, filterSelection, cameraBounds, unitsOfType, createPortraitTap, unitsInBox, boxSelection } from './selection.js';
import { createGestures } from './gestures.js';
import { resolveTap, isEmptyTap } from './tap.js';
import { installMobileDisplay } from './mobile-display.js';
import { initTouchUI } from './mobile.js';
import { createControlGroups, groupUnits, assignGroup, initControlGroups } from './control-groups.js';
import { NetworkMotion, pollDelay } from './network-motion.js';
import { RealtimeClient, RealtimeMotion, normalizeRoomCode, networkQuality } from './realtime.js';
let realtime = null;
import { ratSVG, ratSprites } from './rats.js';
import { RatsGout } from './rats-config.js';
import { cookSVG, cookSprites } from './cooks.js';
import { drawMinimap } from './minimap.js';
import { TEAM_COLORS, drawHealthBar, selectionRing, unitFeet, drawCargoRuby, drawMine } from './unit-overlays.js';
import { createRenderCache, prepareDrawList } from './render-cache.js';
import { CendreSim as Sim } from './sim.js';
import { createAI } from './ai.js';
let soloAI = createAI(1);
const { W, H, CELL, COLS, ROWS, TYPES, RULES } = Sim;
const canvas = document.querySelector('#field'),
  ctx = canvas.getContext('2d'),
  $ = (s) => document.querySelector(s),
  mini = $('#minimap'),
  mc = mini.getContext('2d');
const renderCache = createRenderCache(() => document.createElement('canvas'));
const debug = new URLSearchParams(location.search).get('debug') === '1';
const debugDisplay = debug ? document.createElement('output') : null;
if (debugDisplay) {
  debugDisplay.style.cssText = 'position:fixed;top:0;left:0;z-index:9999;background:#080e14;color:white;font:12px monospace;padding:4px;pointer-events:none';
  document.body.append(debugDisplay);
}
let preparedUnits = [];
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
  selectedMine = null;
const portraitTap = createPortraitTap();
let networkGroups = createControlGroups();
let controlGroupsUI;
function controlGroups() {
  if (net) return networkGroups;
  state.controlGroups ??= createControlGroups();
  return state.controlGroups;
}
let settings = readSettings();
const voices = new UnitVoices({ volume: settings.voiceVolume });
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
    ambience.volume = settings.ambienceVolume;
    updateAmbience();
    void ambience.start().catch(console.error);
  } catch (error) {
    console.error(error);
  }
}
const audioButton = document.createElement('button');
audioButton.id = 'audioUnlock';
audioButton.textContent = '🔇';
audioButton.setAttribute('aria-label', 'Activer le son');
audioButton.style.minWidth = '44px';
audioButton.style.minHeight = '44px';
$('#soundSetting').append(audioButton);
bindAudioUnlock({ document, window, button: audioButton, onActive: unlockAmbience });
document.addEventListener('visibilitychange', updateAmbience);
addEventListener('pagehide', () => ambience?.updateCamera({ x: cameraX, y: cameraY }, false));
function playSelectionVoice(units) {
  if (!running || paused) return;
  const voice = selectionVoice(units, player);
  if (voice) void voices.select(voice);
}
function showOrderFeedback(action, point, ids) {
  const feedback = orderFeedback(action);
  if (!feedback || !ids.length) return;
  marker = { ...feedback, ...point, started: performance.now(), targetId: action.target?.id, base: action.target?.base };
  const voice = selectionVoice(state.units.filter((unit) => ids.includes(unit.id)), player);
  if (voice) void voices.acknowledge(voice);
  vibrateOrder(settings.vibration);
}
let radial = null,
  buildGhost = null;
let touchUI = null;
const gestures = createGestures();
const fieldPointers = new Set();
let selectionBox = null;
let holdIndicator = null;
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
  panelContext = {};
  unitNames = player ? ghostNames : cookNames;
}
function layout() {
  scale = Math.max(viewWidth / W, viewHeight / H) * zoom;
  const center = clampCamera(cameraX, cameraY, viewWidth, viewHeight, scale, W, H);
  cameraX = center.x;
  cameraY = center.y;
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
    holdIndicator = null;
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
  panelContext = {};
  buildGhost = null;
  selected.clear();
  selectedMine = null;
  portraitTap.reset();
  updateUI();
  notify('Sélection vidée');
}
function selectType(t, scope = 'all') {
  panelContext = {};
  buildGhost = null;
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

let panelContext = {};
let panelRoot = null;
let panelSignature = '';
let rallyArmed = null;
let panelVisibilityState = {};
let patrolArmed = false;
let queueArmed = false;
let queueSelection = '';
let productionUI = null;

function updateUI() {
  let army = state.units.filter((u) => u.team === player);
  selected = new Set([...selected].filter((id) => army.some((u) => u.id === id)));
  $('#rubies').textContent = Math.floor(state.rubies[player]);
  $('#population').textContent = army.length + ' / 30';
  $('#clock').textContent =
    String(Math.floor(state.time / 60)).padStart(2, '0') +
    ':' +
    String(Math.floor(state.time % 60)).padStart(2, '0');
  $('#towerStatus').textContent =
    state.tower.owner === player
      ? '◉ Tour : vision étendue'
      : state.tower.owner === 1 - player
        ? '◉ Tour : occupée par l’adversaire'
        : '◉ Tour : non contrôlée';
  renderContextPanel();
  productionUI?.refresh(state, player, running);
  touchUI?.refresh();
  controlGroupsUI?.refresh();
  radial?.refresh();

}

$('#chooseHuman').onclick = () => choose(0);
$('#chooseGhost').onclick = () => choose(1);
function choose(t) {
  chosen = t;
  $('#chooseHuman').setAttribute('aria-pressed', String(t === 0));
  $('#chooseGhost').setAttribute('aria-pressed', String(t === 1));
}
const welcomeTitle = $('#modalTitle').textContent;
const welcomeText = $('#modalText').textContent;
const startLabel = $('#start').innerHTML;
$('#matchMenu').onclick = async () => {
  if (net?.finished) await leaveRoom();
  $('#veil').classList.remove('match-ended');
  $('#matchStats')?.remove();
  $('#modalTitle').textContent = welcomeTitle;
  $('#modalText').textContent = welcomeText;
  $('#start').innerHTML = startLabel;
  $('#veil').style.display = 'flex';
};
$('#start').onclick = async () => {
  if (net?.finished) await leaveRoom();
  if (net) {
    notify('Quittez le salon avant de lancer le solo.');
    return;
  }
  $('#veil').classList.remove('match-ended');
  state = Sim.create();
  controlGroupsUI?.reset();
  selected.clear();
  player = chosen;
  soloAI = createAI(1 - player, $('#aiDifficulty').value);
  running = true;
  paused = false;
  zoom = 2.6;
  cameraX = state.bases[player].x + (player ? -50 : 65);
  cameraY = state.bases[player].y + 70;
  layout();
  setupPortraits();
  $('#veil').style.display = 'none';
  $('#pause').textContent = 'Ⅱ';
  updateUI();
  notify('Explorez avec vos unités. Glisser : caméra · Maintenir + glisser : sélection · 2 doigts : zoom');
};
$('#all').onclick = () => {
  panelContext = {};
  const units = state.units.filter((u) => u.team === player);
  selected = new Set(units.map((u) => u.id));
  playSelectionVoice(units);
  updateUI();
};
$('#retreat').onclick = () => {
  patrolArmed = false;
  const ids = [...selected];
  attackMoveArmed = false;
  $('#attackAction').setAttribute('aria-pressed', 'false');
  if (net) sendCommand({ kind: 'retreat', ids });
  else Sim.disengage(state, ids);
  notify('Décrocher · Déplacement sans riposte');
};
$('#hold').onclick = () => {
  patrolArmed = false;
  if (net) {
    sendCommand({ kind: 'hold', ids: [...selected] });
    return;
  }
  state.units
    .filter((u) => selected.has(u.id))
    .forEach((u) => {
      u.orderQueue = [];
      u.queueActive = false;
      u.patrol = null;
      u.manual = null;
      u.followId = null;
      u.harvest = null;
      u.retreat = false;
      u.path = [];
      u.target = null;
      u.hold = true;
    });
  notify('Position tenue · Attaque des ennemis à portée');
};
function applySettings() {
  voices.volume = settings.voiceVolume;
  if (voices.output) voices.output.gain.value = settings.voiceVolume;
  if (ambience) ambience.volume = settings.ambienceVolume;
  document.body.classList.toggle('large-interface', settings.interfaceSize === 'large');
  updateAmbience();
}
$('#vibrationEnabled').checked = settings.vibration;
$('#joystickEnabled').checked = settings.joystick;
$('#voiceVolume').value = settings.voiceVolume * 100;
$('#ambienceVolume').value = settings.ambienceVolume * 100;
$('#interfaceSize').value = settings.interfaceSize;
for (const id of ['vibrationEnabled', 'joystickEnabled', 'voiceVolume', 'ambienceVolume', 'interfaceSize']) {
  $('#' + id).addEventListener('input', () => {
    settings = writeSettings({
      vibration: $('#vibrationEnabled').checked,
      joystick: $('#joystickEnabled').checked,
      voiceVolume: Number($('#voiceVolume').value) / 100,
      ambienceVolume: Number($('#ambienceVolume').value) / 100,
      interfaceSize: $('#interfaceSize').value,
    });
    applySettings();
  });
}
applySettings();
function closePauseMenu() {
  if ($('#pauseMenu').hidden) return;
  $('#pauseMenu').hidden = true;
  if (!net) paused = false;
  updateAmbience();
  $('#pause').focus();
}
function openPauseMenu() {
  if (!running) return;
  touchUI?.stop();
  radial?.close();
  $('#pauseMenu').hidden = false;
  $('#settingsPanel').hidden = true;
  $('#pauseActions').hidden = false;
  $('#pauseTitle').textContent = 'Pause';
  $('#pauseStatus').textContent = net ? 'Partie en cours' : 'Partie en pause';
  $('#quitGame').textContent = net ? 'Quitter le duel' : 'Quitter la partie';
  if (!net) paused = true;
  updateAmbience();
  $('#resumeGame').focus();
}
$('#pause').onclick = () => {
  if (!$('#pauseMenu').hidden) {
    closePauseMenu();
    return;
  }
  openPauseMenu();
};
function autoPause(hidden) {
  if (shouldAutoPause({ multiplayer: !!net, hidden, running, paused })) {
    openPauseMenu();
  }
}
document.addEventListener('visibilitychange', () => autoPause(document.visibilityState === 'hidden'));
window.addEventListener('pagehide', () => autoPause(true));
$('#closePause').onclick = closePauseMenu;
$('#resumeGame').onclick = closePauseMenu;
$('#pauseMenu').onclick = (event) => {
  if (event.target === $('#pauseMenu')) closePauseMenu();
};
$('#openSettings').onclick = () => {
  $('#pauseActions').hidden = true;
  $('#settingsPanel').hidden = false;
  $('#pauseTitle').textContent = 'Réglages';
  $('#vibrationEnabled').focus();
};
$('#backPause').onclick = () => {
  $('#settingsPanel').hidden = true;
  $('#pauseActions').hidden = false;
  $('#pauseTitle').textContent = 'Pause';
  $('#openSettings').focus();
};
$('#quitGame').onclick = () => {
  if (net) {
    if (confirm('Quitter le duel ? Cela compte comme un abandon.')) {
      closePauseMenu();
      void leaveRoom();
    }
    return;
  }
  closePauseMenu();
  running = false;
  selected.clear();
  $('#veil').style.display = 'flex';
  updateAmbience();
  updateUI();
};
window.addEventListener(
  'keydown',
  (event) => {
    if ($('#pauseMenu').hidden) return;
    event.stopImmediatePropagation();
    if (event.key === 'Escape') closePauseMenu();
    if (event.key === 'Tab') {
      const controls = [...$('#pauseMenu').querySelectorAll('button, input, select')].filter(
        (element) => element.getClientRects().length && !element.disabled,
      );
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  },
  true,
);
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
  applyFieldGesture(action);
  if (action?.kind === 'tap') handleFieldTap(e, action.duration);
}
function applyFieldGesture(action) {
  if (!action) return;
  if (action.kind === 'hold') {
    holdIndicator = action;
    if (action.ready) vibrateOrder(settings.vibration);
    return;
  }
  holdIndicator = null;
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
      panelContext = {};
      buildGhost = null;
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
let tapFlash = null;
function handleFieldTap(e, duration) {
  let p = world(e);
  if (buildGhost && !radial?.isGhost) {
    const slot = state.slots[player].find((item) => !item.occupe && item.baseId === buildGhost.context.baseId && Math.hypot(item.x - p.x, item.y - p.y) < 30);
    if (slot) {
      panelCommand({ kind: 'construct', type: buildGhost.option.id, baseId: slot.baseId, slotId: slot.id });
      buildGhost = null;
    }
    return;
  }
  if (radial?.isGhost) {
    pickGhostSlot(p);
    return;
  }
  const openedBuilding = openedRallyBuilding();
  if (openedBuilding && (rallyArmed === openedBuilding.id ||
      (duration >= 550 && isEmptyTap(state, player, p, scale)))) {
    let target = null;
    resolveTap(state, player, new Set(), p, scale, (candidate) => { target = candidate; });
    const command = { kind: 'setRally', buildingId: openedBuilding.id, x: p.x, y: p.y };
    if (target?.category === 'mine' && target.target.owner === player) {
      command.mineIndex = state.mines.indexOf(target.target);
    } else if (target?.action.kind === 'select') {
      command.unitId = target.target.id;
    }
    rallyArmed = null;
    panelCommand(command);
    return;
  }
  if (duration >= 550 && isEmptyTap(state, player, p, scale)) {
    clearSelection();
    return;
  }
  const resolved = resolveTap(state, player, selected, p, scale, (target) => {
    tapFlash = { ...target, started: performance.now() };
  });
  const action =
    (attackMoveArmed || patrolArmed) &&
    selected.size &&
    !['select', 'radial', 'production', 'enemyBase'].includes(resolved.kind)
      ? { kind: 'move' }
      : resolved;
  if (action.kind === 'radial') {
    if (action.context.mine !== undefined) selectedMine = action.context.mine;
    selected.clear();
    panelContext = { ...action.context, bases: !action.context.baseId };
    panelVisibilityState = panelVisibility(panelVisibilityState, 'building');
    updateUI();
    return;
  }
  if (action.kind === 'enemyBase') {
    selectedMine = action.index;
    notify('Base adverse');
    return;
  }
  if (action.kind === 'production') {
    selected.clear();
    panelContext = { producerId: action.id };
    panelVisibilityState = panelVisibility(panelVisibilityState, 'building');
    updateUI();
    return;
  }
  if (action.kind === 'select') {
    panelContext = {};
    buildGhost = null;
    selected = new Set([action.id]);
    playSelectionVoice(state.units.filter((unit) => unit.id === action.id));
    updateUI();
    return;
  }
  if (action.kind === 'gather') {
    showOrderFeedback(action, state.mines[action.index], action.ids);
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
    const feedbackAction = {
      ...action,
      kind: patrolArmed ? 'patrol' : attackMoveArmed ? 'attackMove' : action.kind,
    };
    showOrderFeedback(feedbackAction, target || p, [...selected]);
    if (net) {
      sendCommand({
        kind: patrolArmed ? 'patrol' : attackMoveArmed ? 'attackMove' : 'move',
        ids: [...selected],
        x: p.x,
        y: p.y,
        queue: queueArmed && !patrolArmed && !target,
        target: target ? (target.base ? { base: true } : { id: target.id }) : null,
      });
    } else if (patrolArmed) Sim.patrol(state, [...selected], p.x, p.y);
    else Sim.order(state, [...selected], p.x, p.y, target, !target && !attackMoveArmed, queueArmed && !target);
    patrolArmed = false;
    attackMoveArmed = false;
    $('#attackAction').setAttribute('aria-pressed', 'false');
  } else notify('Sélectionnez vos unités avec les portraits en bas.');
}
let minimapGesture = null;
function minimapPosition(e) {
  const rect = mini.getBoundingClientRect();
  return minimapToWorld(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, W, H);
}
function focusMinimap(point) {
  cameraX = point.x;
  cameraY = point.y;
  layout();
}
function cancelMinimap() {
  clearTimeout(minimapGesture?.timer);
  minimapGesture = null;
}
mini.addEventListener('pointerdown', (e) => {
  if (minimapGesture) return;
  e.preventDefault();
  mini.setPointerCapture(e.pointerId);
  const gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, point: minimapPosition(e), dragged: false, ordered: false };
  minimapGesture = gesture;
  // Delay the initial jump only when a long press could issue an order.
  if (!selected.size) focusMinimap(gesture.point);
  gesture.timer = setTimeout(() => {
    if (!running || paused || !selected.size || gesture.dragged) return;
    const ids = state.units.filter((unit) => selected.has(unit.id) && unit.team === player && unit.hp > 0).map((unit) => unit.id);
    if (!ids.length) return;
    const action = { kind: 'move', ids, ...gesture.point };
    showOrderFeedback(action, gesture.point, ids);
    marker.minimap = true;
    if (net) sendCommand(action);
    else Sim.order(state, ids, action.x, action.y, null, true);
    gesture.ordered = true;
  }, 550);
});
mini.addEventListener('pointermove', (e) => {
  const gesture = minimapGesture;
  if (!gesture || gesture.id !== e.pointerId || gesture.ordered) return;
  gesture.point = minimapPosition(e);
  if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) >= 8) {
    gesture.dragged = true;
    clearTimeout(gesture.timer);
  }
  if (gesture.dragged) focusMinimap(gesture.point);
});
mini.addEventListener('pointerup', (e) => {
  if (minimapGesture?.id !== e.pointerId) return;
  if (!minimapGesture.ordered) focusMinimap(minimapPosition(e));
  cancelMinimap();
});
for (const event of ['pointercancel', 'lostpointercapture']) {
  mini.addEventListener(event, (e) => {
    if (minimapGesture?.id === e.pointerId) cancelMinimap();
  });
}
addEventListener('blur', cancelMinimap);

let attackAlerts = [];
let lastDamageTime = -Infinity;
let previousAlertTime = 0;
const alertButtons = new Map();
function updateAttackAlerts() {
  if (state.time < previousAlertTime || !running) {
    attackAlerts = [];
    lastDamageTime = -Infinity;
  }
  previousAlertTime = state.time;
  const camera = { x: cameraX, y: cameraY };
  if (running && !paused) {
    for (const event of state.damageEvents || []) {
      if (event.team !== player || event.time <= lastDamageTime) continue;
      if (attackDirection(event, camera, viewWidth, viewHeight, scale)) {
        attackAlerts = groupAttackAlerts(attackAlerts, event, event.time);
      }
    }
    lastDamageTime = state.time;
  }
  attackAlerts = attackAlerts.filter((alert) => state.time - alert.time < 5);
  const active = new Set();
  const rect = canvas.getBoundingClientRect();
  for (const alert of attackAlerts) {
    const direction = attackDirection(alert, camera, viewWidth, viewHeight, scale);
    if (!direction || !running || paused) continue;
    active.add(alert.zone);
    let button = alertButtons.get(alert.zone);
    if (!button) {
      button = document.createElement('button');
      button.className = 'attack-alert';
      button.textContent = '➤';
      button.setAttribute('aria-label', 'Attaque hors écran : centrer la caméra');
      document.body.append(button);
      alertButtons.set(alert.zone, button);
    }
    button.onclick = () => focusMinimap(alert);
    button.style.left = `${rect.left + direction.x}px`;
    button.style.top = `${rect.top + direction.y}px`;
    button.style.transform = `translate(-50%, -50%) rotate(${direction.angle}rad)`;
  }
  for (const [zone, button] of alertButtons) {
    if (active.has(zone)) continue;
    button.remove();
    alertButtons.delete(zone);
  }
}
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
function finish() {
  closePauseMenu();
  running = false;
  if (net)
    $('#roomStatus').textContent = 'Duel terminé. Quittez le salon pour en créer un nouveau.';
  $('#modalTitle').textContent = state.winner === player ? 'Victoire !' : 'Votre base est tombée';
  $('#modalText').textContent =
    'La bataille est terminée. Changez de camp ou relancez pour essayer une autre stratégie.';
  const result = Sim.matchStats(state);
  const minutes = Math.floor(result.duration / 60);
  const seconds = Math.floor(result.duration % 60);
  const table = document.createElement('table');
  table.id = 'matchStats';
  const caption = table.createCaption();
  caption.textContent = 'Durée : ' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  const header = table.createTHead().insertRow();
  for (const label of ['Statistiques', 'Vous', 'Adversaire']) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = label;
    header.append(cell);
  }
  const body = table.createTBody();
  for (const [key, label] of [
    ['rubiesCollected', 'Rubis récoltés'],
    ['unitsProduced', 'Unités produites'],
    ['unitsLost', 'Unités perdues'],
    ['unitsKilled', 'Unités tuées'],
    ['buildingsDestroyed', 'Bâtiments détruits'],
  ]) {
    const row = body.insertRow();
    const heading = document.createElement('th');
    heading.scope = 'row';
    heading.textContent = label;
    row.append(heading);
    for (const team of [player, 1 - player]) {
      row.insertCell().textContent = result.teams[team][key];
    }
  }
  $('#matchStats')?.remove();
  $('#modalTitle').after(table);
  $('#veil').classList.add('match-ended');
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
}
function unit(u) {
  drawCook(u);
}
function drawFog() {
  renderCache.updateFog(fc, state.visible[player], state.explored[player], COLS);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(fog, 0, 0, W, H);
}
function drawMini() {
  drawMinimap(mc, {
    terrain,
    fog,
    units: preparedUnits,
    mines: state.mines.filter((mine) => Sim.visibleAt(state, player, mine.x, mine.y)),
    camera: { x: -ox / scale, y: -oy / scale, width: viewWidth / scale, height: viewHeight / scale },
    player,
    worldWidth: W,
    worldHeight: H,
  });
  if (marker?.minimap) {
    mc.save();
    mc.strokeStyle = marker.color;
    mc.lineWidth = 2;
    mc.beginPath();
    mc.arc(marker.x / W * mini.width, marker.y / H * mini.height, 6, 0, Math.PI * 2);
    mc.stroke();
    mc.restore();
  }
}
function draw() {
  ctx.setTransform(canvas.width / viewWidth, 0, 0, canvas.height / viewHeight, 0, 0);
  const dpr = canvas.width / viewWidth;
  const background = renderCache.terrain(terrain, canvas.width, canvas.height, ox * dpr, oy * dpr, scale * dpr, W, H);
  ctx.drawImage(background, 0, 0, viewWidth, viewHeight);
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  drawExpansionSites();
  for (const mine of state.mines) {
    const cellIndex = Math.floor(mine.y / CELL) * COLS + Math.floor(mine.x / CELL);
    if (state.explored[player][cellIndex]) drawMine(ctx, mine, scale, performance.now() / 1000);
  }
  for (let m of state.mines) {
    if (state.mines[selectedMine] !== m || !Sim.visibleAt(state, player, m.x, m.y)) continue;
    ctx.strokeStyle = m.owner === player ? '#aac9f5' : m.owner === -1 ? '#d6b579' : '#6ee2ba';
    ctx.lineWidth = 1 / scale;
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, 42, 22, 0, 0, 7);
    ctx.stroke();
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
  drawRally();
  preparedUnits.forEach(unit);
  for (let b of state.bases)
    if (Sim.canSee(state, player, b)) {
      bar(b.x, b.y - 80, b.hp, b.max, 85);
    }
  for (let s of state.shots)
    if (Sim.visibleAt(state, player, s.x, s.y) && Sim.visibleAt(state, player, s.tx, s.ty))
      line(s.x, s.y, s.tx, s.ty, s.team ? '#8ef1ce' : '#ffd388', 2);
  drawFog();
  drawOrderQueues();
  if (marker) {
    const elapsed = (performance.now() - marker.started) / 1000;
    const target = marker.base ? state.bases[1 - player] : state.units.find((unit) => unit.id === marker.targetId);
    const position = target && Sim.canSee(state, player, target) ? (net ? motion.position(target, performance.now()) : target) : marker;
    drawOrderFeedback(ctx, { ...marker, x: position.x, y: position.y }, elapsed, scale);
    if (elapsed >= marker.duration) marker = null;
  }
  if (tapFlash) {
    const elapsed = performance.now() - tapFlash.started;
    if (elapsed >= 280) tapFlash = null;
    else {
      ctx.save();
      ctx.strokeStyle = '#fff0a6';
      ctx.globalAlpha = Math.sin(Math.PI * elapsed / 280);
      ctx.lineWidth = 3 / scale;
      const { target, bounds, radius, center, sprite } = tapFlash;
      if (sprite) {
        const halfWidth = Math.max(bounds.width / 2, radius / scale);
        const halfHeight = Math.max(bounds.height / 2, radius / scale);
        ctx.strokeRect(center.x - halfWidth, center.y - halfHeight, halfWidth * 2, halfHeight * 2);
      } else if (bounds) ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      else {
        ctx.beginPath();
        ctx.arc(target.x, target.y, radius / scale, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  drawBuildGhost();
  drawMini();
  if (holdIndicator) {
    ctx.save();
    ctx.setTransform(canvas.width / viewWidth, 0, 0, canvas.height / viewHeight, 0, 0);
    ctx.beginPath();
    ctx.moveTo(holdIndicator.x, holdIndicator.y);
    ctx.arc(holdIndicator.x, holdIndicator.y, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * holdIndicator.progress);
    ctx.closePath();
    ctx.fillStyle = '#8ef1ce88';
    ctx.fill();
    ctx.restore();
  }
  if (selectionBox) {
    ctx.save();
    ctx.setTransform(canvas.width / viewWidth, 0, 0, canvas.height / viewHeight, 0, 0);
    const { start, end } = selectionBox;
    ctx.fillStyle = '#8ef1ce22';
    ctx.strokeStyle = '#8ef1ce';
    ctx.lineWidth = 2;
    ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    ctx.restore();
  }
}
setupPortraits();
updateUI();
function frame(t) {
  const frameStarted = debug ? performance.now() : 0;
  const interval = t - last;
  let dt = Math.min((t - last) / 1000, 0.05);
  last = t;
  touchUI?.tick(dt);
  if (running && !paused) applyFieldGesture(gestures.tick(t, dt));
  if (running && !paused) {
    if (!net) {
      soloAI.update(state);
      Sim.tick(state, dt);
    }
    if (state.winner !== null) finish();
    if (toastTime > 0 && (toastTime -= dt) <= 0) $('#toast').textContent = '';
  }
  lastUI += dt;
  if (lastUI > 0.15) {
    updateUI();
    lastUI = 0;
  }
  updateAmbience();
  updateAttackAlerts();
  preparedUnits = prepareDrawList(state, player, Sim.canSee);
  draw();
  if (debugDisplay) {
    debugDisplay.textContent = `${Math.round(1000 / interval)} FPS · ${(performance.now() - frameStarted).toFixed(2)} ms/image`;
  }
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
  if (connected) $('#veil').classList.remove('invitation');
  $('#lobby').hidden = !connected;
  for (const id of ['start', 'createRoom', 'joinRoom', 'chooseHuman', 'chooseGhost', 'roomInput'])
    $('#' + id).disabled = connected;
  $('#leaveMatch').hidden = true;
  $('#netBadge').hidden = !connected;
}
function resetNetwork() {
  clearTimeout(netTimer);
  realtime?.close();
  realtime = null;
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
    motion.receive(data.state.units, performance.now(), data.state.time);
    state = data.state;
  }
  if (data.error) notify(data.error);
  const labels = {
    waiting: 'En attente de votre ami…',
    countdown: 'Début du duel dans ' + data.countdown + '…',
    playing: '1v1 · Connecté',
    disconnected: 'Adversaire déconnecté – ' + data.disconnectCountdown + ' s',
    ended: 'Duel terminé',
  };
  $('#roomStatus').textContent = labels[data.status] || 'Connexion…';
  $('#netBadge').textContent =
    (labels[data.status] || 'Connexion…') +
    (data.status === 'playing' ? ' · ' + Math.round(lastRtt) + ' ms' : '');
  $('#netBadge').dataset.quality = networkQuality(lastRtt);
  $('#networkError').textContent = '';
  if (['playing', 'disconnected'].includes(data.status) && !net.begun) {
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
    $('#pause').disabled = false;
    notify('Duel commencé · Détruisez la base adverse.');
  }
  if (data.status === 'ended' && state.winner !== null && !net.finished) {
    net.finished = true;
    finish();
    if (data.reason === 'déconnexion') {
      $('#modalTitle').textContent = state.winner === player ? 'Victoire par déconnexion' : 'Défaite par déconnexion';
      $('#modalText').textContent = 'Le délai de reconnexion de 30 secondes est écoulé.';
    }
  }
  paused = !['playing', 'disconnected'].includes(data.status);
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
async function connectRealtime(parameters) {
  const client = new RealtimeClient({
    onSnapshot: showSnapshot,
    onRtt: (rtt) => {
      lastRtt = rtt;
      $('#netBadge').dataset.quality = networkQuality(rtt);
    },
    onStatus: (status) => {
      if (status === 'reconnecting') {
        $('#netBadge').textContent = 'Reconnexion…';
        $('#netBadge').dataset.quality = 'poor';
      } else if (status !== 'connected') {
        notify(status);
      }
    },
  });
  realtime = client;
  motion = new RealtimeMotion();
  try {
    const data = await client.connect(parameters);
    return data;
  } catch (error) {
    client.close();
    realtime = null;
    motion = new NetworkMotion();
    throw error;
  }
}
function sendCommand(command) {
  if (!net || paused || !running) {
    notify('Connexion en cours, patientez.');
    return;
  }
  if (realtime) {
    if (!realtime.command(command, ++seq)) return false;
    motion.predict(command, state, player, performance.now());
    persistRoom();
    return true;
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
  $('#veil').classList.remove('invitation');
  $('#networkError').textContent = 'Connexion au salon…';
  $('#createRoom').disabled = true;
  $('#joinRoom').disabled = true;
  try {
    const parameters = {
      action,
      team: chosen,
      code: normalizeRoomCode($('#roomInput').value),
    };
    let data;
    try {
      data = await connectRealtime(parameters);
    } catch {
      data = await requestMatch(parameters);
    }
    net = { code: data.code, token: data.token, team: data.team, begun: false, finished: false };
    seq = 0;
    persistRoom();
    lobbyControls(true);
    $('#roomCode').textContent = 'SALON ' + data.code;
    showSnapshot(data);
    if (!realtime) pollRoom();
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
  const link = new URL('/game/', location.origin);
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
  const wasRealtime = Boolean(realtime);
  realtime?.send({ type: 'leave' });
  resetNetwork();
  running = false;
  paused = false;
  $('#veil').style.display = 'flex';
  $('#veil').classList.remove('match-ended');
  $('#modalTitle').textContent = 'Explorez. Occupez. Conquérez.';
  $('#modalText').textContent = 'Créez un nouveau duel ou lancez une escarmouche solo.';
  try {
    if (!wasRealtime) await requestMatch({ action: 'leave', code: old.code, token: old.token });
  } catch {
    notify('Salon quitté. Une déconnexion prolongée compte comme un abandon.');
  }
}
$('#cancelRoom').onclick = leaveRoom;
$('#leaveMatch').onclick = () => {
  if (!running || confirm('Quitter le duel ? Cela compte comme un abandon.')) leaveRoom();
};
const invite = normalizeRoomCode(new URL(location.href).searchParams.get('room'));
if (invite) {
  $('#roomInput').value = invite;
  $('#modalTitle').textContent = 'Rejoindre le duel ?';
  $('#modalText').textContent = 'SALON ' + invite;
  $('#veil').classList.add('invitation');
  $('#joinRoom').textContent = 'Rejoindre le duel';
}

try {
  const saved = JSON.parse(sessionStorage.getItem(savedKey) || 'null');
  if (saved?.token && (!invite || saved.code === invite)) {
    net = { ...saved, begun: false, finished: false };
    seq = saved.seq || 0;
    lobbyControls(true);
    $('#roomCode').textContent = 'SALON ' + net.code;
    connectRealtime({ code: net.code, token: net.token }).catch(() => pollRoom());
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
  const feet = unitFeet(x, y, size, u.team);
  if (selected.has(u.id)) selectionRing(ctx, feet, size, scale, u.team);
  const img = (u.team === 1 ? ratSprites : cookSprites)[u.type];
  const sprite = renderCache.sprite(img, u.type, u.team, scale * canvas.width / viewWidth, size, size * 1.125);
  if (sprite) ctx.drawImage(sprite, x - size / 2, y - size + 5 + bob, size, size * 1.125);
  const headY = y - size + bob;
  drawCargoRuby(ctx, x, headY, scale, u);
  drawHealthBar(ctx, u, x, headY, scale, player, selected.has(u.id));
}

function openedRallyBuilding() {
  if (panelVisibilityState.collapsed) return null;
  const id = panelContext.producerId || (!panelContext.slotId && panelContext.baseId);
  const building = id && Sim.rallyBuilding(state, player, id);
  return building ? { id, building } : null;
}
function drawOrderQueues() {
  ctx.save();
  ctx.strokeStyle = TEAM_COLORS[player];
  ctx.lineWidth = 1.5 / scale;
  ctx.setLineDash([6 / scale, 5 / scale]);
  for (const unit of state.units) {
    if (!selected.has(unit.id) || unit.team !== player || !unit.orderQueue?.length) continue;
    ctx.beginPath();
    ctx.moveTo(unit.x, unit.y);
    if (!unit.queueActive && unit.path.length) {
      const destination = unit.path.at(-1);
      ctx.lineTo(destination.x, destination.y);
    }
    for (const point of unit.orderQueue) ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const point of unit.orderQueue) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4 / scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([6 / scale, 5 / scale]);
  }
  ctx.restore();
}

function drawRally() {
  const opened = openedRallyBuilding();
  const point = Sim.rallyPoint(state, opened?.building.rally);
  if (!opened || !point) return;
  ctx.save();
  ctx.strokeStyle = TEAM_COLORS[player];
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 4 / scale;
  ctx.strokeStyle = '#101819';
  ctx.setLineDash([6 / scale, 5 / scale]);
  ctx.beginPath();
  ctx.moveTo(opened.building.x, opened.building.y);
  ctx.lineTo(point.x, point.y);
  ctx.stroke();
  ctx.strokeStyle = TEAM_COLORS[player];
  ctx.lineWidth = 2 / scale;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 2 / scale;
  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
  ctx.lineTo(point.x, point.y - 23 / scale);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(point.x, point.y - 23 / scale);
  ctx.lineTo(point.x + 14 / scale, point.y - 18 / scale);
  ctx.lineTo(point.x, point.y - 13 / scale);
  ctx.fill();
  ctx.restore();
}

function drawSlots() {
  for (const slots of state.slots || [])
    for (const s of slots) {
      if (s.team !== player && !Sim.visibleAt(state, player, s.x, s.y)) continue;
      const { x, y } = s;
      ctx.save();
      const chosen = s.team === player && s.id === panelContext.slotId && !s.occupe;
      ctx.lineWidth = chosen ? 3 : 1.5;
      if (chosen) {
        ctx.shadowColor = '#fff0a6';
        ctx.shadowBlur = 16;
      }
      ctx.setLineDash(s.occupe || chosen ? [] : [3, 3]);
      poly(
        [
          [x - 23, y],
          [x, y - 12],
          [x + 23, y],
          [x, y + 12],
        ],
        '#0b171cbb',
        chosen ? '#fff0a6' : s.team ? '#a8cb65' : '#d6b77e',
      );
      ctx.setLineDash([]);
      if (s.occupe) {
        const index = Sim.BUILDINGS[s.team].findIndex((b) => b.id === s.batiment.type);
        drawFactionBuilding(x, y, s.team, index, 0.65);
      } else if (s.team === player) {
        line(x - 4, y, x + 4, y, '#e3c891');
        line(x, y - 4, x, y + 4, '#e3c891');
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
    if (m.depot) {
      drawFactionBuilding(x, y, m.owner, 3, 0.95);
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

// Touch controls use the same authoritative simulation commands as desktop orders.
touchUI = initTouchUI({
  get: () => ({ state, selected, player, running, paused, net: !!net }),
  steer: (ids, dx, dy) => {
    if (net) sendCommand({ kind: 'steer', ids, dx, dy });
    else Sim.steer(state, ids, dx, dy);
  },
  attack: () => {
    patrolArmed = false;
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

const selectionToggle = document.createElement('button');
selectionToggle.id = 'selectionToggle';
selectionToggle.textContent = '⬚ Sélection';
selectionToggle.setAttribute('aria-pressed', 'false');
selectionToggle.onclick = () => {
  const active = selectionToggle.getAttribute('aria-pressed') !== 'true';
  selectionToggle.setAttribute('aria-pressed', String(active));
  gestures.setSelectionMode(active);
  selectionBox = null;
  holdIndicator = null;
};
$('#touchControls').append(selectionToggle);
controlGroupsUI = initControlGroups({
  enabled: () => running && !paused,
  units: (index) => groupUnits(controlGroups(), index, state.units, player),
  icon: portraitFor,
  assign: (index, { quiet = false } = {}) => {
    const units = assignGroup(controlGroups(), index, selected, state.units, player);
    if (!quiet) notify(groupToastText(index, units.length));
  },
  select: (index, center) => {
    const units = groupUnits(controlGroups(), index, state.units, player);
    panelContext = {};
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

const armyButton = document.createElement('button');
armyButton.id = 'armySelect';
armyButton.type = 'button';
armyButton.textContent = 'Armée';
armyButton.onclick = () => {
  if (!running || paused) return;
  const units = armyUnits(state.units, player);
  if (!units.length) {
    notify('Aucune unité de combat');
    return;
  }
  panelContext = {};
  buildGhost = null;
  selected = new Set(units.map((unit) => unit.id));
  selectedMine = null;
  portraitTap.reset();
  playSelectionVoice(units);
  updateUI();
  notify(armyToastText(units.length));
};
$('#controlGroups').append(armyButton);

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
    panelContext = { producerId: c.baseId || 'main_' + player };
    panelVisibilityState = panelVisibility(panelVisibilityState, 'building');
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

// The contextual panel owns the visible controls.
panelRoot = document.createElement('section');
panelRoot.id = 'contextPanel';
panelRoot.setAttribute('aria-label', 'Panneau contextuel');
panelRoot.innerHTML =
  '<div class="context-left"><div id="contextIdentity"></div><div id="contextGroups"></div></div><div class="context-center"><div id="contextTabs"></div><div id="contextGrid"></div></div><div id="contextActions"></div>';
document.body.append(panelRoot);
$('#contextGroups').append($('#controlGroups'), $('#all'));
$('#combatActions').append($('#baseAction'), selectionToggle, $('#attackAction'));
const idleButton = document.createElement('button');
idleButton.id = 'idleWorkers';
idleButton.hidden = true;
panelRoot.append(idleButton);
let lastIdleWorkerId = null;
let idlePressTimer = null;
let idleLongPress = false;
function selectIdleWorkers(all = false) {
  const workers = Sim.idleWorkers(state, player);
  if (!workers.length) return;
  const next = workers.find((unit) => unit.id > (lastIdleWorkerId ?? -1)) || workers[0];
  const units = all ? workers : [next];
  selected = new Set(units.map((unit) => unit.id));
  lastIdleWorkerId = next.id;
  selectedMine = null;
  panelContext = {};
  cameraX = next.x;
  cameraY = next.y;
  layout();
  updateUI();
}
idleButton.addEventListener('pointerdown', (event) => {
  event.stopPropagation();
  idleButton.setPointerCapture(event.pointerId);
  idleLongPress = false;
  idlePressTimer = setTimeout(() => {
    idleLongPress = true;
    selectIdleWorkers(true);
  }, 550);
});
idleButton.addEventListener('pointerup', (event) => {
  event.stopPropagation();
  clearTimeout(idlePressTimer);
  if (!idleLongPress) selectIdleWorkers();
});
idleButton.addEventListener('pointercancel', () => clearTimeout(idlePressTimer));
idleButton.addEventListener('click', (event) => {
  if (event.detail === 0) selectIdleWorkers();
});
idleButton.addEventListener('contextmenu', (event) => event.preventDefault());
const panelChevron = document.createElement('button');
panelChevron.id = 'panelChevron';
panelChevron.setAttribute('aria-label', 'Replier le panneau');
panelChevron.textContent = '⌄';
panelRoot.append(panelChevron);
const panelTab = document.createElement('button');
panelTab.id = 'panelTab';
panelTab.setAttribute('aria-label', 'Ouvrir le panneau');
panelTab.textContent = '⌃';
panelRoot.append(panelTab);
function changePanelVisibility(event) {
  panelVisibilityState = panelVisibility(panelVisibilityState, event);
  updateUI();
}
panelChevron.onclick = () => changePanelVisibility('collapse');
panelTab.onclick = () => changePanelVisibility('expand');
let panelSwipe = null;
let panelSwiped = false;
panelRoot.addEventListener('pointerdown', (event) => {
  panelSwiped = false;
  panelSwipe = { x: event.clientX, y: event.clientY };
});
panelRoot.addEventListener('pointerup', (event) => {
  if (
    panelSwipe &&
    event.clientY - panelSwipe.y > 35 &&
    Math.abs(event.clientX - panelSwipe.x) < 60
  ) {
    panelSwiped = true;
    changePanelVisibility('collapse');
  }
  panelSwipe = null;
});
panelRoot.addEventListener('click', (event) => {
  if (!panelSwiped) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);
panelRoot.addEventListener('pointercancel', () => {
  panelSwipe = null;
});
$('#baseAction').onclick = () => {
  selected.clear();
  panelContext = { baseId: 'main_' + player };
  panelVisibilityState = panelVisibility(panelVisibilityState, 'building');
  cameraX = state.bases[player].x;
  cameraY = state.bases[player].y;
  layout();
  updateUI();
};
function requestRecruit(command, count = 1) {
  if (!running || paused) return;
  const preview = net ? structuredClone(state) : state;
  let launched = 0;
  let reason = null;
  for (let index = 0; index < count; index++) {
    reason = Sim.recruitBlockReason(preview, player, command.type, command.producerId);
    if (reason) break;
    if (net && !sendCommand(command)) break;
    if (!Sim.recruit(preview, command.type, player, command.producerId)) break;
    launched++;
  }
  if (reason) {
    const population = preview.units.filter((unit) => unit.team === player).length + preview.queues[player].length;
    const missing = Math.max(0, Sim.stats(command.type, player).cost - preview.rubies[player]);
    const messages = {
      population: `Population pleine (${population} / ${Sim.populationCap(preview, player)})`,
      queues: 'Files pleines',
      rubies: `Rubis insuffisants : il manque ${missing}`,
      producer: 'Aucun bâtiment pour cette unité',
    };
    notify(recruitToastText(launched, messages[reason]));
    toastTime = 3;
  }
  updateUI();
}
function panelCommand(command) {
  if (!running || paused) return;
  if (command.kind === 'recruit') {
    requestRecruit(command);
    return;
  }
  if (net) sendCommand(command);
  else if (command.kind === 'setRally') Sim.setRally(state, player, command);
  else if (command.kind === 'construct')
    Sim.construct(state, player, command.type, command.baseId, command.slotId);
  else if (command.kind === 'build') Sim.build(state, player, command.index);
  else if (command.kind === 'cancelProduction')
    Sim.cancelProduction(state, player, command.producerId, command.jobId);
  updateUI();
}
function renderContextPanel() {
  if (!panelRoot) return;
  const selectedSlot = state.slots[player].find((slot) => slot.id === panelContext.slotId);
  if (selectedSlot?.occupe) {
    panelContext = { producerId: selectedSlot.id };
    panelVisibilityState = panelVisibility(panelVisibilityState, 'building');
  }
  panelVisibilityState = panelVisibility(panelVisibilityState);
  if (rallyArmed && openedRallyBuilding()?.id !== rallyArmed) rallyArmed = null;
  const selectionKey = [...selected].sort((a, b) => a - b).join(',');
  if (selectionKey !== queueSelection || !selectionKey) queueArmed = false;
  queueSelection = selectionKey;
  const model = panelModel(state, player, selected, {
    ...panelContext,
    width: innerWidth,
    visibility: panelVisibilityState,
  });
  const idleCount = Sim.idleWorkers(state, player).length;
  idleButton.hidden = idleCount === 0;
  idleButton.textContent = `⚒ Ouvrier inactif · ${idleCount}`;
  idleButton.setAttribute('aria-label', `Ouvrier inactif : ${idleCount}. Appui long : tous`);
  panelRoot.dataset.collapsed = String(model.collapsed);
  panelRoot.hidden = !running;
  panelRoot.dataset.mode = model.mode;
  for (const job of model.queue) {
    const progress = panelRoot.querySelector(`[data-job-id="${job.id}"] progress`);
    if (progress) progress.value = job.total - job.remaining;
  }
  const currentStatus = $('#contextIdentity .unit-status');
  if (currentStatus) currentStatus.textContent = model.left.status;
  const currentHealth = $('#contextIdentity progress');
  if (currentHealth) currentHealth.value = model.left.hp;
  const currentHealthText = $('#contextIdentity .health-text');
  if (currentHealthText)
    currentHealthText.textContent = `${Math.ceil(model.left.hp)}/${Math.ceil(model.left.max)}`;
  const signature = JSON.stringify([model, paused, patrolArmed, rallyArmed, queueArmed], (key, value) =>
    ['remaining', 'hp', 'status'].includes(key) ? undefined : value,
  );
  if (signature === panelSignature) return;
  panelSignature = signature;
  const identity = $('#contextIdentity');
  identity.replaceChildren();
  const portrait = document.createElement('div');
  portrait.innerHTML = portraitFor(model.left.type);
  const label = document.createElement('div');
  label.textContent = `${model.left.count > 1 ? model.left.count + ' ' : ''}${model.left.name}`;
  const status = document.createElement('small');
  status.className = 'unit-status';
  status.textContent = model.left.status;
  label.append(status);
  if (model.mode === 'base' || model.mode === 'production') {
    portrait.textContent = model.mode === 'base' ? '⌂' : '⚒';
    portrait.className = 'building-portrait';
  }
  const health = document.createElement('progress');
  health.max = model.left.max;
  health.value = model.left.hp;
  const healthText = document.createElement('small');
  healthText.className = 'health-text';
  healthText.textContent = `${Math.ceil(model.left.hp)}/${Math.ceil(model.left.max)}`;
  portrait.append(health, healthText);
  identity.append(portrait, label);
  const tabs = $('#contextTabs');
  tabs.replaceChildren();
  for (const name of model.tabs) {
    const button = document.createElement('button');
    button.textContent = { production: 'Production', buildings: 'Bâtiments', bases: 'Bases' }[name];
    button.setAttribute('aria-pressed', String(model.activeTab === name));
    button.onclick = () => {
      panelContext.tab = name;
      panelContext.bases = name === 'bases';
      panelVisibilityState = panelVisibility(panelVisibilityState, 'building');
      updateUI();
    };
    tabs.append(button);
  }
  const grid = $('#contextGrid');
  grid.replaceChildren();
  for (const item of model.mode === 'units' && model.grid[0]?.length === 1
    ? []
    : model.grid[0] || []) {
    const button = document.createElement('button');
    const icon = document.createElement('span');
    icon.innerHTML = portraitFor(item.type || 'commis');
    const caption = document.createElement('small');
    caption.textContent = item.kind === 'filter' ? `×${item.count}` : item.shortName;
    if (item.kind !== 'filter' && item.kind !== 'main') {
      const cost = document.createElement('b');
      cost.className = 'panel-cost';
      cost.textContent = `${item.cost || 0} `;
      cost.append(document.querySelector('header [aria-label="Rubis"] svg').cloneNode(true));
      caption.append(cost);
      if (item.production) {
        const duration = document.createElement('small');
        duration.textContent = `${item.production} s`;
        caption.append(duration);
      }
    }
    button.append(icon, caption);
    if (item.locked) {
      const lock = document.createElement('i');
      lock.className = 'panel-lock';
      lock.textContent = '🔒';
      button.append(lock);
    }
    button.title = item.locked
      ? item.prerequisite || 'Rubis insuffisants ou file pleine'
      : item.name;
    button.setAttribute('aria-label', button.title);
    button.disabled = paused || (item.locked && item.kind !== 'recruit');
    if (item.kind === 'recruit' && item.locked) button.style.opacity = '0.45';
    let timer;
    let removed = false;
    if (item.kind === 'filter') {
      let pressOrigin;
      button.onpointerdown = (event) => {
        pressOrigin = { x: event.clientX, y: event.clientY };
        removed = false;
        button.setPointerCapture(event.pointerId);
        timer = setTimeout(() => {
          removed = true;
          selected = filterSelection(selected, state.units, item.type, true);
          updateUI();
        }, 550);
      };
      button.onpointermove = (event) => {
        if (
          pressOrigin &&
          Math.hypot(event.clientX - pressOrigin.x, event.clientY - pressOrigin.y) > 12
        ) {
          removed = true;
          clearTimeout(timer);
        }
      };
      button.onpointerup = () => clearTimeout(timer);
      button.onpointercancel = () => {
        removed = true;
        clearTimeout(timer);
      };
      button.onlostpointercapture = () => clearTimeout(timer);
    }
    button.onclick = () => {
      if (removed) return;
      if (item.kind === 'filter') {
        selected = filterSelection(selected, state.units, item.type);
        updateUI();
      } else if (item.kind === 'main') {
        panelContext = { baseId: 'main_' + player };
        panelVisibilityState = panelVisibility(panelVisibilityState, 'building');
        updateUI();
      } else if (item.kind === 'recruit') {
        panelCommand({ kind: 'recruit', type: item.type, producerId: model.producerId });
      } else if (item.kind === 'depot') {
        panelCommand({ kind: 'build', index: item.index });
      } else if (panelContext.slotId) {
        panelCommand({
          kind: 'construct',
          type: item.id,
          baseId: panelContext.baseId,
          slotId: panelContext.slotId,
        });
      } else {
        buildGhost = {
          context: { ...panelContext, team: player },
          option: { ...item, kind: 'building' },
          slotId: state.slots[player].find(
            (slot) => !slot.occupe && slot.baseId === panelContext.baseId,
          )?.id,
        };
        notify('Touchez un emplacement libre sur la carte pour construire.');
      }
    };
    grid.append(button);
  }
  const actions = $('#contextActions');
  for (const id of ['retreat', 'hold']) {
    const control = $('#' + id);
    if (control) $('#squadTools').append(control);
  }
  actions.replaceChildren();
  if (model.mode === 'units') {
    const ability = document.createElement('button');
    ability.textContent = '✦ Compétence spéciale';
    ability.disabled = true;
    ability.title = 'Aucune compétence disponible';
    const patrol = document.createElement('button');
    patrol.textContent = '⇄ Patrouiller';
    patrol.setAttribute('aria-pressed', String(patrolArmed));
    patrol.disabled = paused;
    patrol.onclick = () => {
      patrolArmed = !patrolArmed;
      attackMoveArmed = false;
      $('#attackAction').setAttribute('aria-pressed', 'false');
      notify(patrolArmed ? 'Patrouiller · Touchez le sol' : 'Patrouille annulée');
      updateUI();
    };
    $('#hold').innerHTML = '⛨ <span>Tenir position</span>';
    const queue = document.createElement('button');
    queue.id = 'queueOrders';
    queue.textContent = '⇢ Enchaîner';
    queue.style.minHeight = '44px';
    queue.style.minWidth = '44px';
    queue.setAttribute('aria-pressed', String(queueArmed));
    queue.disabled = paused;
    queue.onclick = () => {
      queueArmed = !queueArmed;
      updateUI();
    };
    actions.append($('#hold'), patrol, queue, ability, $('#retreat'));
  } else {
    const opened = openedRallyBuilding();
    if (opened) {
      const rally = document.createElement('button');
      rally.id = 'rallyAction';
      rally.textContent = '⚑ Ralliement';
      rally.style.minHeight = '44px';
      rally.style.minWidth = '44px';
      rally.setAttribute('aria-pressed', String(rallyArmed === opened.id));
      rally.disabled = paused;
      rally.onclick = () => {
        rallyArmed = rallyArmed === opened.id ? null : opened.id;
        notify(rallyArmed ? 'Ralliement · Touchez le sol, une mine ou une unité alliée' : 'Ralliement annulé');
        updateUI();
      };
      actions.append(rally);
    }
    if (model.mode === 'base' && model.activeTab !== 'production') {
      const close = document.createElement('button');
      close.textContent = 'Retour carte';
      close.onclick = clearSelection;
      actions.append(close);
    }
    if (model.producerId && model.queue.length) {
      const queueLabel = document.createElement('small');
      queueLabel.className = 'queue-label';
      queueLabel.textContent = `File ${model.queue.length}/8`;
      actions.append(queueLabel);
    }
    for (let index = 0; index < model.queue.length; index++) {
      const job = model.queue[index];
      const button = document.createElement('button');
      button.className = 'queue-cell';
      button.disabled = !job || paused;
      button.textContent = String(index + 1);
      if (job) {
        button.dataset.jobId = job.id;
        button.title = Sim.stats(job.type, player).name + ' · Annuler et rembourser';
        button.setAttribute('aria-label', button.title);
        const icon = document.createElement('span');
        icon.innerHTML = portraitFor(job.type);
        button.prepend(icon);
        const progress = document.createElement('progress');
        progress.max = job.total;
        progress.value = job.total - job.remaining;
        button.append(progress);
        button.onclick = () =>
          panelCommand({
            kind: 'cancelProduction',
            producerId: model.producerId,
            jobId: job.id,
          });
      }
      actions.append(button);
    }
  }
}
renderContextPanel();

productionUI = initProduction({
  enabled: () => running && !paused,
  command: panelCommand,
  recruitBatch: requestRecruit,
  vibrate: () => vibrateOrder(settings.vibration),
});
