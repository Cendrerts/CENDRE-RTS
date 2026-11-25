export const MAIN_LEVELS = [
  { names: ['Cuisine', 'Décharge'], cost: 0, constructionTime: 0 },
  { names: ['Brasserie', 'Grande Décharge'], cost: 250, constructionTime: 45 },
  { names: ['Grand Restaurant', 'Palais des Ordures'], cost: 450, constructionTime: 60 },
];

export const BUILDINGS = [
  [
    { id: 'garde_manger', name: 'Garde-manger', unit: 'knight', rank: 2, cost: 100, constructionTime: 20 },
    { id: 'boucherie', name: 'Boucherie', unit: 'archer', rank: 3, cost: 150, constructionTime: 30 },
    { id: 'ecole_brigade', name: 'École de brigade', unit: 'mage', rank: 4, cost: 200, constructionTime: 40 },
  ],
  [
    { id: 'niche_ordures', name: 'Niche à Ordures', unit: 'knight', rank: 2, cost: 100, constructionTime: 20 },
    { id: 'atelier_ferraille', name: 'Atelier de Ferraille', unit: 'archer', rank: 3, cost: 150, constructionTime: 30 },
    { id: 'autel_peste', name: 'Autel de la Peste', unit: 'mage', rank: 4, cost: 200, constructionTime: 40 },
  ],
];
export function baseSites(s, team) {
  return [
    { id: 'main_' + team, ...s.bases[team], name: MAIN_LEVELS[(s.bases[team].niveau ?? 1) - 1].names[team] },
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
