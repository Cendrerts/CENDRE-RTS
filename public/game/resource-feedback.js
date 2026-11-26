export const resourceLabels = {
  rubies: 'rubis',
  viande: 'Viande',
  epices: 'Épices',
  conserves: 'Conserves',
};

export const spendingCommands = new Set(['recruit', 'construct', 'build', 'cookDish', 'fieldKitchen', 'upgradeMain']);

const resources = Object.keys(resourceLabels);

export function resourceStock(state, team) {
  return { ...state.ingredients[team], rubies: state.rubies[team] };
}

// Record confirmed debits separately so income in the same snapshot cannot mask a purchase.
export function trackResourceSpend(state, team, apply) {
  const before = resourceStock(state, team);
  const result = apply();
  const after = resourceStock(state, team);
  for (const resource of resources) {
    const spent = before[resource] - after[resource];
    if (!(spent > 0)) continue;
    state.resourceSpent ??= [{}, {}];
    const ledger = state.resourceSpent[team];
    ledger[resource] = (ledger[resource] ?? 0) + spent;
  }
  return result;
}

export function resourceChanges(previous, current) {
  return resources.flatMap((resource) => {
    const delta = current.stock[resource] - previous.stock[resource];
    const spent = (current.spent[resource] ?? 0) - (previous.spent[resource] ?? 0);
    const gained = delta + spent;
    return [
      ...(spent > 0 ? [{ resource, amount: -spent }] : []),
      ...(gained > 0 ? [{ resource, amount: gained }] : []),
    ];
  });
}

export function initResourceFeedback(document) {
  const counters = new Map(resources.map((resource) => {
    const counter = document.getElementById(resource).parentElement;
    counter.dataset.resource = resource;
    const layer = document.createElement('span');
    layer.className = 'resource-changes';
    layer.setAttribute('aria-hidden', 'true');
    counter.append(layer);
    return [resource, { counter, layer, entries: new Map(), pending: 0 }];
  }));
  let previous;
  let session;
  let previousTeam;

  function show(resource, amount) {
    const model = counters.get(resource);
    const { counter, layer, entries } = model;
    const format = (value) => (value > 0 ? '+' : '−') + Math.abs(value) + ' ' + resourceLabels[resource];
    if (entries.size === 3) {
      const matching = [...entries.values()].reverse().find((entry) => Math.sign(entry.amount) === Math.sign(amount));
      if (matching) {
        matching.amount += amount;
        matching.node.textContent = format(matching.amount);
      } else {
        model.pending += amount;
      }
    } else {
      const row = [0, 1, 2].find((index) => !entries.has(index));
      const node = document.createElement('span');
      node.className = 'resource-change';
      node.style.setProperty('--row', row);
      node.textContent = format(amount);
      layer.append(node);
      const timeout = setTimeout(() => {
        entries.delete(row);
        node.remove();
        if (!model.pending) return;
        const pending = model.pending;
        model.pending = 0;
        show(resource, pending);
      }, 1000);
      entries.set(row, { node, amount, timeout });
    }
    model.pulse?.cancel();
    model.pulse = counter.querySelector('b').animate([
      { transform: 'scale(1.2)', color: 'var(--resource-color)' },
      { transform: 'scale(1)' },
    ], { duration: 260 });
  }

  return (state, team, currentSession) => {
    const current = {
      stock: resourceStock(state, team),
      spent: { ...(state.resourceSpent?.[team] ?? {}) },
    };
    if (!currentSession || session !== currentSession || previousTeam !== team) {
      for (const model of counters.values()) {
        for (const { node, timeout } of model.entries.values()) {
          clearTimeout(timeout);
          node.remove();
        }
        model.entries.clear();
        model.pending = 0;
        model.pulse?.cancel();
      }
    } else {
      for (const { resource, amount } of resourceChanges(previous, current)) show(resource, amount);
    }
    session = currentSession;
    previousTeam = team;
    previous = current;
  };
}
