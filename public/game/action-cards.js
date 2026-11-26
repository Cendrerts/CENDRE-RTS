import { CendreSim as Sim } from './sim.js';
import { actionCardValues as values } from './action-card-values.js';
import { resourceLabels } from './resource-feedback.js';
import { unitLabel } from './selection.js';

const percent = (fraction) => new Intl.NumberFormat('fr', { style: 'percent', maximumFractionDigits: 2 }).format(fraction);
const bonus = (multiplier) => '+' + percent(multiplier - 1);
const nearby = `aux militaires alliés à ${Sim.RAGOUT_RADIUS} px ou moins du lieu de cuisson`;
const cookingTime = (duration) => `${duration} s de cuisson`;

function combinedDish(dish, icon, effect, shortName) {
  const recipe = values.combined[dish];
  const cost = { ...values.combinedCost };
  if (recipe.conserves) cost.conserves = recipe.conserves;
  return { dish, name: recipe.name, shortName, icon, cost, duration: cookingTime(recipe.duration), effect };
}

const ragout = {
  dish: 'ragout',
  name: 'Ragoût',
  icon: 'ragout',
  cost: { viande: values.basicCost },
  duration: cookingTime(values.ragoutCooking),
  effect: `Donne ${bonus(values.ragoutDamage)} de dégâts pendant ${values.ragoutEffect} s ${nearby}, ou ${bonus(values.chefDamage)} à moins de ${values.chefRadius} px du Grand Chef.`,
};
const festin = {
  dish: 'festin',
  name: 'Festin',
  icon: 'festin',
  cost: { viande: values.basicCost },
  duration: `${values.festinCooking} s de préparation`,
  effect: `Fait sortir jusqu’à ${values.festinCount} ${unitLabel('knight', values.festinCount, 1)} de la base, selon les places de population libres.`,
};
const { roti, banquet, bouillon, peste } = values.combined;
export const dishOptions = [
  [
    ragout,
    combinedDish('roti', 'ragout', `Donne ${bonus(values.rotiSpeed)} de vitesse pendant ${roti.effect} s ${nearby}.`, 'Rôti'),
    combinedDish('banquet', 'ragout', `Soigne entièrement et donne ${bonus(values.banquetDamage)} de dégâts pendant ${banquet.effect} s ${nearby}. Le bonus de dégâts du ${ragout.name} est remplacé.`),
  ],
  [
    festin,
    combinedDish('bouillon', 'festin', `Rend ${values.bouillonHealing} PV par seconde pendant ${bouillon.effect} s ${nearby}.`, 'Bouillon'),
    combinedDish('peste', 'festin', `Donne pendant ${peste.effect} s ${nearby} un soin égal à ${percent(values.pesteLeech)} des dégâts infligés aux unités.`),
  ],
];

export const kingFeastCard = {
  name: 'Curée',
  cost: {},
  duration: `Activation immédiate · ${values.feastCooldown} s de recharge`,
  effect: `Les militaires rats à ${values.feastRadius} px ou moins du Roi-Rat se partagent les cadavres à portée et les dévorent en même temps pour se soigner et gagner de la Viande.`,
};

export const fieldKitchenCard = {
  name: 'Cuisine de campagne',
  cost: { rubies: Sim.FIELD_KITCHEN_COST },
  duration: `Pose immédiate · ${values.kitchenCooldown} s de recharge`,
  effect: 'Pose une cuisine près du Grand Chef, loin de la base adverse. Les plats préparés sur place sont servis aux militaires proches.',
};

export function rankCard(upgrade, team) {
  const unlockedDishes = dishOptions[team].filter(({ dish }) => values.combined[dish]?.level === upgrade.rank - 1);
  const dishes = unlockedDishes.map(({ name }) => name).join(' et ');
  return {
    name: upgrade.name,
    cost: { rubies: upgrade.cost },
    duration: `${upgrade.duration} s de construction`,
    effect: `Débloque les bâtiments de rang ${upgrade.rank}${dishes ? ` et le plat ${dishes}` : ''}.`,
  };
}

export function costText(cost) {
  return Object.entries(cost).map(([resource, amount]) => `${amount} ${resourceLabels[resource]}`).join(' · ') || 'Gratuit';
}

export function bindActionCard(button, show, hide, activate) {
  let press = null;
  let suppressClick = false;
  const finish = (event) => {
    if (press?.id !== event.pointerId) return;
    clearTimeout(press.timer);
    if (suppressClick) hide();
    press = null;
    button.classList.remove('action-card-pressed');
  };
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || press || button.disabled) return;
    suppressClick = false;
    const { pointerId: id, clientX: x, clientY: y } = event;
    button.setPointerCapture(id);
    const timer = setTimeout(() => {
      suppressClick = true;
      if (button.isConnected && !button.disabled) show();
    }, 400);
    press = { id, x, y, timer };
    button.classList.add('action-card-pressed');
  });
  button.addEventListener('pointermove', (event) => {
    if (press?.id !== event.pointerId || suppressClick) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12) {
      suppressClick = true;
      clearTimeout(press.timer);
    }
  });
  button.addEventListener('pointerup', finish);
  button.addEventListener('pointercancel', finish);
  button.addEventListener('lostpointercapture', finish);
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  button.onclick = () => {
    if (!suppressClick) activate();
    suppressClick = false;
  };
}
