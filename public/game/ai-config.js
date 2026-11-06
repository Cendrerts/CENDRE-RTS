// Only reaction time and wave size vary with difficulty.
export const DIFFICULTIES = {
  facile: { reaction: 6, wave: 16 },
  normal: { reaction: 1, wave: 8 },
  difficile: { reaction: 0.35, wave: 6 },
};
export const BUILD_ORDERS = [
  [
    { id: 'garde_manger', unit: 'knight', requires: [] },
    { id: 'boucherie', unit: 'archer', requires: ['garde_manger'] },
    { id: 'ecole_brigade', unit: 'mage', requires: ['boucherie'] },
  ],
  [
    { id: 'niche_ordures', unit: 'knight', requires: [] },
    { id: 'atelier_ferraille', unit: 'archer', requires: ['niche_ordures'] },
    { id: 'autel_peste', unit: 'mage', requires: ['atelier_ferraille'] },
  ],
];
