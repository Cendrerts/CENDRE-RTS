export function mettreAJourCachesConnues(memoire, caches, estVisible, temps) {
  const cachesConnues = [];
  for (const { name, x, y, readyAt, progress, capturingTeam } of caches) {
    if (estVisible(x, y)) {
      cachesConnues.push({ name, x, y, pleine: temps >= readyAt, vue: true, progress, capturingTeam });
    } else {
      const souvenir = memoire.get(name);
      if (souvenir) cachesConnues.push({ ...souvenir, vue: false });
    }
  }
  return cachesConnues;
}
