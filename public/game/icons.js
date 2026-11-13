// Shared button icons: no font or external asset required.
const paths = {
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
  "rook": "M5 2v6h14V2h-4v3H9V2ZM7 8v10l-3 4h16l-3-4V8M7 18h10",
  "biohazard": "M12 10V5m-2-3a4 4 0 1 0 4 0M10 13l-5 3m-3-2a4 4 0 1 0 3 5M14 13l5 3m0 3a4 4 0 1 0 3-5M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4",
  "right": "M4 12h16m-6-6 6 6-6 6",
  "alert": "m5 3 16 9-16 9 4-9Z",
  "up": "m5 16 7-8 7 8",
  "down": "m5 8 7 8 7-8",
  "pause": "M8 4v16M16 4v16",
  "close": "m5 5 14 14M19 5 5 19"
};

export function iconSvg(name) {
  if (!Object.hasOwn(paths, name)) throw new Error(`Unknown icon: ${name}`);
  return `<svg data-icon="${name}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="width:1em;height:1em;vertical-align:-0.125em;pointer-events:none"><path d="${paths[name]}"/></svg>`;
}
