import { randomCode } from '../lib/match.mjs';
export { Match } from './match-do.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/ws') return env.ASSETS.fetch(request);
    const code = (url.searchParams.get('code') || '').toUpperCase();
    if (url.searchParams.get('action') === 'create' && !code) {
      url.searchParams.set('code', randomCode());
    } else if (!/^[A-Z2-9]{7}$/.test(code)) {
      return Response.json({ error: 'Code de salon incorrect.' }, { status: 400 });
    } else {
      url.searchParams.set('code', code);
    }
    const id = env.MATCH.idFromName(url.searchParams.get('code'));
    return env.MATCH.get(id).fetch(new Request(url, request));
  },
};
