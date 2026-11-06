import assert from 'node:assert/strict';
import { initControlGroups } from '../public/game/control-groups.js';

function element() {
  const classes = new Set();
  const children = new Map();
  return {
    dataset: {},
    children: [],
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
    setAttribute() {},
    addEventListener() {},
    append(child) {
      this.children.push(child);
    },
    querySelector(selector) {
      if (!children.has(selector)) children.set(selector, element());
      return children.get(selector);
    },
  };
}

const touchControls = element();
const originalDocument = globalThis.document;
const originalAddEventListener = globalThis.addEventListener;
globalThis.document = {
  createElement: element,
  querySelector: () => touchControls,
  addEventListener() {},
};
globalThis.addEventListener = () => {};
try {
  let units = [];
  const controls = initControlGroups({
    enabled: () => true,
    units: () => units,
    icon: (type) => `<svg>${type}</svg>`,
  });
  const buttons = touchControls.children[0].children;
  assert.equal(buttons.length, 4);
  controls.refresh();
  for (const button of buttons) {
    assert.ok(button.classList.contains('empty'));
    assert.equal(button.querySelector('b').textContent, '');
    assert.equal(button.querySelector('.group-icon').innerHTML, '');
  }
  units = [{ type: 'knight' }, { type: 'knight' }, { type: 'archer' }];
  controls.refresh();
  assert.equal(buttons[0].classList.contains('empty'), false);
  assert.equal(buttons[0].querySelector('b').textContent, 3);
  assert.equal(buttons[0].querySelector('.group-icon').innerHTML, '<svg>knight</svg>');
  units = [];
  controls.refresh();
  assert.ok(buttons[0].classList.contains('empty'));
  assert.equal(buttons[0].querySelector('b').textContent, '');
  assert.equal(buttons[0].querySelector('.group-icon').innerHTML, '');
} finally {
  globalThis.document = originalDocument;
  globalThis.addEventListener = originalAddEventListener;
}
console.log('PASS: empty groups have no icon or count; populated groups show the dominant type and count.');
