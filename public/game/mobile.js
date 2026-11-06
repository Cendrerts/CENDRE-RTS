export function initTouchUI(api) {
  const $ = (s) => document.querySelector(s),
    deck = $('#commandDeck'),
    stick = $('#joystick'),
    knob = $('#stickKnob');
  const squad = document.createElement('div');
  squad.id = 'squadTools';
  for (const id of ['all', 'hold', 'retreat']) squad.append($('#' + id));
  $('#touchControls').append(squad);
  let active = null,
    vector = { x: 0, y: 0 },
    elapsed = 0,
    moved = false,
    signature = '';
  const panelsOpen = () => !$('#recruitTray').hidden || !$('#buildingsTray').hidden;
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
  function close() {
    stop();
    $('#recruitTray').hidden = true;
    $('#buildingsTray').hidden = true;
    refresh();
  }
  function refresh() {
    const g = api.get(),
      ids = [...g.selected].join(',');
    if (active && (!g.running || g.paused || panelsOpen() || ids !== signature)) stop();
    signature = ids;
    const names = g.player
      ? ['Essuyeurs', 'Éboueurs', 'Tireurs', 'Chamans']
      : ['Commis', 'Gardes', 'Bouchers', 'Chefs'];
    document.querySelectorAll('[data-select]').forEach((b, i) => {
      const label = b.querySelector('span');
      if (label) label.textContent = names[i];
    });
    const playing = g.running;
    $('#touchControls').hidden = !playing;
    $('#baseTabs').hidden = !playing || !panelsOpen();
    document.body.classList.toggle('base-open', playing && panelsOpen());
    document.body.classList.toggle('playing', playing);
    squad.hidden = !playing || g.paused || panelsOpen();
    stick.hidden = !$('#joystickEnabled').checked || !playing || g.paused || !g.selected.size || panelsOpen();
    $('#attackAction').disabled = g.paused || !g.selected.size;
    $('#baseAction').disabled = g.paused;
    $('#productionTab').setAttribute('aria-pressed', String(!$('#recruitTray').hidden));
    $('#constructionTab').setAttribute('aria-pressed', String(!$('#buildingsTray').hidden));
  }
  $('#joystickEnabled').onchange = () => {
    stop();
    refresh();
  };
  $('#deckToggle').onclick = () => {
    const collapsed = deck.classList.toggle('collapsed');
    $('#deckToggle').textContent = collapsed ? '⌃' : '⌄';
    $('#deckToggle').setAttribute('aria-expanded', String(!collapsed));
    $('#deckToggle').setAttribute(
      'aria-label',
      collapsed ? 'Afficher les groupes' : 'Replier les groupes',
    );
  };
  $('#baseAction').onclick = () => {
    stop();
    if (panelsOpen()) {
      close();
      return;
    }
    $('#recruitToggle').click();
    $('#home').click();
    refresh();
  };
  $('#productionTab').onclick = () => {
    if ($('#recruitTray').hidden) $('#recruitToggle').click();
    refresh();
  };
  $('#constructionTab').onclick = () => {
    if ($('#buildingsTray').hidden) $('#buildingsToggle').click();
    refresh();
  };
  $('#hold').addEventListener('click', stop);
  $('#retreat').addEventListener('pointerdown', stop);
  $('#backCombat').onclick = () => {
    close();
    api.focusGroup();
  };
  $('#closeProduction').onclick = close;
  $('#attackAction').onclick = () => {
    stop();
    api.attack();
  };
  // Keep the camera still: both portrait taps refer to the same view.
  document.querySelectorAll('[data-select]').forEach((b) =>
    b.addEventListener('click', () => {
      close();
      refresh();
    }),
  );
  $('#all').addEventListener('click', () => {
    close();
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
