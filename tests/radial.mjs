import assert from 'node:assert/strict';
import {quadrant} from '../public/game/radial.js';
import {CendreSim as S} from '../public/game/sim.js';
import {command,pack,unpack} from '../lib/match.mjs';
assert.equal(quadrant(10,10),null);assert.equal(quadrant(50,-50),'economy');assert.equal(quadrant(50,50),'military');assert.equal(quadrant(-50,50),'defense');assert.equal(quadrant(-50,-50),'technology');assert.equal(quadrant(32,0),'military');
for(const team of [0,1]){
 const s=S.create(),slots=s.slots[team],target=slots[5],type=S.BUILDINGS[team][0].id;
 // Merely choosing the intended slot has no mutation or economic effect.
 const gold=s.gold[team],before=pack(s);const ghost={type,slotId:target.id,baseId:target.baseId};assert.equal(pack(s),before);
 command(s,team,{kind:'construct',...ghost});assert(slots[5].occupe);assert(!slots[0].occupe);assert.equal(s.gold[team],gold-S.BUILDINGS[team][0].cost);
 assert.throws(()=>command(s,team,{kind:'construct',...ghost}));assert(!slots[0].occupe);
 assert.throws(()=>command(s,1-team,{kind:'construct',type:S.BUILDINGS[1-team][0].id,baseId:target.baseId,slotId:slots[4].id}));
 assert.throws(()=>command(s,team,{kind:'construct',type,baseId:'missing',slotId:slots[4].id}));
 assert.throws(()=>command(s,team,{kind:'construct',type,baseId:target.baseId,slotId:'missing'}));
 assert(unpack(pack(s)).slots[team][5].occupe);
}
console.log('PASS: radial directions/deadzone, no preview mutation, exact slot, occupied rejection, ownership, base restriction, invalid slot and persistence.');
