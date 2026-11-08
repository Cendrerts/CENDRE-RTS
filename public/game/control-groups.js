// Control groups describe local selection, never simulation orders.
export function createControlGroups() {
  return [[], [], [], []];
}

export function groupUnits(groups, index, units, team) {
  const ids = new Set(groups[index]);
  const living = units.filter((unit) => ids.has(unit.id) && unit.team === team && unit.hp > 0);
  groups[index] = living.map((unit) => unit.id);
  return living;
}

export function assignGroup(groups, index, selected, units, team) {
  groups[index] = [...selected];
  return groupUnits(groups, index, units, team);
}

export function dominantType(units) {
  const counts = new Map();
  for (const unit of units) counts.set(unit.type, (counts.get(unit.type) || 0) + 1);
  let dominant = null;
  for (const [type, count] of counts) {
    if (dominant === null || count > counts.get(dominant)) dominant = type;
  }
  return dominant;
}

export function isGroupHold(start, now) {
  return now - start >= 400;
}

export function createGroupTap() {
  let previous = null;
  return {
    reset() {
      previous = null;
    },
    tap(index, now) {
      const center = previous?.index === index && now >= previous.time && now - previous.time < 350;
      previous = center ? null : { index, time: now };
      return { center };
    },
  };
}

export function initControlGroups(api) {
  const container = document.createElement('div');
  container.id = 'controlGroups';
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', 'Groupes de contrôle');
  document.querySelector('#touchControls').append(container);
  const taps = createGroupTap();
  let press = null;
  let firstGroupCreated = false;
  let hintTimer;
  const hint = document.createElement('div');
  hint.id = 'controlGroupHint';
  hint.hidden = true;
  hint.setAttribute('role', 'status');
  hint.setAttribute('aria-live', 'polite');
  document.querySelector('#touchControls').append(hint);
  // The attack action is enabled by touch UI when local units are selected.
  function hasSelection() {
    return document.querySelector('#attackAction')?.disabled === false;
  }
  function hideHint() {
    clearTimeout(hintTimer);
    hint.hidden = true;
  }
  function showHint(message, duration) {
    hideHint();
    hint.textContent = message;
    hint.hidden = false;
    const groupsRect = container.getBoundingClientRect();
    const minimapRect = document.querySelector('#minimap')?.getBoundingClientRect();
    hint.style.left = `${Math.max(groupsRect.left, (minimapRect?.right || 0) + 12)}px`;
    hint.style.bottom = `${innerHeight - groupsRect.top + 8}px`;
    hintTimer = setTimeout(hideHint, duration);
  }
  function assign(index) {
    api.assign(index, { quiet: !firstGroupCreated });
    buttons[index].classList.add('assigned');
    setTimeout(() => buttons[index].classList.remove('assigned'), 700);
    if (!firstGroupCreated && api.units(index).length) {
      firstGroupCreated = true;
      showHint(`Groupe ${index + 1} créé · touche pour le rappeler · 2 touches pour centrer · appui long pour remplacer`, 2500);
    }
    refresh();
  }
  function tap(index) {
    if (api.units(index).length) {
      api.select(index, taps.tap(index, performance.now()).center);
    } else {
      taps.reset();
      if (hasSelection()) assign(index);
      else showHint('Sélectionne des unités, puis touche ici pour créer un groupe', 2000);
    }
    refresh();
  }
  function cancel() {
    if (press) clearTimeout(press.timer);
    press = null;
  }
  const buttons = Array.from({ length: 4 }, (_, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = `<strong>${index + 1}</strong><span class="group-icon"></span><b></b><span class="group-add" aria-hidden="true">+</span>`;
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    button.addEventListener('pointerdown', (event) => {
      if (press || event.button !== 0 || !api.enabled()) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      const current = { id: event.pointerId, index, assigned: false, start: performance.now(), x: event.clientX, y: event.clientY };
      press = current;
      current.timer = setTimeout(() => {
        if (!api.enabled()) return cancel();
        current.assigned = true;
        taps.reset();
        assign(index);
      }, 400);
    });
    button.addEventListener('pointermove', (event) => {
      if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12) cancel();
    });
    button.addEventListener('pointerup', (event) => {
      if (press?.id !== event.pointerId || press.index !== index) return;
      const assigned = press.assigned || isGroupHold(press.start, performance.now());
      if (assigned && !press.assigned && api.enabled()) assign(index);
      if (assigned) taps.reset();
      cancel();
      if (!assigned && api.enabled()) tap(index);
      refresh();
    });
    for (const event of ['pointercancel', 'lostpointercapture']) button.addEventListener(event, cancel);
    // Keyboard activation follows the same empty-group behavior.
    button.addEventListener('click', (event) => {
      if (event.detail === 0 && api.enabled()) tap(index);
    });
    container.append(button);
    return button;
  });
  function refresh() {
    container.hidden = !api.enabled();
    if (container.hidden) {
      cancel();
      hideHint();
    }
    buttons.forEach((button, index) => {
      const units = api.units(index);
      button.classList.toggle('empty', units.length === 0);
      button.classList.toggle('can-assign', units.length === 0 && hasSelection());
      button.querySelector('b').textContent = units.length ? units.length : '';
      const icon = button.querySelector('.group-icon');
      const type = dominantType(units);
      if (icon.dataset.type !== String(type)) {
        icon.innerHTML = type ? api.icon(type) : '';
        icon.dataset.type = String(type);
      }
      if (!units.length) {
        button.setAttribute('aria-label', `Groupe ${index + 1} vide : ${hasSelection() ? 'touche pour assigner la sélection' : 'sélectionne des unités pour créer un groupe'}.`);
        return;
      }
      button.setAttribute('aria-label', `Groupe ${index + 1} : ${units.length} unités. Appui long : assigner. Double-tap : centrer.`);
    });
  }
  addEventListener('blur', cancel);
  addEventListener('pagehide', cancel);
  document.addEventListener('visibilitychange', cancel);
  return {
    refresh,
    reset() {
      cancel();
      taps.reset();
      hideHint();
      firstGroupCreated = false;
      for (const button of buttons) {
        delete button.querySelector('.group-icon').dataset.type;
        button.classList.remove('assigned');
      }
    },
  };
}
