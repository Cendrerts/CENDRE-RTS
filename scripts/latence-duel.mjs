import { pathToFileURL } from 'node:url';
import { digest, pack } from '../lib/match.mjs';
import { RealtimeClient, RealtimeMotion } from '../public/game/realtime.js';
import { CendreSim } from '../public/game/sim.js';
import { Match } from '../server/match-do.js';

const DELAIS_PAR_DEFAUT = [0, 40, 100];
const GIGUES_PAR_DEFAUT = [0, 40];
const CODE = 'ABCDEFG';
const DEBUT_PARTIE = 3000;
const INSTANT_ORDRE = DEBUT_PARTIE + 2000;
const DEBUT_TROU = INSTANT_ORDRE + 500;
const DUREE_TROU = 300;
const INTERVALLE_IMAGE = 16;

export class Horloge {
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

function creerSocket(match, horloge, sockets, delai, gigue, finTrou, compterLivraisonGroupee) {
  return class Socket {
    readyState = 0;

    constructor(url) {
      let graine = 42;
      let echeancePrecedente = -Infinity;
      let livraisonPrecedente = -Infinity;
      // Le transport et les métadonnées de l'upgrade Cloudflare sont simulés.
      this.serveur = {
        attachment: { url, deadline: horloge.temps + 5000, closed: false },
        serializeAttachment(value) {
          this.attachment = structuredClone(value);
        },
        deserializeAttachment() {
          return structuredClone(this.attachment);
        },
        send: (data) => {
          graine = (Math.imul(1664525, graine) + 1013904223) >>> 0;
          const supplement = (graine / 2 ** 32) * gigue;
          let echeance = horloge.temps + delai + supplement;
          // Le trou bloque les livraisons prévues dans la fenêtre, puis la file repart en ordre.
          if (echeance >= DEBUT_TROU && echeance < finTrou) echeance = finTrou;
          echeance = Math.max(echeance, echeancePrecedente);
          echeancePrecedente = echeance;
          horloge.setTimeout(() => {
            if (livraisonPrecedente === horloge.temps) compterLivraisonGroupee();
            livraisonPrecedente = horloge.temps;
            this.onmessage?.({ data });
          }, echeance - horloge.temps);
        },
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

async function mesurerDelai(delai, gigue, trou) {
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

  const finTrou = DEBUT_TROU + (trou ? DUREE_TROU : 0);
  let messagesGroupes = 0;
  const Socket = creerSocket(match, horloge, sockets, delai, gigue, finTrou, () => {
    messagesGroupes++;
  });
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
  await horloge.avancer(INSTANT_ORDRE);
  if (!joueurs.every(({ statut }) => statut === 'playing')) {
    throw new Error(`Le duel n'a pas démarré avec ${delai} ms de délai.`);
  }
  await connexions;
  messagesGroupes = 0;

  const [joueur] = joueurs;
  const ouvrier = joueur.etat.units.find((unit) => unit.team === 0 && unit.type === 'commis');
  const positionAffichee = () => {
    const unite = joueur.etat.units.find(({ id }) => id === ouvrier.id);
    return joueur.motion.position(unite, horloge.temps);
  };
  let precedente = positionAffichee();
  const ordre = { kind: 'move', ids: [ouvrier.id], x: precedente.x + 600, y: precedente.y };
  const uniteServeur = () => match.sim.units.find(({ id }) => id === ouvrier.id);
  const distanceServeurInitiale = distance(uniteServeur(), ordre);
  const distanceInitiale = distance(precedente, ordre);
  if (!joueur.client.command(ordre, 1)) throw new Error('Ordre refusé par le client.');
  joueur.motion.predict(ordre, joueur.etat, 0, horloge.temps);

  let premiereImage = null;
  let sautMax = 0;
  let ecartServeur;
  const deplacements = [];
  for (let image = 1; image * INTERVALLE_IMAGE <= 3000; image++) {
    const ecoule = image * INTERVALLE_IMAGE;
    if (ecoule > 1000 && ecartServeur === undefined) {
      // À 1 s, l'écran affiche encore l'image rendue à 992 ms.
      await horloge.avancer(INSTANT_ORDRE + 1000);
      ecartServeur = distance(precedente, uniteServeur());
    }
    await horloge.avancer(INSTANT_ORDRE + ecoule);
    const position = positionAffichee();
    if (premiereImage === null && distance(position, ordre) < distanceInitiale) {
      premiereImage = image;
    }
    const deplacement = distance(position, precedente);
    deplacements.push(deplacement);
    sautMax = Math.max(sautMax, deplacement);
    precedente = position;
  }
  // À 3 s, l'écran affiche encore l'image rendue à 2992 ms.
  await horloge.avancer(INSTANT_ORDRE + 3000);
  const ecartServeur3s = distance(precedente, uniteServeur());

  if (distance(uniteServeur(), ordre) >= distanceServeurInitiale) {
    throw new Error('L’ouvrier du serveur ne s’est pas rapproché de la destination.');
  }
  const moyenne = deplacements.reduce((total, deplacement) => total + deplacement, 0) / deplacements.length;
  const sautsVisibles = deplacements.filter((deplacement) => deplacement > 2 * moyenne).length;
  const messagesGroupesMesures = messagesGroupes;
  joueurs[1].client.send({ type: 'leave' });
  await horloge.avancer(horloge.temps + 2 * delai + gigue);
  if (!joueurs.every(({ statut }) => statut === 'ended')) {
    throw new Error('La fin du duel n’a pas été reçue par les deux clients.');
  }
  for (const { client } of joueurs) client.close();
  await Promise.all(attentes);
  return {
    delai, gigue, trou, premiereImage, sautMax, ecartServeur, ecartServeur3s, sautsVisibles,
    messagesGroupes: messagesGroupesMesures,
  };
}

export async function mesurerLatenceDuel(delais = DELAIS_PAR_DEFAUT, gigues = GIGUES_PAR_DEFAUT) {
  for (const liste of [delais, gigues]) {
    if (!liste.length || liste.some((valeur) => !Number.isSafeInteger(valeur) || valeur < 0)) {
      throw new Error('Les délais et gigues doivent être des entiers positifs ou nuls en millisecondes.');
    }
  }
  const mesures = [];
  const gigueMax = Math.max(...gigues);
  for (const delai of delais) {
    for (const gigue of gigues) {
      mesures.push(await mesurerDelai(delai, gigue, false));
    }
    mesures.push(await mesurerDelai(delai, gigueMax, true));
  }
  return { delais: mesures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const argumentsCLI = process.argv.slice(2);
    const options = new Map();
    for (let index = 0; index < argumentsCLI.length; index += 2) {
      const [option, liste] = argumentsCLI.slice(index, index + 2);
      if (!['--delai', '--gigue'].includes(option) || options.has(option) || !/^\d+(,\d+)*$/.test(liste)) {
        throw new Error('Usage : node scripts/latence-duel.mjs [--delai 0,40,100] [--gigue 0,40]');
      }
      options.set(option, liste.split(',').map(Number));
    }
    const resultat = await mesurerLatenceDuel(options.get('--delai'), options.get('--gigue'));
    console.table(resultat.delais.map(({ delai, gigue, trou, premiereImage, sautMax, ecartServeur, ecartServeur3s, sautsVisibles }) => ({
      'Délai aller (ms)': delai,
      'Gigue (ms)': gigue,
      'Trou (ms)': trou ? DUREE_TROU : 0,
      premiereImage,
      'sautMax (px)': sautMax.toFixed(2),
      'ecartServeur (px)': ecartServeur.toFixed(2),
      'ecartServeur3s (px)': ecartServeur3s.toFixed(2),
      sautsVisibles,
    })));
    console.log(JSON.stringify(resultat));
  } catch (erreur) {
    console.error(erreur.message);
    process.exitCode = 1;
  }
}
