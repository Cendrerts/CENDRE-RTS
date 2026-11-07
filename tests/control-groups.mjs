import assert from 'node:assert/strict';
import { createControlGroups, assignGroup, groupUnits, dominantType, createGroupTap, isGroupHold } from '../public/game/control-groups.js';
import { createPortraitTap, unitsOfType } from '../public/game/selection.js';
import { initTouchUI } from '../public/game/mobile.js';
import { CendreSim as Sim } from '../public/game/sim.js';

const units = [
  { id: 1, type: 'knight', hp: 50, team: 0, x: 10, y: 20 },
  { id: 2, type: 'archer', hp: 50, team: 0, x: 30, y: 40 },
  { id: 3, type: 'knight', hp: 50, team: 0, x: 50, y: 60 },
  { id: 4, type: 'mage', hp: 0, team: 0 },
  { id: 5, type: 'mage', hp: 50, team: 1 },
];
const groups = createControlGroups();
const selection = new Set([1, 2, 3, 4, 5]);
for (let index = 0; index < 4; index++) {
  assert.deepEqual(assignGroup(groups, index, selection, units, 0).map((unit) => unit.id), [1, 2, 3]);
}
selection.clear();
assert.deepEqual(groups[0], [1, 2, 3], 'assignment copies selection');
assert.equal(dominantType(groupUnits(groups, 0, units, 0)), 'knight');
units[0].hp = 0;
assert.deepEqual(groupUnits(groups, 0, units, 0).map((unit) => unit.id), [2, 3]);
assert.deepEqual(groups[0], [2, 3], 'dead units removed from stored group');
assert.deepEqual(groupUnits(groups, 0, units.filter((unit) => unit.id !== 3), 0).map((unit) => unit.id), [2]);
assert.deepEqual(assignGroup(groups, 3, new Set(), units, 0), []);
assert.equal(dominantType([]), null);
assert.equal(isGroupHold(100, 499), false);
assert.equal(isGroupHold(100, 500), true);

const taps = createGroupTap();
const portraits = createPortraitTap();
assert.equal(portraits.tap('knight', 0), 'visible');
assert.deepEqual(taps.tap(0, 10), { center: false });
assert.equal(portraits.tap('knight', 100), 'all');
assert.deepEqual(taps.tap(0, 359), { center: true });
assert.deepEqual(taps.tap(0, 400), { center: false });
assert.deepEqual(taps.tap(0, 750), { center: false });
assert.deepEqual(taps.tap(1, 760), { center: false });
taps.reset();
assert.deepEqual(taps.tap(1, 770), { center: false });
const beforePortrait = structuredClone(groups);
unitsOfType(units, 0, 'archer', { minX: 0, maxX: 100, minY: 0, maxY: 100 });
assert.deepEqual(groups, beforePortrait, 'portrait selection leaves control groups intact');
const state = Sim.create();
state.controlGroups = groups;
const restored = JSON.parse(JSON.stringify(state));
assert.deepEqual(restored.controlGroups, groups, 'solo state retains all four groups');
console.log('PASS: assignment, living selection, pruning, dominant type, hold threshold, double tap camera request, independent portraits and solo serialization.');

// Exercise the real pointer handlers with a minimal DOM and deterministic timers.
const { initControlGroups } = await import('../public/game/control-groups.js');
function element() {
  const listeners = new Map();
  const selectors = new Map();
  const classes = new Set();
  return {
    children: [],
    dataset: {},
    style: {},
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
    },
    setAttribute() {},
    setPointerCapture() {},
    addEventListener: (name, handler) => listeners.set(name, handler),
    append(child) {
      this.children.push(child);
    },
    querySelector(selector) {
      if (!selectors.has(selector)) selectors.set(selector, element());
      return selectors.get(selector);
    },
    getBoundingClientRect: () => ({ left: 4, top: 230, right: 154 }),
    fire(name) {
      listeners.get(name)({ pointerId: 1, button: 0, clientX: 10, clientY: 10, preventDefault() {} });
    },
  };
}
const savedGlobals = new Map(['document', 'addEventListener', 'setTimeout', 'clearTimeout', 'innerHeight'].map((key) => [key, globalThis[key]]));
const root = element();
const panel = element();
const timers = new Map();
globalThis.document = {
  createElement: element,
  querySelector: (selector) => selector === '#touchControls' ? root : panel,
  addEventListener() {},
};
globalThis.innerHeight = 390;
globalThis.addEventListener = () => {};
globalThis.setTimeout = (callback, duration) => {
  const token = {};
  timers.set(token, { callback, duration });
  return token;
};
globalThis.clearTimeout = (token) => timers.delete(token);
try {
  const localGroups = createControlGroups();
  let currentSelection = new Set([2, 3]);
  let assignments = 0;
  const recalled = [];
  const assignmentOptions = [];
  const ui = initControlGroups({
    enabled: () => true,
    units: (index) => groupUnits(localGroups, index, units, 0),
    icon: () => '',
    assign(index, options) {
      assignmentOptions.push(options);
      assignments++;
      assignGroup(localGroups, index, currentSelection, units, 0);
    },
    select: (index, center) => recalled.push({ index, center }),
  });
  const buttons = root.children[0].children;
  const hint = root.children[1];
  function shortTap(index) {
    buttons[index].fire('pointerdown');
    buttons[index].fire('pointerup');
  }
  panel.disabled = false;
  ui.refresh();
  assert.ok(buttons[0].classList.contains('can-assign'));
  shortTap(0);
  assert.deepEqual(localGroups[0], [2, 3], 'short tap assigns an empty group');
  assert.ok(buttons[0].classList.contains('assigned'));
  assert.match(hint.textContent, /^Groupe 1 créé/);
  assert.equal(assignmentOptions[0].quiet, true, 'first creation suppresses the assignment toast');
  assert.ok([...timers.values()].some((timer) => timer.duration === 2500));
  currentSelection = new Set([3]);
  shortTap(0);
  assert.deepEqual(localGroups[0], [2, 3], 'populated group is never reassigned by a short tap');
  assert.deepEqual(recalled, [{ index: 0, center: false }]);
  shortTap(0);
  assert.equal(recalled[1].center, true);
  currentSelection = new Set([5]);
  const touchElements = new Map();
  const touchDocument = globalThis.document;
  globalThis.document = {
    body: element(),
    querySelector(selector) {
      if (selector === '#attackAction') return panel;
      if (!touchElements.has(selector)) touchElements.set(selector, element());
      return touchElements.get(selector);
    },
    addEventListener() {},
  };
  try {
    initTouchUI({
      get: () => ({ state: { units }, selected: currentSelection, player: 0, running: true, paused: false }),
    });
    assert.equal(panel.disabled, true, 'enemy-only selection cannot assign a group');
  } finally {
    globalThis.document = touchDocument;
  }
  ui.refresh();
  assert.equal(buttons[1].classList.contains('can-assign'), false);
  shortTap(1);
  assert.deepEqual(localGroups[1], [], 'enemy-only selection leaves the group empty');
  assert.equal(assignments, 1);
  assert.equal(hint.textContent, 'Sélectionne des unités, puis touche ici pour créer un groupe');
  const helpTimer = [...timers.values()].find((timer) => timer.duration === 2000);
  assert.ok(helpTimer);
  helpTimer.callback();
  assert.equal(hint.hidden, true);
  panel.disabled = false;
  currentSelection = new Set([3]);
  shortTap(1);
  assert.equal(hint.hidden, true, 'creation help appears only for the first group');
  assert.equal(assignmentOptions[1].quiet, false, 'later assignments retain the toast');
  buttons[0].fire('pointerdown');
  const holdTimer = [...timers.values()].find((timer) => timer.duration === 400);
  holdTimer.callback();
  buttons[0].fire('pointerup');
  assert.deepEqual(localGroups[0], [3], 'long hold still replaces a populated group');
  assert.equal(assignments, 3, 'long hold assigns exactly once');
  ui.reset();
  shortTap(2);
  assert.match(hint.textContent, /^Groupe 3 créé/, 'new game resets creation help');
} finally {
  for (const [key, value] of savedGlobals) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
}
console.log('PASS: short taps assign empty groups, preserve full groups, and show timed first-group and empty-selection help.');
