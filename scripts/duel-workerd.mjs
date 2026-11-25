// Installer Miniflare dans un dossier temporaire, puis passer son point d’entrée :
// npm install --prefix /tmp/cendre-banc miniflare@4.20260515.0
// node scripts/duel-workerd.mjs /tmp/cendre-banc/node_modules/miniflare/dist/src/index.js
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as attendre } from 'node:timers/promises';

const DUREE_MS = 30_000;
// Une période non multiple du tick et des ordres échantillonne plusieurs phases.
const PERIODE_PING_MS = 137;
const RACINE = fileURLToPath(new URL('../', import.meta.url));
const SCRIPT = fileURLToPath(new URL('./bench/duel-workerd-worker.mjs', import.meta.url));
const URL_DUEL = 'http://duel/?code=ABCDEFG';
// Des clics alternés sur le flanc sud-ouest, à portée de déplacement de l'armée.
const DESTINATIONS = [
  { x: 1140, y: 1740 },
  { x: 850, y: 1470 },
  { x: 1450, y: 1610 },
  { x: 830, y: 1950 },
  { x: 1360, y: 1860 },
  { x: 1000, y: 1570 },
];

async function ouvrirClient(runtime, action) {
  const reponse = await runtime.dispatchFetch(URL_DUEL + '&action=' + action, {
    headers: { Upgrade: 'websocket' },
  });
  const socket = reponse.webSocket;
  if (!socket) throw new Error(`Upgrade WebSocket refusé (${reponse.status}).`);

  const client = { socket, snapshots: 0, pings: [], erreurs: [], ack: 0 };
  const session = Promise.withResolvers();
  const partie = Promise.withResolvers();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === 'session') session.resolve();
    if (message.type === 'snapshot' && message.status === 'playing') {
      partie.resolve();
      client.snapshots++;
    }
    if (message.type === 'ack') client.ack = message.seq;
    if (message.type === 'pong' && client.pingAt !== undefined) {
      client.pings.push(performance.now() - client.pingAt);
      client.pingAt = undefined;
    }
    if (message.type === 'error') client.erreurs.push(message.error);
  });
  socket.accept();
  socket.send(JSON.stringify({ type: 'hello' }));
  await attendreSignal(session.promise, 'session');
  client.partie = partie.promise;
  return client;
}

async function attendreSignal(promesse, nom) {
  const controle = new AbortController();
  try {
    return await Promise.race([
      promesse,
      attendre(6000, undefined, { signal: controle.signal }).then(() => {
        throw new Error(`Délai dépassé en attendant ${nom}.`);
      }),
    ]);
  } finally {
    controle.abort();
  }
}

async function cadence(debut, periode, phase, envoyer) {
  let retardMax = 0;
  for (let offset = phase; offset < DUREE_MS; offset += periode) {
    const echeance = debut + offset;
    await attendre(Math.max(0, echeance - performance.now()));
    retardMax = Math.max(retardMax, performance.now() - echeance);
    envoyer();
  }
  return retardMax;
}

function stats(valeurs) {
  const triees = valeurs.toSorted((a, b) => a - b);
  return {
    moyenne: valeurs.reduce((total, ms) => total + ms, 0) / valeurs.length,
    p95: triees[Math.ceil(0.95 * triees.length) - 1],
    max: triees.at(-1),
  };
}

async function mesurer(Miniflare, unites, frequence) {
  const runtime = new Miniflare({
    scriptPath: SCRIPT,
    modules: true,
    modulesRoot: RACINE,
    modulesRules: [{ type: 'ESModule', include: ['**/*.js', '**/*.mjs'] }],
    compatibilityDate: '2026-05-15',
    durableObjects: { MATCH: { className: 'MatchMesure', useSQLite: true } },
  });
  try {
    const premier = await ouvrirClient(runtime, 'create');
    const second = await ouvrirClient(runtime, 'join');
    const clients = [premier, second];
    await attendreSignal(Promise.all(clients.map(({ partie }) => partie)), 'les deux joueurs');

    const preparation = await runtime.dispatchFetch('http://duel/preparer');
    if (!preparation.ok) throw new Error(await preparation.text());
    const ids = (await preparation.json()).slice(0, unites);
    for (const client of clients) client.snapshots = 0;

    let seq = 0;
    const debut = performance.now();
    const cadences = [cadence(debut, 1000 / frequence, 0, () => {
      const destination = DESTINATIONS[seq % DESTINATIONS.length];
      seq++;
      const cmd = { kind: 'move', ids, ...destination };
      premier.socket.send(JSON.stringify({ type: 'cmd', seq, cmd }));
    })];
    for (const [index, client] of clients.entries()) {
      cadences.push(cadence(debut, PERIODE_PING_MS, 11 + 53 * index, () => {
        if (client.pingAt !== undefined) return;
        client.pingAt = performance.now();
        client.socket.send(JSON.stringify({ type: 'ping' }));
      }));
    }
    const retardsEmission = await Promise.all(cadences);
    await attendre(Math.max(0, debut + DUREE_MS - performance.now()));
    const reponse = await runtime.dispatchFetch('http://duel/mesures');
    const { commandes, ordres, retards, rattrapages, echeancesFranchies } = await reponse.json();

    const snapshots = clients.map((client) => client.snapshots);
    const pings = clients.flatMap((client) => client.pings);
    const erreurs = clients.flatMap((client) => client.erreurs);
    const ordresExecutes = ordres.length === seq && ordres.every((ordre) => ordre.unites === unites);
    const mesuresActives = commandes.some((ms) => ms > 0) && retards.length > 0 &&
      clients.every((client) => client.snapshots > 0 && client.pings.length > 0);
    if (erreurs.length || seq !== DUREE_MS / 1000 * frequence || premier.ack !== seq ||
        commandes.length !== seq || !ordresExecutes || !mesuresActives) {
      throw new Error(JSON.stringify({
        seq,
        ack: premier.ack,
        commandes: commandes.length,
        ordres: ordres.length,
        snapshots,
        erreurs,
        pings: pings.length,
      }));
    }

    return {
      unites, frequence, commandes: seq, snapshots, pings: pings.length, ticks: retards.length,
      cmdMs: stats(commandes), ordreMs: stats(ordres.map(({ ms }) => ms)),
      retardTickMs: stats(retards), rattrapages, echeancesFranchies, pingMs: stats(pings),
      emissionMaxMs: Math.max(...retardsEmission),
    };
  } finally {
    await runtime.dispose();
  }
}

if (process.argv.length !== 3) {
  throw new Error('Indiquer le chemin vers miniflare/dist/src/index.js.');
}
const { Miniflare } = await import(pathToFileURL(resolve(process.argv[2])));
const mesures = [];
for (const unites of [1, 10, 30, 60]) {
  for (const frequence of [2, 5]) {
    const resultat = await mesurer(Miniflare, unites, frequence);
    mesures.push(resultat);
    console.log(JSON.stringify(resultat));
  }
}
console.table(mesures.map((mesure) => ({
  unités: mesure.unites,
  'ordres/s': mesure.frequence,
  'cmd moyen (ms)': mesure.cmdMs.moyenne.toFixed(2),
  'Sim.order moyen (ms)': mesure.ordreMs.moyenne.toFixed(2),
  'retard tick p95 (ms)': mesure.retardTickMs.p95,
  'retard tick max (ms)': mesure.retardTickMs.max,
  'ticks rattrapés': mesure.rattrapages,
  'cmd à cheval sur un tick': mesure.echeancesFranchies,
  'ping max (ms)': mesure.pingMs.max.toFixed(2),
})));
