import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// sim.js exposes only some of the UI values. Read the private values at generation time.
export async function actionCardValuesSource() {
  const source = await readFile(new URL('../public/game/sim.js', import.meta.url), 'utf8');
  const read = (pattern, convert = Number) => {
    const value = source.match(pattern)?.[1];
    if (value === undefined) throw new Error(`Valeur de fiche introuvable dans sim.js : ${pattern}`);
    return convert(value);
  };
  const object = (name) => read(new RegExp(`const ${name} = ({[\\s\\S]*?});`), (literal) =>
    JSON.parse(literal.replace(/\b(\w+):/g, '"$1":').replaceAll("'", '"').replace(/,\s*}/g, '}')));
  const values = {
    combined: object('COMBINED_DISHES'),
    combinedCost: object('COMBINED_DISH_COST'),
    basicCost: read(/s\.ingredients\[team\]\.viande -= (\d+);/),
    ragoutCooking: read(/Object\.assign\(s\.ragout,\s*{\s*readyAt: s\.time \+ (\d+)/),
    ragoutEffect: read(/s\.ragout\.expiresAt = s\.ragout\.readyAt \+ (\d+)/),
    ragoutDamage: read(/return chefNearby \? [\d.]+ : ([\d.]+);/),
    chefDamage: read(/return chefNearby \? ([\d.]+) : [\d.]+;/),
    chefRadius: read(/Math\.hypot\(hero\.x - unit\.x, hero\.y - unit\.y\) < (\d+)/),
    festinCooking: read(/s\.festin\.readyAt = s\.time \+ (\d+)/),
    festinCount: read(/Math\.min\((\d+), festinFreePlaces/),
    rotiSpeed: read(/unit\.rotiUntil > s\.time \+ 1e-9 \? speed \* ([\d.]+)/),
    bouillonHealing: read(/unit\.hp \+ ([\d.]+) \* seconds/),
    banquetDamage: read(/unit\.banquetUntil > s\.time \+ 1e-9\) return ([\d.]+)/),
    pesteLeech: read(/const stolenHp = Math\.min\(target\.hp, damage\) \* ([\d.]+)/),
    feastRadius: read(/const KING_FEAST_RADIUS = (\d+)/),
    feastCooldown: read(/const KING_FEAST_COOLDOWN = (\d+)/),
    kitchenCooldown: read(/s\.fieldKitchenReadyAt = s\.time \+ (\d+)/),
  };
  return '// Généré depuis sim.js par node scripts/action-card-values.mjs.\n' +
    `export const actionCardValues = ${JSON.stringify(values, null, 2)};\n`;
}

export async function generateActionCardValues() {
  const target = new URL('../public/game/action-card-values.js', import.meta.url);
  const source = await actionCardValuesSource();
  if (await readFile(target, 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }) !== source) await writeFile(target, source);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await generateActionCardValues();
}
