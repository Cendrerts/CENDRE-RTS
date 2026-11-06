import {env} from 'cloudflare:workers';
import {handle,MatchError} from '../../../lib/match.mjs';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Origine refusée.'},{status:403});const text=await request.text();if(text.length>12000)return Response.json({error:'Requête trop volumineuse.'},{status:413});return Response.json(await handle(env.DB,JSON.parse(text)),{headers:{'Cache-Control':'no-store'}})}catch(e){const known=e instanceof MatchError;return Response.json({error:known?e.message:'Connexion au serveur impossible.'},{status:known?e.status:503,headers:{'Cache-Control':'no-store'}})}}
