import { Match } from '../../server/match-do.js';
import { CendreSim as Sim } from '../../public/game/sim.js';

export class MatchMesure extends Match {
  async fetch(request) {
    const chemin = new URL(request.url).pathname;
    if (chemin === '/mesures') {
      return Response.json(this.mesures);
    }
    if (chemin !== '/preparer') return super.fetch(request);

    await this.ready;
    if (this.status() !== 'playing' || this.sockets().length !== 2 || this.mesures) {
      throw new Error('Le banc exige un duel neuf avec deux joueurs connectés.');
    }

    const ids = [];
    for (const [equipe, nombre] of [[0, 60], [1, 30]]) {
      const base = this.sim.bases[equipe];
      for (let index = 0; index < nombre; index++) {
        Sim.spawn(this.sim, 'knight', equipe);
        const unite = this.sim.units.at(-1);
        const cellule = Sim.nearest(
          base.x + (equipe === 0 ? 300 : -550) + (index % 10) * 40,
          base.y - 100 + Math.floor(index / 10) * 40,
        );
        unite.x = (cellule % Sim.COLS + 0.5) * Sim.CELL;
        unite.y = (Math.floor(cellule / Sim.COLS) + 0.5) * Sim.CELL;
        // Garder la charge constante en cas de rencontre avec un monstre.
        unite.hp = 1e9;
        unite.max = 1e9;
        unite.hold = true;
        if (equipe === 0) ids.push(unite.id);
      }
    }

    this.mesures = { commandes: [], ordres: [], retards: [], rattrapages: 0, echeancesFranchies: 0 };
    const order = Sim.order;
    Sim.order = (...args) => {
      const debut = performance.now();
      const resultat = order(...args);
      this.mesures.ordres.push({ ms: performance.now() - debut, unites: args[1].length });
      return resultat;
    };
    return Response.json(ids);
  }

  webSocketMessage(socket, raw) {
    if (!this.mesures || typeof raw !== 'string' || !raw.startsWith('{"type":"cmd",')) {
      return super.webSocketMessage(socket, raw);
    }
    const echeance = this.nextTick;
    const avant = this.now();
    const debut = performance.now();
    const resultat = super.webSocketMessage(socket, raw);
    this.mesures.commandes.push(performance.now() - debut);
    if (avant < echeance && this.now() >= echeance) {
      this.mesures.echeancesFranchies++;
    }
    return resultat;
  }

  advance() {
    if (!this.mesures) return super.advance();
    const maintenant = this.now();
    const echeance = this.nextTick;
    super.advance();
    let ticks = 0;
    for (let tick = echeance; tick < this.nextTick; tick += 50) {
      this.mesures.retards.push(Math.max(0, maintenant - tick));
      ticks++;
    }
    this.mesures.rattrapages += Math.max(0, ticks - 1);
  }
}

export default {
  fetch(request, env) {
    const match = env.MATCH.get(env.MATCH.idFromName('duel'));
    return match.fetch(request);
  },
};
