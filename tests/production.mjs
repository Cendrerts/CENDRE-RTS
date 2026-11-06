import assert from 'node:assert/strict';
import {CendreSim as S} from '../public/game/sim.js';
import {command,pack,unpack,view} from '../lib/match.mjs';
const advance=(s,t)=>{for(let i=0;i<t-1e-8;i+=.05)S.tick(s,Math.min(.05,t-i));};
for(let team=0;team<2;team++){
 const s=S.create();s.gold[team]=9999;assert.equal(s.slots[team].length,8);
 for(const type of ['knight','archer','mage']){assert(!S.recruit(s,type,team));assert.throws(()=>command(s,team,{kind:'recruit',type}));}
 const cfg=S.BUILDINGS[team][0];S.construct(s,team,cfg.id);S.construct(s,team,cfg.id);const ps=S.producers(s,team,'knight');assert.equal(ps.length,2);
 assert(S.recruit(s,'knight',team));assert(S.recruit(s,'knight',team));assert.notEqual(s.queues[team][0].producerId,s.queues[team][1].producerId);
 const duration=S.stats('knight',team).production;advance(s,duration-.05);assert.equal(s.units.filter(u=>u.team===team&&u.type==='knight').length,0);advance(s,.05);const units=s.units.filter(u=>u.team===team&&u.type==='knight');assert.equal(units.length,2);for(let i=0;i<2;i++)assert(Math.hypot(units[i].x-ps[i].x,units[i].y-ps[i].y)<60);
 assert(!S.recruit(s,'mage',team,ps[0].id));assert(!S.recruit(s,'commis',team,'main_'+(1-team)));
 // Same building remains serial, independent buildings remain parallel.
 S.recruit(s,'knight',team,ps[0].id);S.recruit(s,'knight',team,ps[0].id);advance(s,duration);assert.equal(s.queues[team].length,1);assert(Math.abs(s.queues[team][0].remaining-duration)<1e-6);
 assert.deepEqual(unpack(pack(s)).queues,s.queues);assert.equal(view(s,1-team).queues[team].length,0);
}
{
 const s=S.create();s.gold[0]=9999;const u=s.units[0],m=s.mines[2];u.x=m.x;u.y=m.y;assert(S.build(s,0,2));assert.equal(s.slots[0].length,16);assert(S.construct(s,0,S.BUILDINGS[0][1].id,'mine_2'));const p=S.producers(s,0,'archer')[0];assert.equal(p.baseId,'mine_2');assert(S.recruit(s,'archer',0,p.id));assert(S.recruit(s,'commis',0,'mine_2'));advance(s,5);const worker=s.units.at(-1);assert.equal(worker.type,'commis');assert(Math.hypot(worker.x-m.site.x,worker.y-m.site.y)<60);assert.equal(worker.harvest.mine,2);
 // Capturing removes the old owner's structures and cancels/refunds their jobs.
 const before=s.gold[0];m.owner=1;S.tick(s,.01);assert.equal(S.producers(s,0,'archer').length,0);assert.equal(s.queues[0].length,0);assert.equal(s.gold[0],before+S.stats('archer',0).cost);assert.equal(s.slots[1].filter(p=>p.baseId==='mine_2').length,8);assert(s.slots[1].filter(p=>p.baseId==='mine_2').every(p=>!p.occupe));assert(!S.construct(s,0,S.BUILDINGS[0][0].id,'mine_2'));
}
{
 const s=S.create();s.gold[0]=99999;S.construct(s,0,S.BUILDINGS[0][0].id);const p=S.producers(s,0,'knight')[0];for(let i=0;i<8;i++)assert(S.recruit(s,'knight',0,p.id));assert(!S.recruit(s,'knight',0,p.id));S.construct(s,0,S.BUILDINGS[0][0].id);assert(S.recruit(s,'knight',0));
 while(s.units.filter(u=>u.team===0).length+s.queues[0].length<30){S.spawn(s,'commis',0);}assert(!S.recruit(s,'commis',0));
}
console.log('PASS: building gates, parallel and serial queues, spawn location, secondary workers, ownership, capture refunds, per-building capacity, population and persistence.');
