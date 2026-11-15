export const BUILDINGS = [
  [
    { id: 'garde_manger', name: 'Garde-manger', unit: 'knight', cost: 100 },
    { id: 'boucherie', name: 'Boucherie', unit: 'archer', cost: 150 },
    { id: 'ecole_brigade', name: 'École de brigade', unit: 'mage', cost: 200 },
  ],
  [
    { id: 'niche_ordures', name: 'Niche à Ordures', unit: 'knight', cost: 100 },
    { id: 'atelier_ferraille', name: 'Atelier de Ferraille', unit: 'archer', cost: 150 },
    { id: 'autel_peste', name: 'Autel de la Peste', unit: 'mage', cost: 200 },
  ],
];
export function baseSites(s, team) {
  return [
    { id: 'main_' + team, ...s.bases[team], name: team ? 'Grande Décharge' : 'Cuisine Centrale' },
    ...s.mines.flatMap((m, i) =>
      m.depot && m.owner === team
        ? [{ id: 'mine_' + i, ...m.site, team, mine: i, name: m.name }]
        : [],
    ),
  ];
}
export function ensureSlots(s, place = (x, y) => ({ x, y })) {
  const old = (s.slots || [[], []]).flat(),
    next = [[], []],
    occupied = [];
  for (let team = 0; team < 2; team++)
    for (const base of baseSites(s, team)) {
      const offsets = [
        [-75, -50],
        [75, -50],
        [-75, 50],
        [75, 50],
        [-105, 0],
        [105, 0],
        [0, 85],
        [0, -85],
      ];
      offsets.forEach(([dx, dy], i) => {
        const id = base.id + '_slot_' + (i + 1);
        let slot =
          old.find((p) => p.id === id && p.team === team) ||
          old.find(
            (p) =>
              !p.baseId &&
              p.team === team &&
              base.id === 'main_' + team &&
              p.id === 'slot_' + (i + 1),
          );
        if (slot) {
          slot.id = id;
          slot.baseId = base.id;
        } else {
          const pos = place(base.x + dx, base.y + dy, occupied, base);
          slot = { id, baseId: base.id, team, ...pos, occupe: false, batiment: null };
        }
        next[team].push(slot);
        occupied.push(slot);
      });
    }
  s.slots = next;
  return next;
}
export function construct(s, team, type, baseId, slotId = null) {
  const cfg = BUILDINGS[team]?.find((b) => b.id === type);
  if (s.winner !== null || !cfg || !Number.isFinite(s.rubies?.[team]) || s.rubies[team] < cfg.cost)
    return false;
  const slot = s.slots[team].find(
    (p) => !p.occupe && (!baseId || p.baseId === baseId) && (!slotId || p.id === slotId),
  );
  if (!slot) return false;
  s.rubies[team] -= cfg.cost;
  slot.occupe = true;
  slot.batiment = { type, x: slot.x, y: slot.y, niveau: 1 };
  return true;
}
export function producers(s, team, type) {
  if (type === 'hero') {
    return baseSites(s, team)
      .filter((base) => base.id === 'main_' + team)
      .map((base) => ({ ...base, unit: type }));
  }
  if (type === 'commis') return baseSites(s, team).map((b) => ({ ...b, name: b.name, unit: type }));
  const cfg = BUILDINGS[team]?.find((b) => b.unit === type);
  if (!cfg) return [];
  return (s.slots?.[team] || [])
    .filter((p) => p.occupe && p.batiment.type === cfg.id)
    .map((p) => ({ id: p.id, x: p.x, y: p.y, team, baseId: p.baseId, name: cfg.name, unit: type }));
}
