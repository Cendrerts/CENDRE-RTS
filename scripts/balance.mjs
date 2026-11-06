import { pathToFileURL } from 'node:url';
import { CendreSim as S } from '../public/game/sim.js';

// All units are in range. Focus the first living foe; excess damage is lost.
// intervalSeconds means seconds per attack, not attacks per second.
export function matchup(statsA, countA, statsB, countB, limit = 120) {
  const army = (stats, count) => {
    if (!Number.isInteger(count) || count < 1 || !Number.isFinite(stats.hp) || stats.hp <= 0 || !Number.isFinite(stats.damage) || stats.damage < 0 || !Number.isFinite(stats.intervalSeconds) || stats.intervalSeconds <= 0) throw new Error('Invalid army');
    return Array.from({ length: count }, () => ({ ...stats, volley: 1 }));
  };
  const a = army(statsA, countA), b = army(statsB, countB);
  const alive = units => units.filter(u => u.hp > 0);
  let time = 0;
  while (alive(a).length && alive(b).length) {
    const next = Math.min(...[...alive(a), ...alive(b)].map(u => u.volley * u.intervalSeconds));
    if (next > limit + 1e-9) { time = limit; break; }
    time = next;
    const damage = new Map();
    // Snapshot both sides before any damage is applied, including lethal volleys.
    for (const [attackers, enemies] of [[alive(a), alive(b)], [alive(b), alive(a)]]) {
      for (const u of attackers) if (u.volley * u.intervalSeconds <= time + 1e-9) {
        damage.set(enemies[0], (damage.get(enemies[0]) || 0) + u.damage);
        u.volley++;
      }
    }
    for (const [target, amount] of damage) target.hp = Math.max(0, target.hp - amount);
  }
  const summarize = units => ({ survivors: alive(units).length, hp: units.reduce((sum, u) => sum + u.hp, 0) });
  const A = summarize(a), B = summarize(b);
  return { time: Number(time.toFixed(6)), outcome: A.survivors && B.survivors ? 'timeout' : A.survivors ? 'A' : B.survivors ? 'B' : 'mutual', A, B };
}

export function scenarios(useGameIntervals = false) {
  const stats = (type, team) => { const c = S.stats(type, team); return { hp: c.hp, damage: c.damage, intervalSeconds: useGameIntervals ? c.rate : 1 }; };
  return [['T2 : 1 contre 1', 'knight', 1, 1], ['T2 : 1 contre 2', 'knight', 1, 2], ['T3 : 2 contre 4', 'archer', 2, 4]].map(([test, type, a, b]) => ({ test, ...matchup(stats(type, 0), a, stats(type, 1), b) }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify({ assumptions: 'Contact, tirs simultanés, première attaque après un intervalle, focus, sur-dégâts perdus, sans déplacement, portée ni zone.', userCadence: scenarios(), gameCadence: scenarios(true) }, null, 2));
}
