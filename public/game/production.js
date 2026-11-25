import { unitLabel } from './selection.js';
import { CendreSim as Sim, canRecruit } from './sim.js';

export function recruitToastText(launched, message) {
  if (!launched) return message;
  const agreement = launched === 1 ? 'lancée' : 'lancées';
  return `${launched} ${agreement} · ${message}`;
}

export function productionModel(state, player) {
  const queue = state.queues[player];
  return ['commis', 'knight', 'archer', 'mage'].map((type) => {
    const stats = Sim.stats(type, player);
    const queued = queue.filter((job) => job.type === type).length;
    return {
      type,
      name: unitLabel(type, 1, player),
      cost: stats.cost,
      queued,
      disabled: !canRecruit(state, player, type),
    };
  });
}

export function initProduction(api) {
  const root = document.createElement('section');
  root.id = 'globalProduction';
  root.hidden = true;
  root.innerHTML = '<button id="productionToggle" aria-expanded="false" aria-controls="productionBar">Production</button><div id="productionBar" role="group" aria-label="Production globale — appui long : 5 unités" hidden></div>';
  document.body.append(root);
  const toggle = root.querySelector('button');
  const bar = root.querySelector('#productionBar');
  toggle.onclick = () => {
    bar.hidden = !bar.hidden;
    toggle.setAttribute('aria-expanded', String(!bar.hidden));
  };
  const buttons = new Map();
  for (const type of ['commis', 'knight', 'archer', 'mage']) {
    const button = document.createElement('button');
    button.dataset.type = type;
    const name = document.createElement('span');
    name.className = 'productionName';
    const cost = document.createElement('span');
    cost.className = 'productionCost';
    const badge = document.createElement('span');
    badge.className = 'productionBadge';
    badge.hidden = true;
    button.append(name, cost, badge);
    button.title = 'Appui long : recruter jusqu’à 5 unités';
    let press = null;
    let suppressClick = false;
    function cancel() {
      if (press) clearTimeout(press.timer);
      press = null;
      button.classList.remove('productionHolding');
    }
    button.addEventListener('pointerdown', (event) => {
      if (press || event.button !== 0 || button.disabled || !api.enabled()) return;
      cancel();
      suppressClick = false;
      button.setPointerCapture(event.pointerId);
      press = { id: event.pointerId, x: event.clientX, y: event.clientY };
      button.classList.add('productionHolding');
      press.timer = setTimeout(() => {
        suppressClick = true;
        cancel();
        if (bar.hidden || root.hidden || !api.enabled()) return;
        api.vibrate();
        api.recruitBatch({ kind: 'recruit', type }, 5);
      }, 450);
    });
    button.addEventListener('pointermove', (event) => {
      if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12) {
        suppressClick = true;
        cancel();
      }
    });
    button.addEventListener('pointerup', cancel);
    button.addEventListener('pointercancel', () => {
      suppressClick = true;
      cancel();
    });
    button.addEventListener('lostpointercapture', cancel);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    button.onclick = () => {
      if (!suppressClick && api.enabled()) api.command({ kind: 'recruit', type });
      suppressClick = false;
    };
    buttons.set(type, button);
    bar.append(button);
  }
  return {
    refresh(state, player, running) {
      root.hidden = !running;
      if (!running) {
        bar.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
      }
      const items = productionModel(state, player);
      for (const item of items) {
        const button = buttons.get(item.type);
        const disabled = item.disabled || !api.enabled();
        const signature = JSON.stringify([item.name, item.cost, item.queued, disabled, api.enabled()]);
        if (button.dataset.signature === signature) continue;
        button.dataset.signature = signature;
        button.disabled = !api.enabled();
        button.setAttribute('aria-disabled', String(disabled));
        button.style.opacity = disabled ? '0.45' : '';
        button.querySelector('.productionName').textContent = item.name;
        button.querySelector('.productionCost').textContent = `${item.cost} ♦`;
        const badge = button.querySelector('.productionBadge');
        badge.textContent = String(item.queued);
        badge.hidden = item.queued <= 0;
      }
    },
  };
}
