import { TEAM_COLORS } from './unit-overlays.js';

// Shared button icons: no font or external asset required.
const paths = {
  "ragout": "M4 10h16v5a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6ZM8 7c-3-2 3-3 0-5m8 5c-3-2 3-3 0-5M1 12h3m16 0h3",
  "minus": "M4 12h16",
  "hold": "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z",
  "attack": "m5 19 13-13 2-2v6L9 21M3 14l7 7M6 18l-3 3",
  "patrol": "M3 7h18m-4-4 4 4-4 4M21 17H3m4-4-4 4 4 4",
  "retreat": "M9 4 3 10l6 6M3 10h10a7 7 0 0 1 7 7v3",
  "build": "m4 20 10-10M12 4l3-2 7 7-3 3-7-8ZM3 17l4 4M3 4l17 17M3 4v5l4-2Z",
  "rally": "M5 22V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0",
  "queue": "M3 12h3m3 0h3m3 0h6m-5-5 5 5-5 5",
  "selection": "M3 7V3h4m10 0h4v4m0 10v4h-4m-10 0H3v-4M3 10v4m18-4v4M10 3h4m-4 18h4",
  "fullscreen": "M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6",
  "back": "M20 12H4m6-6-6 6 6 6",
  "menu": "M4 5h16M4 12h16M4 19h16",
  "muted": "M11 3 6 8H2v8h4l5 5ZM16 9l6 6m0-6-6 6",
  "lock": "M7 11V7a5 5 0 0 1 10 0v4M5 11h14v11H5ZM12 15v3",
  "special": "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z",
  "home": "m2 11 10-9 10 9M5 9v13h14V9M10 22v-8h4v8",
  "cuistots": "M3 19 16 12l5 5-9 5-3-3-5 3ZM6 11V8C1 8 2 2 7 3c2-3 6-3 8 0 5-1 6 5 1 5v3Z",
  "ratsgout": "M2.5 15.5C2.5 10.5 6.5 8 11 8 14.5 8 18.5 10.5 22 13 18.5 15 14.5 16.5 9.5 16.5 5.5 16.5 2.5 17 2.5 15.5Z",
  "right": "M4 12h16m-6-6 6 6-6 6",
  "alert": "m5 3 16 9-16 9 4-9Z",
  "up": "m5 16 7-8 7 8",
  "down": "m5 8 7 8 7-8",
  "pause": "M8 4v16M16 4v16",
  "close": "m5 5 14 14M19 5 5 19"
};

export function iconSvg(name) {
  if (!Object.hasOwn(paths, name)) throw new Error(`Unknown icon: ${name}`);
  const faction = ['cuistots', 'ratsgout'].indexOf(name);
  if (faction !== -1) {
    const outline = 'stroke="#111719" stroke-width="1.5" vector-effect="non-scaling-stroke"';
    const elements = name === 'ratsgout'
      ? `<g ${outline}><circle cx="7.5" cy="6.5" r="3.6" vector-effect="non-scaling-stroke"/><path d="${paths[name]}" vector-effect="non-scaling-stroke"/><circle cx="14" cy="11.3" r="1.2" fill="#111719" stroke="none"/><circle cx="21.8" cy="13" r="1" fill="#111719" stroke="none"/><path d="M19 14.5 23 16M18.5 15.5l3 2.5" fill="none" vector-effect="non-scaling-stroke"/><path d="M10 19.5V18h4v1.5Z" vector-effect="non-scaling-stroke"/><ellipse cx="12" cy="21" rx="10" ry="1.5" vector-effect="non-scaling-stroke"/></g>`
      : `<path ${outline} d="${paths[name]}"/>`;
    return `<svg data-icon="${name}" width="32" height="32" viewBox="0 0 24 24" fill="${TEAM_COLORS[faction]}" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="width:32px;height:32px;vertical-align:middle;pointer-events:none">${elements}</svg>`;
  }
  return `<svg data-icon="${name}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="width:1em;height:1em;vertical-align:-0.125em;pointer-events:none"><path d="${paths[name]}"/></svg>`;
}
