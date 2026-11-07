// Difficulty changes decisions only; costs, vision and combat rules stay shared.
export const DIFFICULTIES = {
  facile: { reaction: 6, wave: 16, expansion: 250, workers: 3, copies: 1, macro: 60, micro: false },
  normal: { reaction: 1, wave: 12, expansion: 210, workers: 3, copies: 2, macro: 20, micro: false },
  difficile: { reaction: 0.35, wave: 7, expansion: 150, workers: 3, copies: 3, macro: 0, micro: true },
  brutal: { reaction: 0.2, wave: 5, expansion: 120, workers: 3, copies: 3, macro: 0, micro: true },
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
