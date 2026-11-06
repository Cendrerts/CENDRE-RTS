import assert from 'node:assert/strict';
import {CendreSim as S} from '../public/game/sim.js';
import {command,pack,unpack} from '../lib/match.mjs';
const s=S.create(),u=s.units[0],other=s.units[1];u.x=790;u.y=570;u.cargo=10;
command(s,0,{kind:'steer',ids:[u.id,other.id],dx:1,dy:0});
assert.equal(other.manual,null);assert.equal(u.harvest,null);assert.equal(u.cargo,10);
const x=u.x;for(let i=0;i<4;i++)S.tick(s,.05);assert(u.x>x);assert.equal(u.y,570);
const saved=unpack(pack(s));assert.equal(saved.units[0].manual.dx,1);
command(s,0,{kind:'steer',ids:[u.id],dx:0,dy:0});const stopped=u.x;S.tick(s,.05);assert.equal(u.x,stopped);
command(s,0,{kind:'steer',ids:[u.id],dx:1,dy:0});for(let i=0;i<20;i++)S.tick(s,.05);assert.equal(u.manual,null);const expired=u.x;S.tick(s,.1);assert.equal(u.x,expired);
u.x=710;u.y=90;for(let i=0;i<100;i++){S.steer(s,[u.id],-1,-1);S.tick(s,.05);assert(S.walk[Math.floor(u.y/20)*S.COLS+Math.floor(u.x/20)]);}
S.steer(s,[u.id],1,0);S.order(s,[u.id],790,570);assert.equal(u.manual,null);
assert.throws(()=>command(s,0,{kind:'steer',ids:[u.id],dx:Infinity,dy:0}));
// Manual steering suppresses attacks even when an enemy is in range.
u.x=790;u.y=570;other.x=795;other.y=570;other.harvest=null;S.visibility(s);const hp=other.hp;S.steer(s,[u.id],-1,0);S.tick(s,.05);assert.equal(other.hp,hp);
console.log('Steering: movement, stop, timeout, ownership, collision, persistence, combat priority passed');
