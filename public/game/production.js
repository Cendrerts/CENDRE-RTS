import { CendreSim as Sim } from './sim.js';

export function productionModel(state, player) {
  const queue = state.queues[player];
  const population = state.units.filter((unit) => unit.team === player).length + queue.length;
  return ['commis', 'knight', 'archer', 'mage'].map((type) => {
    const stats = Sim.stats(type, player);
    const producers = Sim.producers(state, player, type);
    return {
      type,
      name: stats.name,
      cost: stats.cost,
      queued: queue.filter((job) => job.type === type).length,
      disabled: state.rubies[player] < stats.cost || population >= 30 ||
        !producers.some((producer) => queue.filter((job) => job.producerId === producer.id).length < 8),
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
    let press = null;
    let suppressClick = false;
    function cancel() {
      if (press) clearTimeout(press.timer);
      press = null;
    }
    button.addEventListener('pointerdown', (event) => {
      if (press || event.button !== 0 || button.disabled || !api.enabled()) return;
      cancel();
      suppressClick = false;
      button.setPointerCapture(event.pointerId);
      press = { id: event.pointerId, x: event.clientX, y: event.clientY };
      press.timer = setTimeout(() => {
        suppressClick = true;
        cancel();
        if (bar.hidden || root.hidden || !api.enabled()) return;
        for (let index = 0; index < 5; index++) api.command({ kind: 'recruit', type });
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
      for (const item of productionModel(state, player)) {
        const button = buttons.get(item.type);
        button.disabled = item.disabled || !api.enabled();
        button.textContent = `${item.name} · ${item.cost} ♦ · File : ${item.queued}`;
        button.title = 'Appui long : recruter jusqu’à 5 unités';
      }
    },
  };
}
