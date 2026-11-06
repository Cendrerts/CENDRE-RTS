export function ratSVG(t) {
  const mage = t === 'mage',
    worker = t === 'commis',
    tank = t === 'knight';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 76 80"><g stroke="#302c25" stroke-width="2" stroke-linejoin="round"><path d="M25 59Q-2 67 8 39" fill="none" stroke="#b77e78" stroke-width="4"/>${mage ? '<ellipse cx="36" cy="71" rx="24" ry="7" fill="#77a83d"/><path d="M17 65Q50 55 24 47Q6 41 29 35" fill="none" stroke="#a8dd52" stroke-width="5"/>' : '<path d="M28 57L24 70 17 72 31 73 35 59M44 58L48 70 58 72 43 73 39 59" fill="#b2847c"/>'}<path d="M25 32L45 32 52 61 22 62Z" fill="${mage ? '#627a33' : tank ? '#7e8980' : '#70625a'}"/><path d="M27 38H46L44 55H27Z" fill="${tank ? '#aba890' : mage ? '#77943e' : '#8b7563'}"/><path d="M26 36L16 48 12 39M45 36L57 43 62 31" fill="none" stroke="#998477" stroke-width="7"/><circle cx="27" cy="16" r="10" fill="#ad8c87"/><circle cx="44" cy="17" r="9" fill="#ad8c87"/><path d="M23 18L43 16 57 29 41 35 27 31Z" fill="#9c8c7b"/><path d="M32 22L39 24" stroke="${mage ? '#b6fa48' : '#201e1b'}" stroke-width="4"/><circle cx="56" cy="28" r="3" fill="#cf9b97"/><path d="M44 32L46 39 49 33" fill="#eee2b8"/>${worker ? '<path d="M44 45L70 45 65 61H48Z" fill="#94764e"/><path d="M45 46L37 40M54 61L53 68" fill="none"/><circle cx="66" cy="65" r="6" fill="#5a655a"/><path d="M49 45L52 35 57 45 63 38 66 45" fill="#b8b08e"/>' : tank ? '<ellipse cx="59" cy="44" rx="13" ry="21" fill="#8a9b8e"/><ellipse cx="59" cy="44" rx="8" ry="16" fill="none" stroke="#54645c"/><path d="M10 59L12 20" stroke="#9b7950" stroke-width="4"/><circle cx="12" cy="18" r="6" fill="#8b998c"/>' : mage ? '<path d="M63 63L65 14 59 7 65 2 72 12 66 20" fill="none" stroke="#a9d846" stroke-width="4"/><circle cx="66" cy="11" r="6" fill="#d4ff63"/><path d="M24 14L25 3 32 12 37 2 41 13" fill="#b2b58b"/>' : '<path d="M25 64H49V76H25Z" fill="#86613f"/><path d="M25 67H49M25 73H49" stroke="#929985"/><path d="M56 47L59 27M59 34L52 25M59 34L67 26" fill="none" stroke="#c3a678" stroke-width="3"/><path d="M52 25Q58 40 67 26" fill="none"/>'}</g></svg>`;
}
export const ratSprites = Object.fromEntries(
  ['commis', 'knight', 'archer', 'mage'].map((t) => {
    const i = new Image();
    i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ratSVG(t));
    return [t, i];
  }),
);
