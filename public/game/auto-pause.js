export function shouldAutoPause({ multiplayer, hidden, running, paused }) {
  return !multiplayer && hidden && running && !paused;
}
