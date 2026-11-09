import { unitLabel } from './selection.js';
import { CendreSim as Sim } from './sim.js';

export function panelCapacity(width = 844) {
  const columns = Math.max(1, Math.floor((width - 200 - 180 - 32) / 60));
  return { columns, rows: 2, capacity: columns * 2 };
}

export function panelVisibility(previous = {}, event = 'selection') {
  if (event === 'collapse') return { collapsed: true, manual: true };
  if (event === 'expand' || event === 'building') return { collapsed: false, manual: false };
  return previous.manual ? previous : { collapsed: false, manual: false };
}

export function panelModel(state, player, selection, context = {}) {
  const units = state.units.filter(
    (unit) => unit.team === player && unit.hp > 0 && selection.has(unit.id),
  );
  const producer = Object.keys(Sim.TYPES)
    .flatMap((type) => Sim.producers(state, player, type))
    .find((item) => item.id === context.producerId);
  const mode =
    context.baseId || context.slotId || context.bases
      ? 'base'
      : producer
        ? 'production'
        : units.length
          ? 'units'
          : 'empty';
  const activeTab = mode === 'base'
    ? context.tab || (context.bases ? 'bases' : context.slotId ? 'buildings' : 'production')
    : null;
  const recruitmentProducer = producer || (mode === 'base' && activeTab === 'production'
    ? Sim.producers(state, player, 'commis').find((item) => item.id === context.baseId)
    : null);
  const queue = (state.queues?.[player] || [])
    .map((job, index) => ({ ...job, index }))
    .filter((job) => job.producerId === (producer?.id || context.baseId));
  const counts = [...new Set(units.map((unit) => unit.type))].map((type) => ({
    type,
    count: units.filter((unit) => unit.type === type).length,
  }));
  counts.sort((a, b) => b.count - a.count);
  const main = counts[0]?.type;
  const left = {
    name:
      mode === 'units'
        ? counts.length > 1 ? unitLabel('unit', units.length) : unitLabel(main, units.length, player)
        : producer?.name ||
          Sim.baseSites(state, player).find((base) => base.id === context.baseId)?.name ||
          'Votre armée',
    type: main || producer?.unit || 'commis',
    count: units.length,
    max:
      mode === 'units' ? units.reduce((sum, unit) => sum + unit.max, 0) : state.bases[player].max,
    hp: mode === 'units' ? units.reduce((sum, unit) => sum + unit.hp, 0) : state.bases[player].hp,
    status:
      mode === 'units'
        ? units.length === 1 && main === 'commis'
          ? `Sac ${units[0].cargo || 0}`
          : units.some((unit) => unit.patrol)
            ? 'Patrouille'
            : units.some((unit) => unit.harvest)
          ? 'Récolte'
          : units.some((unit) => unit.hold)
            ? 'Tenir'
            : 'Prêt'
        : `Production ${queue.length}/8`,
  };
  if (context.bases) left.status = 'Unité proche · mine libre';
  let items = [];
  if (mode === 'units')
    items = counts.map((item) => ({
      ...item,
      kind: 'filter',
      name: unitLabel(item.type, item.count, player),
    }));
  if (recruitmentProducer)
    items = [
      {
        kind: 'recruit',
        type: recruitmentProducer.unit,
        ...Sim.stats(recruitmentProducer.unit, player),
        locked:
          queue.length >= 8 ||
          state.units.filter((unit) => unit.team === player).length +
            (state.queues?.[player]?.length || 0) >=
            30,
      },
    ];
  if (context.slotId) left.status = 'Emplacement choisi';
  if (mode === 'base' && activeTab !== 'production') {
    items = activeTab === 'bases'
      ? [
          { ...Sim.stats('commis', player), kind: 'main', name: 'Base principale', type: 'commis' },
          ...state.mines.flatMap((mine, index) =>
            index >= 2 &&
            (Sim.visibleAt(state, player, mine.x, mine.y) ||
              state.explored?.[player]?.[
                Math.floor(mine.y / Sim.CELL) * Sim.COLS + Math.floor(mine.x / Sim.CELL)
              ])
              ? [
                  {
                    kind: 'depot',
                    index,
                    name: mine.name,
                    cost: 120,
                    locked:
                      !!mine.depot ||
                      state.units.some(
                        (unit) =>
                          unit.team !== player && Math.hypot(unit.x - mine.x, unit.y - mine.y) < 95,
                      ) ||
                      !state.units.some(
                        (unit) =>
                          unit.team === player && Math.hypot(unit.x - mine.x, unit.y - mine.y) < 95,
                      ),
                    prerequisite: 'Unité proche · mine libre',
                  },
                ]
              : [],
          ),
        ]
      : Sim.BUILDINGS[player].map((building) => ({
          ...building,
          type: building.unit,
          kind: 'building',
          locked: !(state.slots[player] || []).some(
            (slot) =>
              !slot.occupe &&
              (!context.baseId || slot.baseId === context.baseId) &&
              (!context.slotId || slot.id === context.slotId),
          ),
          prerequisite: 'Emplacement libre requis',
        }));
  }
  const unitLabels = player
    ? { commis: 'Essuyeur', knight: 'Éboueur', archer: 'Tireur', mage: 'Chaman' }
    : { commis: 'Commis', knight: 'Garde', archer: 'Boucher', mage: 'Chef' };
  const buildingLabels = player
    ? ['Niche', 'Atelier', 'Autel']
    : ['Garde-manger', 'Boucherie', 'École'];
  items = items.map((item) => ({
    ...item,
    shortName:
      item.kind === 'building'
        ? buildingLabels[Sim.BUILDINGS[player].findIndex((building) => building.id === item.id)]
        : item.kind === 'main'
          ? 'Base mère'
          : item.kind === 'depot'
            ? item.name.replace('Plateau ', '').replace('Faille ', '').replace(' — ', '-')
            : unitLabels[item.type],
    locked: !!item.locked || (item.kind !== 'main' && (item.cost || 0) > state.rubies[player]),
  }));
  const { capacity } = panelCapacity(context.width);
  const grid = [];
  for (let index = 0; index < items.length; index += capacity)
    grid.push(items.slice(index, index + capacity));
  return {
    mode,
    collapsed: !!context.visibility?.collapsed,
    left,
    grid,
    tabs: mode === 'base' ? ['production', 'buildings', 'bases'] : [],
    activeTab,
    slotId: context.slotId,
    producerId: recruitmentProducer?.id,
    actions: mode === 'units' ? ['hold', 'patrol', 'ability', 'disengage'] : [],
    queue,
  };
}
