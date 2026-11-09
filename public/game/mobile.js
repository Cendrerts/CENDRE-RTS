export function initTouchUI(api) {
  const $ = (selector) => document.querySelector(selector);
  const stick = $('#joystick');
  const knob = $('#stickKnob');
  let active = null,
    vector = { x: 0, y: 0 },
    elapsed = 0,
    moved = false,
    signature = '';
  function stop() {
    if (!active) return;
    const ids = active.ids;
    active = null;
    vector = { x: 0, y: 0 };
    knob.style.transform = 'translate(-50%,-50%)';
    stick.classList.remove('active');
    if (moved) {
      api.steer(ids, 0, 0);
      moved = false;
    }
  }
  function refresh() {
    const game = api.get();
    const ids = [...game.selected].join(',');
    if (active && (!game.running || game.paused || ids !== signature)) stop();
    signature = ids;
    $('#touchControls').hidden = !game.running;
    document.body.classList.toggle('playing', game.running);
    stick.hidden = !$('#joystickEnabled').checked || !game.running || game.paused || !game.selected.size;
    const hasOwnSelection = game.state.units.some(
      (unit) => game.selected.has(unit.id) && unit.team === game.player && unit.hp > 0,
    );
    $('#attackAction').disabled = game.paused || !hasOwnSelection;
    $('#baseAction').disabled = game.paused;
  }
  $('#joystickEnabled').onchange = () => {
    stop();
    refresh();
  };
  $('#hold').addEventListener('click', stop);
  $('#retreat').addEventListener('pointerdown', stop);
  $('#attackAction').onclick = () => {
    stop();
    api.attack();
  };
  $('#all').addEventListener('click', () => {
    stop();
    api.focusGroup();
    refresh();
  });
  function update(e) {
    if (!active || active.id !== e.pointerId) return;
    const r = stick.getBoundingClientRect(),
      radius = r.width * 0.3,
      dx = e.clientX - (r.left + r.width / 2),
      dy = e.clientY - (r.top + r.height / 2),
      length = Math.hypot(dx, dy),
      factor = Math.max(radius, length);
    vector = length < radius * 0.15 ? { x: 0, y: 0 } : { x: dx / factor, y: dy / factor };
    knob.style.transform = `translate(calc(-50% + ${vector.x * radius}px),calc(-50% + ${vector.y * radius}px))`;
  }
  stick.addEventListener('pointerdown', (e) => {
    const g = api.get();
    if (active || !g.running || g.paused || !g.selected.size) return;
    e.preventDefault();
    active = { id: e.pointerId, ids: [...g.selected] };
    signature = [...g.selected].join(',');
    stick.setPointerCapture(e.pointerId);
    stick.classList.add('active');
    update(e);
    elapsed = 1;
  });
  stick.addEventListener('pointermove', (e) => {
    e.preventDefault();
    update(e);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    stick.addEventListener(name, (e) => {
      if (active?.id === e.pointerId) stop();
    });
  addEventListener('blur', stop);
  addEventListener('pagehide', stop);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
  });
  function tick(dt) {
    if (!active) return;
    const g = api.get();
    if (!g.running || g.paused) {
      stop();
      return;
    }
    elapsed += dt;
    if (elapsed >= 0.2) {
      elapsed = 0;
      api.steer(active.ids, vector.x, vector.y);
      moved = true;
    }
    api.focusGroup();
  }
  refresh();
  return { refresh, tick, stop };
}
