import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { command, digest, pack, view } from '../lib/match.mjs';
import { RealtimeClient } from '../public/game/realtime.js';
import { CendreSim as Sim } from '../public/game/sim.js';
import { BUILDINGS } from '../public/game/slots.js';
import { Match } from '../server/match-do.js';
import { Horloge } from './latence-duel.mjs';

const CODE = 'ABCDEFG';
const DELAI = 40;
const MINUTE = 60_000;
const TICKS_PAR_SECONDE = 20;
const GRAINE = 42;
const CHAMPS_STABLES = ['mines', 'camps', 'watchtowers', 'braises', 'bases', 'corpses'];

function creerSocket(match, horloge, sockets, joueurs) {
  return class Socket {
    readyState = 0;

    constructor(url) {
      this.serveur = {
        attachment: { url, deadline: horloge.temps + 5000, closed: false },
        serializeAttachment(value) {
          this.attachment = structuredClone(value);
        },
        deserializeAttachment() {
          return structuredClone(this.attachment);
        },
        send: (data) => {
          const equipe = this.serveur.attachment.team;
          const joueur = joueurs[equipe];
          // Figer la vue au moment de l’émission, avant les 40 ms de transport.
          let reference = null;
          let octetsFilesOmises = 0;
          let octetsUnites = 0;
          const message = JSON.parse(data);
          if (message.type === 'snapshot') {
            octetsUnites = Buffer.byteLength(JSON.stringify(message.state.units));
            const vue = view(match.sim, equipe, { compactUnits: false });
            const champs = Object.fromEntries(CHAMPS_STABLES.map((champ) => [champ, vue[champ]]));
            reference = {
              ...JSON.parse(JSON.stringify({
                units: vue.units, queues: vue.queues, damageEvents: vue.damageEvents, ...champs,
              })),
              visible: match.sim.visible[equipe].slice(),
              explored: match.sim.explored[equipe].slice(),
            };
            // Reconstituer la taille du même JSON avec le champ envoyé à chaque snapshot.
            if (!Object.hasOwn(message.state, 'queues')) {
              octetsFilesOmises = Buffer.byteLength(`,"queues":${JSON.stringify(reference.queues)}`);
            }
          }
          const octets = Buffer.byteLength(data);
          horloge.setTimeout(() => {
            if (joueur) {
              joueur.reference = reference;
              joueur.receptions.push({
                temps: horloge.temps, octets, octetsFilesOmises, octetsUnites, snapshot: reference !== null,
              });
            }
            this.onmessage({ data });
          }, DELAI);
        },
        close: () => horloge.setTimeout(() => this.close(), DELAI),
      };
      sockets.push(this.serveur);
      horloge.setTimeout(() => {
        this.readyState = 1;
        this.onopen();
      }, 0);
    }

    send(data) {
      horloge.setTimeout(() => match.webSocketMessage(this.serveur, data), DELAI);
    }

    close() {
      this.readyState = 3;
      this.onclose?.();
    }
  };
}

function premierChamp(attendu, recu, chemin = []) {
  if (attendu && recu && typeof attendu === 'object' && typeof recu === 'object' &&
      Array.isArray(attendu) === Array.isArray(recu)) {
    for (const cle of new Set([...Object.keys(attendu), ...Object.keys(recu)])) {
      if (!isDeepStrictEqual(attendu[cle], recu[cle])) {
        return premierChamp(attendu[cle], recu[cle], [...chemin, cle]);
      }
    }
  }
  return chemin.join('.') || 'unité';
}

function retirerEvenement(evenements, evenement) {
  const index = evenements.findIndex((candidat) => isDeepStrictEqual(candidat, evenement));
  if (index === -1) return false;
  evenements.splice(index, 1);
  return true;
}

function verifierSnapshot(joueur, { state, team, status }) {
  joueur.etat = state;
  joueur.statut = status;
  const reference = joueur.reference;
  const attendues = reference.units;
  const ecartsAvant = joueur.ecarts;
  const recues = state.units;
  const tick = Math.round(state.time * TICKS_PAR_SECONDE);
  const ecart = (id, champ) => {
    const premier = { tick, equipe: team, id, champ };
    joueur.premierEcart ??= premier;
    joueur.ecarts++;
  };
  for (let index = 0; index < Math.max(attendues.length, recues.length); index++) {
    const attendu = attendues[index];
    const recu = recues[index];
    const id = attendu?.id ?? recu?.id ?? null;
    if (index >= attendues.length || index >= recues.length) {
      ecart(id, 'présence');
    } else if (!isDeepStrictEqual(attendu, recu)) {
      ecart(id, premierChamp(attendu, recu));
    }
  }
  // Un défaut de reconstruction ne doit pas interrompre le scénario de charge.
  joueur.unitesPourOrdres = joueur.ecarts === ecartsAvant ? recues : attendues;
  for (const champ of ['visible', 'explored']) {
    const grille = state[champ]?.[team];
    const attendue = reference[champ];
    if (grille?.length !== attendue.length) ecart(null, `${champ}.length`);
    for (let caseIndex = 0; caseIndex < attendue.length; caseIndex++) {
      if (grille?.[caseIndex] !== attendue[caseIndex]) {
        ecart(null, `${champ}.${caseIndex}`);
      }
    }
  }
  for (const champ of CHAMPS_STABLES) {
    if (!isDeepStrictEqual(reference[champ], state[champ])) {
      ecart(null, premierChamp(reference[champ], state[champ], [champ]));
    }
  }
  const recents = joueur.degatsVus.filter((event) => state.time - event.time < 2);
  const degatsRecus = [...(state.damageEvents ?? [])];
  for (const evenement of reference.damageEvents) {
    if (!retirerEvenement(degatsRecus, evenement)) ecart(null, 'damageEvents.manquant');
    retirerEvenement(recents, evenement);
  }
  joueur.degatsVus = [...recents, ...reference.damageEvents];
  for (const evenement of degatsRecus) {
    if (!retirerEvenement(recents, evenement)) ecart(null, 'damageEvents.inattendu');
  }
  const files = state.queues?.map((file, equipe) => file.map((job, index) => {
    const attendu = reference.queues[equipe]?.[index];
    if (Math.abs(job.remaining - attendu?.remaining) <= 1e-6) {
      return { ...job, remaining: attendu.remaining };
    }
    return job;
  }));
  if (!isDeepStrictEqual(reference.queues, files)) {
    ecart(null, premierChamp(reference.queues, files, ['queues']));
  }
}

function jouer(joueur, equipe, attaquer, aleatoire) {
  if (joueur.statut !== 'playing') return;
  const envoyer = (ordre) => {
    if (!joueur.client.command(ordre, ++joueur.sequence)) {
      throw new Error(`Commande impossible à envoyer pour l’équipe ${equipe}.`);
    }
  };
  // Réserver les dépenses de la rafale sur une copie de la vue client.
  const budget = structuredClone({ ...joueur.etat, units: joueur.unitesPourOrdres });
  const batiment = BUILDINGS[equipe][0];
  const slot = budget.slots[equipe].find(({ occupe }) => !occupe);
  if (slot && budget.rubies[equipe] >= batiment.cost &&
      !budget.slots[equipe].some(({ batiment: construit }) => construit?.type === batiment.id)) {
    const ordre = { kind: 'construct', type: batiment.id, baseId: slot.baseId, slotId: slot.id };
    command(budget, equipe, ordre);
    envoyer(ordre);
  }
  const objectifOuvriers = 6;
  const ouvriers = budget.units.filter(({ team, type }) => team === equipe && type === 'commis').length;
  let ouvriersEnFile = budget.queues[equipe].filter(({ type }) => type === 'commis').length;
  const militaires = aleatoire() < 0.5 ? ['knight', 'hero'] : ['hero', 'knight'];
  const types = ['commis', ...militaires];
  while (true) {
    const type = types.find((candidat) => (candidat !== 'commis' || ouvriers + ouvriersEnFile < objectifOuvriers) &&
      Sim.canRecruit(budget, equipe, candidat));
    if (!type) break;
    if (type === 'commis') ouvriersEnFile++;
    const ordre = { kind: 'recruit', type };
    command(budget, equipe, ordre);
    envoyer(ordre);
  }
  // Entre deux vagues, défendre une base endommagée si l’ennemi est encore proche.
  const base = joueur.etat.bases[equipe];
  const menace = base.hp < base.max && joueur.unitesPourOrdres.some((unite) =>
    unite.team !== equipe && unite.type !== 'commis' && unite.hp > 0 &&
    Math.hypot(unite.x - base.x, unite.y - base.y) < 450);
  if (attaquer || menace) {
    const ids = joueur.unitesPourOrdres
      .filter((unite) => unite.team === equipe && unite.hp > 0 && unite.type !== 'commis')
      .map(({ id }) => id);
    const { x, y } = joueur.etat.bases[attaquer ? 1 - equipe : equipe];
    if (ids.length) envoyer({ kind: 'attackMove', ids, x, y });
  }
}

function mesurer(receptions, debut, fin) {
  let gauche = 0;
  let fenetre = 0;
  let octets = 0;
  let octetsFilesOmises = 0;
  let octetsUnites = 0;
  let max = 0;
  let snapshots = 0;
  for (const [droite, reception] of receptions.entries()) {
    if (reception.temps > fin) break;
    fenetre += reception.octets;
    while (receptions[gauche].temps <= reception.temps - 1000) {
      fenetre -= receptions[gauche++].octets;
    }
    if (reception.temps <= debut) continue;
    octets += reception.octets;
    octetsFilesOmises += reception.octetsFilesOmises;
    octetsUnites += reception.octetsUnites;
    max = Math.max(max, fenetre);
    snapshots += Number(reception.snapshot);
  }
  return {
    octets,
    moyen: Math.round(1000 * octets / (fin - debut)),
    moyenAvant: Math.round(1000 * (octets + octetsFilesOmises) / (fin - debut)),
    max,
    snapshots,
    unitesMoyenneOctets: snapshots ? Math.round(octetsUnites / snapshots) : 0,
  };
}

export async function mesurerDuelComplet(minutes = 10) {
  if (!Number.isSafeInteger(minutes) || minutes < 1 || !Number.isSafeInteger(minutes * MINUTE + DELAI)) {
    throw new Error('--minutes attend un entier strictement positif.');
  }
  const horloge = new Horloge();
  const sockets = [];
  const attentes = [];
  const joueurs = [0, 1].map((equipe) => ({
    equipe, token: `duel-complet-${equipe}`, sequence: 0, receptions: [], ecarts: 0,
    dernierTotalEcarts: 0, premierEcart: null, degatsVus: [],
  }));
  let graine = GRAINE;
  const aleatoire = () => {
    graine = (Math.imul(1664525, graine) + 1013904223) >>> 0;
    return graine / 2 ** 32;
  };
  const salon = {
    code: CODE,
    created: 0,
    started: true,
    startAt: 0,
    players: await Promise.all(joueurs.map(async ({ equipe, token }) => ({
      team: equipe, hash: await digest(token), seen: 0, seq: 0,
    }))),
    state: pack(Sim.create()),
  };
  const match = new Match({
    storage: {
      get: async () => structuredClone(salon),
      put: async () => {},
      setAlarm: async () => {},
      deleteAlarm: async () => {},
    },
    blockConcurrencyWhile: (executer) => executer(),
    getWebSockets: () => sockets,
    waitUntil: (promesse) => attentes.push(promesse),
  }, {}, horloge);
  await match.ready;

  const Socket = creerSocket(match, horloge, sockets, joueurs);
  const connexions = Promise.all(joueurs.map((joueur) => {
    joueur.client = new RealtimeClient({
      Socket,
      clock: horloge,
      now: () => horloge.temps,
      onStatus: (statut) => {
        if (statut !== 'connected') throw new Error(`Équipe ${joueur.equipe} : ${statut}`);
      },
      onSnapshot: (snapshot) => verifierSnapshot(joueur, snapshot),
    });
    return joueur.client.connect({ code: CODE, token: joueur.token });
  }));
  await horloge.avancer(140);
  await connexions;

  const tableau = [];
  for (let minute = 1; minute <= minutes; minute++) {
    const fin = minute * MINUTE;
    for (let instant = fin - MINUTE + 5000; instant <= fin; instant += 5000) {
      await horloge.avancer(instant);
      for (const joueur of joueurs) jouer(joueur, joueur.equipe, instant % 30_000 === 0, aleatoire);
    }
    const vivantes = match.sim.units.filter(({ hp }) => hp > 0).length;
    // Toutes les trames émises jusqu'à la borne sont livrées 40 ms plus tard.
    await horloge.avancer(fin + DELAI);
    const ligne = { minute, vivantes };
    for (const joueur of joueurs) {
      const { equipe, receptions, ecarts, dernierTotalEcarts } = joueur;
      const { moyen, max } = mesurer(receptions, fin - MINUTE + DELAI, fin + DELAI);
      ligne[`moyen E${equipe}`] = moyen;
      ligne[`max E${equipe}`] = max;
      ligne[`écarts E${equipe}`] = ecarts - dernierTotalEcarts;
      joueur.dernierTotalEcarts = ecarts;
    }
    tableau.push(ligne);
  }
  match.stopTimer();
  for (const { client } of joueurs) client.close();
  await Promise.all(attentes);

  const stats = Sim.matchStats(match.sim);
  const resume = {
    minutes,
    graine: GRAINE,
    delaiMs: DELAI,
    secondesJeu: Math.round(stats.duration * TICKS_PAR_SECONDE) / TICKS_PAR_SECONDE,
    vainqueur: match.sim.winner,
    unitesProduites: stats.teams.reduce((total, equipe) => total + equipe.unitsProduced, 0),
    unitesMortes: stats.teams.reduce((total, equipe) => total + equipe.unitsLost, 0),
    clients: joueurs.map(({ equipe, receptions, ecarts, premierEcart }) => ({
      equipe, ...mesurer(receptions, DELAI, minutes * MINUTE + DELAI), ecarts, premierEcart,
    })),
  };
  return { tableau, resume };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--minutes' || !/^\d+$/.test(args[1]))) {
      throw new Error('Usage : node scripts/duel-complet.mjs [--minutes N]');
    }
    const { tableau, resume } = await mesurerDuelComplet(args.length ? Number(args[1]) : undefined);
    console.log('Débit par client en octets/s de JSON reçu (moyenne et maximum sur 1 s glissante).');
    console.table(tableau);
    console.log(JSON.stringify(resume));
    if (resume.clients.some(({ ecarts }) => ecarts > 0)) process.exitCode = 1;
  } catch (erreur) {
    console.error(erreur.message);
    process.exitCode = 1;
  }
}
