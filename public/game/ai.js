import { CendreSim as Sim } from './sim.js';
import { BUILD_ORDERS, DIFFICULTIES } from './ai-config.js';

// A deterministic controller: no DOM, wall clock or randomness.
// All mutations go through the shared simulation's public actions.
export function createAI(team, difficulty = 'normal', state = null) {
  const settings = DIFFICULTIES[difficulty];
  if (!settings || ![0, 1].includes(team)) throw new Error('Invalid AI configuration');
  const brutal = difficulty === 'brutal' || difficulty === 'impitoyable';
  if (state) Sim.configureIncome(state, team, settings.incomeBonus);
  let nextReaction = 0;
  let emergencyUntil = 0;
  const evacuated = new Set();
  const knownArmy = new Map();
  let counterUntil = 0;
  let nextMacro = 0;
  let scout = null;
  let scouted = false;
  let lastWave = 0;
  let waveTravelTime = 90;
  let lastRegroup = -1;
  let retreatUntil = 0;
  let defending = false;
  let huntingCamp = null;
  let nextHunt = 0;
  const raiders = new Set();
  const intelligence = { bases: [], composition: {}, clustered: false, seenAt: null };
  const metrics = { waves: 0, expansions: [], waveSizes: [], lanes: [] };
  let expedition = null;
  const deployed = new Set();
  let waveRoute = null;
  let reducedWorkerTarget = false;
  const remembered = new Map();
  const knownBuildings = new Map();
  const established = new Set();
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const power = (units) => units.reduce((sum, unit) => sum + unit.hp * Sim.stats(unit.type, unit.team).damage / Sim.stats(unit.type, unit.team).rate * (unit.type === 'mage' ? 3 : 1), 0);
  const launchAttack = (state, units, destination, observedArmy) => {
    const ids = units.map((unit) => unit.id);
    const approaches = Sim.lanes.map((lane) => {
      const points = lane.points.map(([x, y]) => ({ x, y }));
      if (team === 1) points.reverse();
      let length = 0;
      for (let index = 1; index < points.length; index++) {
        length += distance(points[index - 1], points[index]);
      }
      const resistance = observedArmy.filter((enemy) => points.some((point) => distance(point, enemy) < 400)).length;
      // Do not repeatedly feed waves into the same choke. Alternating the
      // approach also works when the last enemy army has left our vision.
      const recent = metrics.lanes.slice(-2);
      const repetition = Number(recent.at(-1) === lane.name) * 1800 + Number(recent.includes(lane.name)) * 500;
      return { name: lane.name, points, length, score: length + resistance * 350 + repetition };
    }).sort((a, b) => a.score - b.score ||
      Number(b.name === (team ? 'sud' : 'nord')) - Number(a.name === (team ? 'sud' : 'nord')));
    const approach = approaches[0];
    const points = distance(destination, state.bases[1 - team]) < 320
      ? [...approach.points.slice(1, -1), destination]
      : [destination];
    waveRoute = { ids: new Set(ids), points, index: 0 };
    Sim.order(state, ids, points[0].x, points[0].y, null, false);
    // Queue only the current stage: the next one is released by the AI
    // once seventy percent of the surviving wave has reached this one.
    Sim.order(state, ids, points[0].x, points[0].y, null, false, true);
    const speed = Math.min(...units.map((unit) => Sim.stats(unit.type, team).speed));
    waveTravelTime = Math.min(150, Math.max(90, approach.length / speed + 60));
    metrics.lanes.push(approach.name);
  };
  return {
    intelligence,
    metrics,
    update(state) {
      if (state.winner !== null || state.time < nextReaction) return 0;
      nextReaction = state.time + settings.reaction;
      let actions = 0;
      const own = state.units.filter((unit) => unit.team === team && unit.hp > 0);
      const workers = own.filter((unit) => unit.type === 'commis');
      const army = own.filter((unit) => unit.type !== 'commis');
      const enemies = state.units.filter((unit) => unit.team !== team && Sim.canSee(state, team, unit) && unit.hp > 0);
      const observedArmy = enemies.filter((enemy) => enemy.type !== 'commis');
      if (observedArmy.length) {
        intelligence.composition = {};
        for (const enemy of observedArmy) {
          intelligence.composition[enemy.type] = (intelligence.composition[enemy.type] || 0) + 1;
        }
        intelligence.clustered = observedArmy.some((enemy) => observedArmy.filter((other) => distance(enemy, other) < 80).length >= 4);
        intelligence.seenAt = state.time;
      }
      if (brutal) {
        let losses = 0;
        for (const [id, position] of knownArmy) {
          if (Sim.visibleAt(state, team, position.x, position.y) && !observedArmy.some((enemy) => enemy.id === id)) {
            knownArmy.delete(id);
            losses++;
          }
        }
        for (const enemy of observedArmy) knownArmy.set(enemy.id, { x: enemy.x, y: enemy.y });
        if (losses >= 3 && !observedArmy.length) counterUntil = state.time + 20;
      }
      const enemyBase = state.bases[1 - team];
      if (Sim.canSee(state, team, enemyBase) && !intelligence.bases.length) {
        intelligence.bases.push({ x: enemyBase.x, y: enemyBase.y });
      }
      const mines = state.mines.map((mine, index) => ({
        boost: mine.boost,
        x: mine.x,
        y: mine.y,
        index,
        owner: mine.owner === team ? team : Sim.visibleAt(state, team, mine.x, mine.y) ? mine.owner : null,
        depot: mine.owner === team && mine.depot,
      }));
      const owned = mines.filter((mine) => mine.owner === team);
      const populationLimit = Sim.unitLimit?.(team) ?? 30;
      const saturated = own.length + state.queues[team].length >= populationLimit;
      if (brutal && saturated && state.rubies[team] >= 1000) reducedWorkerTarget = true;
      if (state.rubies[team] < 400) reducedWorkerTarget = false;
      const saturation = (mine) => settings.workers + Number(brutal && mine.index === team);
      const workerTarget = reducedWorkerTarget ? 10 : Math.min(owned.reduce((sum, mine) => sum + saturation(mine), 0), settings.workers * 3 + Number(brutal));
      const economyCapacity = Number(brutal) + settings.workers * (brutal ? Math.min(3, owned.length + 1) : 3) + Number(workers.some((worker) => worker.id === scout));
      const militaryLimit = populationLimit - (reducedWorkerTarget ? workerTarget : economyCapacity);
      const surplus = state.rubies[team] > 800;
      const forceWave = state.time - lastWave >= 120 && (state.rubies[team] >= 800 || army.length >= populationLimit * 0.9);
      for (const [id, building] of knownBuildings) {
        if (Sim.visibleAt(state, team, building.x, building.y) && !state.slots[1 - team].some((slot) => slot.id === id && slot.occupe)) {
          knownBuildings.delete(id);
        }
      }
      for (const slot of state.slots[1 - team]) {
        if (!Sim.visibleAt(state, team, slot.x, slot.y)) continue;
        if (slot.occupe) knownBuildings.set(slot.id, { x: slot.x, y: slot.y });
        else knownBuildings.delete(slot.id);
      }
      for (const mine of owned) {
        if (mine.index >= 2 && mine.depot) established.add(mine.index);
      }
      for (const mine of mines) {
        if (!Sim.visibleAt(state, team, mine.x, mine.y)) continue;
        if (mine.index >= 2 && mine.owner === 1 - team) remembered.set(mine.index, mine);
        else remembered.delete(mine.index);
      }
      for (const mine of remembered.values()) {
        if (Sim.build(state, team, mine.index)) {
          remembered.delete(mine.index);
          actions++;
        }
      }
      const threats = observedArmy.filter((enemy) => distance(enemy, state.bases[team]) < 650 || owned.some((mine) => distance(enemy, mine) < 400));
      if (brutal && threats.length) emergencyUntil = state.time + 15;
      const emergency = brutal && state.time < emergencyUntil;
      if (brutal && scout !== null) {
        const explorer = workers.find((worker) => worker.id === scout);
        if (!explorer || intelligence.bases.length || observedArmy.some((enemy) => distance(enemy, explorer) < 260)) {
          if (explorer) Sim.order(state, [explorer.id], state.bases[team].x, state.bases[team].y, null, true);
          scout = null;
        }
      }
      if (state.time >= nextMacro) {
        nextMacro = state.time + settings.macro;
        const queued = state.queues[team].filter((job) => job.type === 'commis').length;
        if (workers.filter((worker) => reducedWorkerTarget || worker.id !== scout).length + queued < workerTarget && Sim.recruit(state, 'commis', team)) actions++;
        // Rebalance only surplus or idle workers, preserving harvest trips.
        const assigned = new Map(owned.map((mine) => [mine.index, 0]));
        for (const worker of workers) {
          const index = worker.harvest?.mine;
          if (assigned.has(index)) assigned.set(index, assigned.get(index) + 1);
        }
        for (const worker of workers) {
          if (worker.id === expedition?.worker || worker.id === scout || evacuated.has(worker.id)) continue;
          const index = worker.harvest?.mine;
          const destination = owned.find((mine) => assigned.get(mine.index) < saturation(mine));
          if (destination && (!assigned.has(index) || assigned.get(index) > saturation(owned.find((mine) => mine.index === index)))) {
            if (Sim.gather(state, team, [worker.id], destination.index)) actions++;
            assigned.set(destination.index, assigned.get(destination.index) + 1);
            if (assigned.has(index)) assigned.set(index, assigned.get(index) - 1);
          }
        }
        const needsProductionSite = state.rubies[team] >= Sim.RULES.mineCost && state.slots[team].every((slot) => slot.occupe);
        if ((needsProductionSite || !brutal || !emergency && army.length >= (team ? 12 : 8)) && state.time >= settings.expansion && (needsProductionSite || owned.length < (state.time >= (brutal ? 240 : 300) ? 3 : 2)) && !expedition && workers.length) {
          // Mine locations are public terrain; ownership is checked only after scouting.
          const natural = mines.filter((mine) => mine.index >= 2)
            .sort((a, b) => distance(a, state.bases[team]) - distance(b, state.bases[team]))[0];
          const priority = (mine) => mine.index === natural.index ? -1 : distance(mine, state.bases[team]) * (established.has(mine.index) ? 0.1 : 1);
          const destination = mines.filter((mine) => mine.index >= 2 && mine.owner !== team)
            .sort((a, b) => (needsProductionSite ? Number(a.owner === 1 - team) - Number(b.owner === 1 - team) : 0) || priority(a) - priority(b))[0];
          if (destination) {
            expedition = { worker: workers.find((worker) => worker.id !== scout)?.id, index: destination.index };
          }
        }
        if (emergency && expedition && !needsProductionSite) {
          expedition = null;
        }
        if (expedition) {
          const worker = workers.find((unit) => unit.id === expedition.worker);
          const mine = mines[expedition.index];
          if (!worker || mine.owner === team && mine.depot) expedition = null;
          else if (Sim.build(state, team, mine.index)) {
            actions++;
            metrics.expansions.push(state.time);
            Sim.gather(state, team, [worker.id], mine.index);
            expedition = null;
          } else if (!worker.path.length || worker.harvest) {
            Sim.order(state, [worker.id], mine.x, mine.y, null, true);
            actions++;
          }
        }
        const built = new Set(state.slots[team].filter((slot) => slot.occupe).map((slot) => slot.batiment.type));
        const composition = intelligence.composition;
        const clustered = settings.micro ? intelligence.clustered : enemies.some((enemy) => enemies.filter((other) => distance(enemy, other) < 80).length >= 4);
        const earlyMages = brutal && army.filter((unit) => unit.type === 'archer').length >= 2;
        const massedArchers = (composition.archer || 0) >= 4 && !composition.knight;
        const preferred = clustered || earlyMages ? 'mage' : massedArchers ? 'knight' : 'archer';
        const order = [...BUILD_ORDERS[team]].sort((a, b) => Number(b.unit === preferred) - Number(a.unit === preferred));
        const saving = !emergency && expedition && state.rubies[team] < Sim.RULES.mineCost;
        if (!saving) {
          const nextBuilding = BUILD_ORDERS[team].find((building) => !built.has(building.id));
          if (nextBuilding && nextBuilding.requires.every((id) => built.has(id)) && (nextBuilding.unit !== 'mage' || army.length >= 3) && (!emergency || army.length >= 5) && Sim.construct(state, team, nextBuilding.id)) actions++;
          const weights = {
            knight: settings.micro ? 0.3 : 0.6,
            archer: 0.5,
            mage: brutal ? 0.8 : clustered ? 0.5 : 0.2,
          };
          const population = (type) => army.filter((unit) => unit.type === type).length + state.queues[team].filter((job) => job.type === type).length;
          const available = order.filter((building) => Sim.producers(state, team, building.unit).some((producer) => !state.queues[team].some((job) => job.producerId === producer.id)));
          available.sort((a, b) => population(a.unit) / weights[a.unit] - population(b.unit) / weights[b.unit]);
          const unlocking = !emergency && settings.micro && ((!built.has(BUILD_ORDERS[team][1].id) && army.length >= (brutal ? 1 : 2)) || (!built.has(BUILD_ORDERS[team][2].id) && army.length >= 3));
          if (!unlocking) {
            for (const building of available) {
              let affordable = true;
              for (const producer of Sim.producers(state, team, building.unit)) {
                // Reserve population for the next mine and the surviving scout.
                const reservedMilitary = army.length + state.queues[team].filter((job) => job.type !== 'commis').length;
                if (reservedMilitary >= militaryLimit) break;
                if (state.queues[team].some((job) => job.producerId === producer.id)) continue;
                if (Sim.recruit(state, building.unit, team, producer.id)) actions++;
                else affordable = false;
              }
              // Save for the missing role rather than endlessly buying cheaper infantry.
              if (!affordable) break;
            }
          }
          if (surplus) {
            // Scale paid production when income outpaces the existing producers,
            // including when population reservations prevent more recruitment.
            const investment = [...order].sort((a, b) => Sim.producers(state, team, a.unit).length - Sim.producers(state, team, b.unit).length)
              .find((building) => building.requires.every((id) => built.has(id)));
            if (investment && Sim.construct(state, team, investment.id)) actions++;
          }
          for (const building of order) {
            if (built.size === 3 && building.unit === preferred && Sim.producers(state, team, building.unit).length < settings.copies && state.rubies[team] >= 150 && Sim.construct(state, team, building.id)) actions++;
          }
        }
      }
      if (state.time >= 60 && !scouted && (settings.micro ? workers.length : army.length)) {
        const explorer = settings.micro ? workers.find((worker) => worker.id !== expedition?.worker) : army[0];
        if (explorer) {
          scout = explorer.id;
          scouted = true;
          Sim.order(state, [scout], enemyBase.x, enemyBase.y, null, true);
          actions++;
        }
      }
      const base = state.bases[team];
      const rally = { x: base.x + (team ? -110 : 110), y: base.y + (team ? 65 : -65) };
      const invaders = (brutal ? observedArmy : enemies).filter((enemy) => owned.some((mine) => distance(enemy, mine) < (brutal ? 400 : 240)));
      let threatenedEconomy = false;
      if (brutal) {
        for (const worker of workers) {
          const danger = observedArmy.filter((enemy) => distance(worker, enemy) < 260);
          const guards = army.filter((unit) => distance(worker, unit) < 280);
          if (power(danger) > power(guards)) {
            threatenedEconomy = true;
            evacuated.add(worker.id);
            if (!worker.retreat || worker.harvest) Sim.order(state, [worker.id], base.x, base.y, null, true);
          } else if (!danger.length) {
            evacuated.delete(worker.id);
          }
        }
        // An expansion skirmish must not cancel an army already attacking.
        if (threatenedEconomy || invaders.some((enemy) => distance(enemy, base) < 220)) {
          for (const unit of army) deployed.delete(unit.id);
        }
      }
      const defenders = army.filter((unit) => !brutal || !deployed.has(unit.id));
      if (invaders.length && !defending && defenders.length && (!brutal || state.time >= retreatUntil)) {
        Sim.order(state, defenders.map((unit) => unit.id), invaders[0].x, invaders[0].y, null, false);
        actions++;
      }
      defending = invaders.length > 0;
      const tryDevour = (unit) => {
        if (difficulty !== 'facile' && team === 1 && !defending) {
          const enemyInRange = [...enemies, ...state.monsters.filter((monster) => monster.hp > 0 && monster.targetId != null)]
            .some((enemy) => distance(unit, enemy) <= Sim.stats(unit.type, team).range + 75);
          if (!enemyInRange && unit.devour) return true;
          if (!enemyInRange && !unit.retreat && !unit.path.length &&
            !(unit.target?.hp > 0) && !deployed.has(unit.id) &&
            !raiders.has(unit.id) && unit.id !== scout) {
            const corpse = state.corpses.filter((item) =>
              item.expiresAt > state.time && distance(unit, item) < 200 &&
              Sim.visibleAt(state, team, item.x, item.y) &&
              !army.some((ally) => ally.devour?.corpseId === item.id))
              .sort((a, b) => distance(unit, a) - distance(unit, b))[0];
            if (corpse && Sim.devour(state, team, [unit.id], corpse.id)) {
              return true;
            }
          }
        }
        return false;
      };
      if (difficulty !== 'facile') {
        if (team === 0 && state.ingredients[team] >= 40 &&
          state.ragout.readyAt === null && state.ragout.expiresAt <= state.time) {
          if (Sim.cookDish(state, team).ok) actions++;
        }
      }
      const fighting = enemies.filter((enemy) => enemy.type !== 'commis' && army.some((unit) => distance(unit, enemy) < 200));
      const engaged = army.filter((unit) => unit.id !== scout && !raiders.has(unit.id) && fighting.some((enemy) => distance(unit, enemy) < 240));
      if (settings.micro && fighting.length && power(engaged) < power(fighting) * 0.6 && (!invaders.length || brutal && !invaders.some((enemy) => distance(enemy, base) < 220)) && state.time >= retreatUntil) {
        retreatUntil = state.time + 12;
        for (const unit of engaged) deployed.delete(unit.id);
        Sim.order(state, engaged.map((unit) => unit.id), rally.x, rally.y, null, true);
        actions++;
      }
      // After the opening raids, finish the game instead of cycling forever
      // between recapturable depots scattered across the enlarged map.
      const decisiveAttack = (metrics.waves >= 2 || state.time >= 480) &&
        (power(army) >= power(observedArmy) || saturated || state.rubies[team] >= 800 || state.time >= 600);
      const lateSiege = brutal && saturated && state.time >= 720;
      const destination = (!decisiveAttack && [...remembered.values()].sort((a, b) => distance(a, state.bases[team]) - distance(b, state.bases[team]))[0]) || intelligence.bases[0] || { x: enemyBase.x, y: enemyBase.y };
      if (brutal && !(lateSiege && decisiveAttack && waveRoute) && !defending && lastWave > 0 && state.time - lastWave > waveTravelTime && lastRegroup < lastWave) {
        deployed.clear();
        Sim.order(state, army.map((unit) => unit.id), rally.x, rally.y, null, false);
        lastRegroup = state.time;
      }
      const reinforcing = lateSiege && decisiveAttack && waveRoute && !defending && state.time >= retreatUntil &&
        army.some((unit) => waveRoute.ids.has(unit.id) && deployed.has(unit.id) && !unit.retreat);
      if (reinforcing) {
        const reinforcements = army.filter((unit) => !deployed.has(unit.id) && !unit.retreat && unit.id !== scout && !raiders.has(unit.id));
        if (reinforcements.length) {
          const ids = reinforcements.map((unit) => unit.id);
          const point = waveRoute.points[waveRoute.index];
          Sim.order(state, ids, point.x, point.y, null, false);
          Sim.order(state, ids, point.x, point.y, null, false, true);
          for (const id of ids) {
            deployed.add(id);
            waveRoute.ids.add(id);
          }
          actions++;
        }
      }
      const reserve = army.filter((unit) => !unit.devour && !deployed.has(unit.id) && unit.id !== scout && !raiders.has(unit.id));
      // Assemble reinforcements before launching; wave sizes never grow beyond
      // the population cap. Surviving troops can regroup after a lost fight.
      const attackWindow = !settings.micro || state.time >= (brutal ? owned.length > 1 ? 180 : 220 : 210);
      const garrison = brutal && intelligence.seenAt !== null && state.time - intelligence.seenAt < 90 ? 2 : 0;
      const attackers = brutal ? reserve.slice(garrison) : reserve;
      const waveStrength = attackers.reduce((strength, unit) => strength + unit.hp / Sim.stats(unit.type, 0).hp, 0);
      const counterattack = brutal && (state.time < counterUntil || threats.length >= Math.max(3, knownArmy.size) && army.length > threats.length * 1.5) && attackers.length >= 5;
      const enoughTroops = counterattack || waveStrength >= (brutal ? Math.min(12, settings.wave + metrics.waves * 2) : settings.wave) && attackWindow;
      const overdue = lastWave > 0 && state.time - lastWave > waveTravelTime;
      const assembly = brutal ? attackers : reserve;
      const assembled = assembly.filter((unit) => distance(unit, rally) < 240).length >= assembly.length * 0.7;
      // Scattered reserves must actually receive a regroup order; waiting for
      // assembled alone can strand defenders at a distant expansion forever.
      if (overdue && !assembled && !defending && state.time >= retreatUntil && state.time - lastRegroup >= 12) {
        Sim.order(state, assembly.map((unit) => unit.id), rally.x, rally.y, null, false);
        lastRegroup = state.time;
        actions++;
      }
      if (waveRoute) {
        const members = army.filter((unit) => waveRoute.ids.has(unit.id) && deployed.has(unit.id) && !unit.retreat);
        const point = waveRoute.points[waveRoute.index];
        if (!members.length) {
          waveRoute = null;
        } else if (members.filter((unit) => distance(unit, point) < 140).length >= members.length * 0.7 &&
          !(lateSiege && decisiveAttack && waveRoute.index === waveRoute.points.length - 1)) {
          waveRoute.index++;
          if (waveRoute.index === waveRoute.points.length) {
            waveRoute = null;
          } else {
            const next = waveRoute.points[waveRoute.index];
            Sim.order(state, members.map((unit) => unit.id), next.x, next.y, null, false, true);
            actions++;
          }
        }
      }
      if ((!brutal || attackers.length >= 5) && !defending && state.time >= retreatUntil && (enoughTroops || reserve.length > 0 && (saturated || overdue)) && assembled) {
        for (const unit of attackers) deployed.add(unit.id);
        launchAttack(state, attackers, destination, observedArmy);
        actions++;
        counterUntil = 0;
        metrics.waves++;
        metrics.waveSizes.push(attackers.length);
        lastWave = state.time;
      }
      if (difficulty !== 'facile') {
        const baseThreatened = defending || threats.some((enemy) => distance(enemy, base) < 650);
        const hunters = army.filter((unit) =>
          unit.id !== scout && !raiders.has(unit.id));
        const enemyNearHunters = observedArmy.some((enemy) =>
          hunters.some((unit) => distance(unit, enemy) < 300));
        const waveHasPriority = forceWave || metrics.waves > 0 && lastWave === state.time;
        if (baseThreatened || enemyNearHunters || waveHasPriority || !hunters.length) {
          if (huntingCamp) {
            huntingCamp = null;
            nextHunt = state.time + 30;
            const interrupted = hunters.filter((unit) => !deployed.has(unit.id));
            for (const unit of interrupted) {
              const enemy = observedArmy.filter((candidate) => distance(unit, candidate) < 300)
                .sort((a, b) => distance(unit, a) - distance(unit, b))[0];
              const goal = enemy || rally;
              Sim.order(state, [unit.id], goal.x, goal.y, enemy || null, false);
              actions++;
            }
          }
        }
        if (huntingCamp && !state.monsters.some((monster) =>
          monster.hp > 0 && monster.camp === huntingCamp.name)) {
          huntingCamp = null;
          nextHunt = state.time + 30;
          for (const unit of hunters) {
            if (tryDevour(unit)) actions++;
          }
          const returning = hunters.filter((unit) => !unit.devour)
            .map((unit) => unit.id);
          Sim.order(state, returning, rally.x, rally.y, null, false);
          actions++;
        }
        const attacking = army.some((unit) => deployed.has(unit.id) || raiders.has(unit.id));
        if (!huntingCamp && !baseThreatened && !enemyNearHunters &&
          !waveHasPriority && !attacking && hunters.length >= 6 &&
          state.time >= nextHunt && state.time >= retreatUntil) {
          huntingCamp = state.camps.filter((camp) =>
            state.monsters.some((monster) =>
              monster.hp > 0 && monster.camp === camp.name))
            .sort((a, b) => distance(a, base) - distance(b, base))[0] || null;
        }
        if (huntingCamp) {
          const prey = state.monsters.find((monster) =>
            monster.hp > 0 && !monster.returning && monster.camp === huntingCamp.name);
          for (const unit of hunters) {
            if (tryDevour(unit)) {
              actions++;
              continue;
            }
            if (prey && Sim.canSee(state, team, prey)) {
              if (unit.target !== prey) {
                Sim.order(state, [unit.id], prey.x, prey.y, prey, false);
                actions++;
              }
            } else if (!unit.path.length || unit.target) {
              Sim.order(state, [unit.id], huntingCamp.x, huntingCamp.y, null, false);
              actions++;
            }
          }
          return actions;
        }
      }
      const visibleBase = Sim.canSee(state, team, state.bases[1 - team]) ? state.bases[1 - team] : null;
      if (!brutal && settings.micro && state.time > 180 && raiders.size < 3 && army.length >= 10) {
        for (const unit of [...army].sort((a, b) => Sim.stats(b.type, team).speed - Sim.stats(a.type, team).speed)) {
          if (raiders.size >= 3) break;
          if (unit.type !== 'archer' || raiders.has(unit.id)) continue;
          raiders.add(unit.id);
          Sim.order(state, [unit.id], mines[1 - team].x, mines[1 - team].y, null, false);
          actions++;
        }
      }
      for (const id of raiders) {
        if (!army.some((unit) => unit.id === id)) raiders.delete(id);
      }
      const siege = decisiveAttack && visibleBase && army.filter((unit) => distance(unit, visibleBase) < 500).length >= 4;
      for (const unit of army) {
        if (tryDevour(unit)) {
          actions++;
          continue;
        }
        // Once a real wave reaches the main, finish the siege rather than
        // chasing fresh defenders or abandoning every damaged assault.
        if (siege && distance(unit, visibleBase) < 300) {
          if (unit.target !== visibleBase || unit.retreat) {
            Sim.order(state, [unit.id], visibleBase.x, visibleBase.y, visibleBase, false);
            actions++;
          }
          continue;
        }
        const range = Sim.stats(unit.type, team).range;
        const guardingMain = brutal && army.indexOf(unit) < garrison;
        const localInvaders = guardingMain ? invaders.filter((enemy) => distance(enemy, base) < 400) : invaders;
        if (localInvaders.length && (!brutal || !deployed.has(unit.id)) && !unit.retreat && (!brutal || state.time >= retreatUntil) && !enemies.some((enemy) => distance(unit, enemy) <= range)) {
          const invader = [...localInvaders].sort((a, b) => distance(unit, a) - distance(unit, b))[0];
          if (unit.target !== invader) {
            Sim.order(state, [unit.id], invader.x, invader.y, invader, false);
            actions++;
          }
          continue;
        }
        const targets = [...enemies, ...(visibleBase ? [visibleBase] : [])]
          .filter((enemy) => distance(unit, enemy) <= range + (enemy.base ? 45 : 0))
          .sort((a, b) => (raiders.has(unit.id) || unit.id === scout ? Number(b.type === 'commis') - Number(a.type === 'commis') : 0) || a.hp - b.hp || a.id - b.id);
        if (brutal && unit.type === 'mage') {
          const splash = Sim.stats(unit.type, team).splash;
          const impact = (target) => enemies.reduce((sum, enemy) => sum + Number(distance(target, enemy) <= splash), 0);
          targets.sort((a, b) => impact(b) - impact(a) || a.hp - b.hp);
        }
        const threat = enemies.find((enemy) => distance(unit, enemy) < 180);
        const cover = army.some((ally) => ally.id !== unit.id && ally.hp >= ally.max * 0.25 && threat && distance(ally, threat) <= Sim.stats(ally.type, team).range + 75);
        const close = enemies.filter((enemy) => enemy.type !== 'commis' && distance(unit, enemy) < (unit.type === 'mage' ? 65 : brutal ? 100 : 90) && (unit.type === 'mage' || Sim.stats(enemy.type, enemy.team).range < range))
          .sort((a, b) => distance(unit, a) - distance(unit, b))[0];
        const wounded = unit.hp < unit.max * 0.25;
        if (settings.micro && range >= 100 && close && unit.cool > settings.reaction && !unit.retreat) {
          const gap = distance(unit, close) || 1;
          const step = brutal ? 30 : 65;
          Sim.order(state, [unit.id], unit.x + (unit.x - close.x) / gap * step, unit.y + (unit.y - close.y) / gap * step, null, true);
          actions++;
        } else if ((settings.micro || difficulty === 'normal') && wounded && threat && cover) {
          if (!unit.retreat) {
            Sim.disengage(state, [unit.id]);
            actions++;
          }
        } else if (targets.length && !unit.retreat) {
          if (unit.target !== targets[0]) {
            Sim.order(state, [unit.id], targets[0].x, targets[0].y, targets[0], false);
            actions++;
          }
        } else if (!unit.path.length && !unit.target && waveRoute?.ids.has(unit.id) && deployed.has(unit.id) && !unit.retreat) {
          const point = waveRoute.points[waveRoute.index];
          if (distance(unit, point) >= 140) {
            Sim.order(state, [unit.id], point.x, point.y, null, false, true);
            actions++;
          }
        } else if (!unit.path.length && !unit.target) {
          const victim = raiders.has(unit.id) ? enemies.filter((enemy) => enemy.type === 'commis').sort((a, b) => distance(unit, a) - distance(unit, b))[0] : null;
          const guardPost = guardingMain ? base : null;
          const goal = localInvaders[0] || guardPost || victim || (raiders.has(unit.id) ? mines[1 - team] : null) || (deployed.has(unit.id) || unit.id === scout ? destination : rally);
          Sim.order(state, [unit.id], goal.x, goal.y, victim || null, false);
          actions++;
        }
      }
      // Last, so defensive micro cannot replace the safety order this update.
      // This includes deployed troops and raiders, leaving only the garrison.
      if (forceWave && state.time - lastWave >= 120) {
        const reliefArmy = army.slice(garrison);
        if (reliefArmy.length) {
          const goal = enemyBase;
          const ids = reliefArmy.map((unit) => unit.id);
          launchAttack(state, reliefArmy, goal, observedArmy);
          for (const id of ids) {
            deployed.add(id);
            raiders.delete(id);
          }
          retreatUntil = 0;
          counterUntil = 0;
          metrics.waves++;
          metrics.waveSizes.push(ids.length);
          lastWave = state.time;
          actions++;
        }
      }
      return actions;
    },
  };
}
