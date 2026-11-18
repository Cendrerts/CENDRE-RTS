import { pathToFileURL } from 'node:url';
import { digest, pack } from '../lib/match.mjs';
import { RealtimeClient, RealtimeMotion } from '../public/game/realtime.js';
import { CendreSim } from '../public/game/sim.js';
import { Match } from '../server/match-do.js';

const DELAIS_PAR_DEFAUT = [0, 40, 100];
const CODE = 'ABCDEFG';
const DEBUT_PARTIE = 3000;
const INTERVALLE_IMAGE = 16;

class Horloge {
  temps = 0;
  taches = new Set();
  Date = { now: () => this.temps };

  setTimeout = (executer, delai) => {
    const tache = { executer, echeance: this.temps + delai };
    this.taches.add(tache);
    return tache;
  };

  clearTimeout = (tache) => this.taches.delete(tache);

  setInterval = (executer, periode) => {
    const tache = this.setTimeout(executer, periode);
    tache.periode = periode;
    return tache;
  };

  clearInterval = this.clearTimeout;

  async avancer(jusqua) {
    while (true) {
      const prochaine = [...this.taches].sort((a, b) => a.echeance - b.echeance)[0];
      if (!prochaine || prochaine.echeance > jusqua) break;
      this.temps = prochaine.echeance;
      this.taches.delete(prochaine);
      if (prochaine.periode) {
        prochaine.echeance += prochaine.periode;
        this.taches.add(prochaine);
      }
      await prochaine.executer();
    }
    this.temps = jusqua;
  }
}

function creerSocket(match, horloge, sockets, delai) {
  return class Socket {
    readyState = 0;

    constructor(url) {
      // Le transport et les métadonnées de l'upgrade Cloudflare sont simulés.
      this.serveur = {
        attachment: { url, deadline: horloge.temps + 5000, closed: false },
        serializeAttachment(value) {
          this.attachment = structuredClone(value);
        },
        deserializeAttachment() {
          return structuredClone(this.attachment);
        },
        send: (data) => horloge.setTimeout(() => this.onmessage?.({ data }), delai),
        close: () => horloge.setTimeout(() => this.close(), delai),
      };
      sockets.push(this.serveur);
      horloge.setTimeout(() => {
        this.readyState = 1;
        this.onopen();
      }, 0);
    }

    send(data) {
      horloge.setTimeout(() => match.webSocketMessage(this.serveur, data), delai);
    }

    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      this.onclose?.();
    }
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

async function mesurerDelai(delai) {
  const horloge = new Horloge();
  const sockets = [];
  const attentes = [];
  const sessions = [0, 1].map((team) => ({ team, token: `mesure-equipe-${team}` }));
  // Repartir d'un salon sauvegardé permet d'utiliser hello sans générer de jetons aléatoires.
  const salon = {
    code: CODE,
    created: 0,
    started: true,
    startAt: DEBUT_PARTIE,
    players: await Promise.all(sessions.map(async ({ team, token }) => ({
      team,
      hash: await digest(token),
      seen: 0,
      seq: 0,
    }))),
    state: pack(CendreSim.create()),
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

  const Socket = creerSocket(match, horloge, sockets, delai);
  const joueurs = sessions.map(() => {
    const motion = new RealtimeMotion();
    const joueur = { motion };
    joueur.client = new RealtimeClient({
      Socket,
      clock: horloge,
      now: () => horloge.temps,
      onSnapshot: ({ state, status }) => {
        joueur.etat = state;
        joueur.statut = status;
        motion.receive(state.units, horloge.temps, state.time);
      },
    });
    return joueur;
  });
  const connexions = Promise.allSettled(joueurs.map(({ client }, equipe) => client.connect({
    code: CODE,
    token: sessions[equipe].token,
  })));
  const instantOrdre = DEBUT_PARTIE + 2000;
  await horloge.avancer(instantOrdre);
  if (!joueurs.every(({ statut }) => statut === 'playing')) {
    throw new Error(`Le duel n'a pas démarré avec ${delai} ms de délai.`);
  }
  await connexions;

  const [joueur] = joueurs;
  const ouvrier = joueur.etat.units.find((unit) => unit.team === 0 && unit.type === 'commis');
  const positionAffichee = () => {
    const unite = joueur.etat.units.find(({ id }) => id === ouvrier.id);
    return joueur.motion.position(unite, horloge.temps);
  };
  let precedente = positionAffichee();
  const ordre = { kind: 'move', ids: [ouvrier.id], x: precedente.x + 300, y: precedente.y };
  const uniteServeur = () => match.sim.units.find(({ id }) => id === ouvrier.id);
  const distanceServeurInitiale = distance(uniteServeur(), ordre);
  const distanceInitiale = distance(precedente, ordre);
  if (!joueur.client.command(ordre, 1)) throw new Error('Ordre refusé par le client.');
  joueur.motion.predict(ordre, joueur.etat, 0, horloge.temps);

  let premiereImage = null;
  let sautMax = 0;
  let ecartServeur;
  for (let image = 1; image * INTERVALLE_IMAGE <= 2000; image++) {
    const ecoule = image * INTERVALLE_IMAGE;
    if (ecoule > 1000 && ecartServeur === undefined) {
      // À 1 s, l'écran affiche encore l'image rendue à 992 ms.
      await horloge.avancer(instantOrdre + 1000);
      ecartServeur = distance(precedente, uniteServeur());
    }
    await horloge.avancer(instantOrdre + ecoule);
    const position = positionAffichee();
    if (premiereImage === null && distance(position, ordre) < distanceInitiale) {
      premiereImage = image;
    }
    sautMax = Math.max(sautMax, distance(position, precedente));
    precedente = position;
  }

  if (distance(uniteServeur(), ordre) >= distanceServeurInitiale) {
    throw new Error('L’ouvrier du serveur ne s’est pas rapproché de la destination.');
  }
  joueurs[1].client.send({ type: 'leave' });
  await horloge.avancer(horloge.temps + 2 * delai);
  if (!joueurs.every(({ statut }) => statut === 'ended')) {
    throw new Error('La fin du duel n’a pas été reçue par les deux clients.');
  }
  for (const { client } of joueurs) client.close();
  await Promise.all(attentes);
  return { delai, premiereImage, sautMax, ecartServeur };
}

export async function mesurerLatenceDuel(delais = DELAIS_PAR_DEFAUT) {
  if (!delais.length || delais.some((delai) => !Number.isSafeInteger(delai) || delai < 0)) {
    throw new Error('Les délais doivent être des entiers positifs ou nuls en millisecondes.');
  }
  const mesures = [];
  for (const delai of delais) {
    mesures.push(await mesurerDelai(delai));
  }
  return { delais: mesures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const argumentsCLI = process.argv.slice(2);
    const [option, liste] = argumentsCLI;
    if (argumentsCLI.length && (argumentsCLI.length !== 2 || option !== '--delai' || !/^\d+(,\d+)*$/.test(liste))) {
      throw new Error('Usage : node scripts/latence-duel.mjs [--delai 0,40,100]');
    }
    const resultat = await mesurerLatenceDuel(liste?.split(',').map(Number));
    console.table(resultat.delais.map(({ delai, premiereImage, sautMax, ecartServeur }) => ({
      'Délai aller (ms)': delai,
      premiereImage,
      'sautMax (px)': sautMax.toFixed(2),
      'ecartServeur (px)': ecartServeur.toFixed(2),
    })));
    console.log(JSON.stringify(resultat));
  } catch (erreur) {
    console.error(erreur.message);
    process.exitCode = 1;
  }
}
