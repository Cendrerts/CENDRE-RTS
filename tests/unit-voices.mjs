import assert from 'node:assert/strict';
import {UnitVoices,selectionVoice} from '../public/game/unit-voices.js';
let starts=0,fetches=0,rates=[],resolveFetch;
globalThis.AudioContext=class {
 state='running';destination={};
 createGain(){return {gain:{value:0},connect(){}};}
 resume(){return Promise.resolve();}
 async decodeAudioData(){return {};}
 createBufferSource(){const source={playbackRate:{value:1},connect(){},disconnect(){},stop(){},start(){starts++;rates.push(source.playbackRate.value);}};return source;}
 async close(){this.state='closed';}
};
globalThis.fetch=async()=>{fetches++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(0)};};
const v=new UnitVoices(),a={instanceId:1,unitType:'commis_unit'};
assert(await v.select(a));assert.equal(await v.select(a),false);assert.equal(starts,1);
v.lastPlayed.set(1,performance.now()-1501);assert(await v.select(a));assert.equal(fetches,1);
assert(await v.select({...a,instanceId:2}));assert(rates.every(r=>r>=.9&&r<=1.1));
assert.equal(selectionVoice([{id:4,team:1,type:'commis'}],1),null);
assert.deepEqual(selectionVoice([{id:5,team:0,type:'mage'}],0),{instanceId:5,unitType:'chef_de_brigade'});
assert.equal(selectionVoice([],0),null);
const p=new UnitVoices();globalThis.fetch=()=>new Promise(resolve=>resolveFetch=resolve);
const pending=p.select(a);assert.equal(await p.select(a),false);p.reset();
resolveFetch({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});assert.equal(await pending,false);
let errors=0;globalThis.fetch=async()=>({ok:false,status:404});const broken=new UnitVoices({onError:()=>errors++});assert.equal(await broken.select(a),false);assert.equal(errors,1);assert.equal(broken.pending.size,0);
await v.dispose();assert.equal(await v.select(a),false);
console.log('PASS: cooldown, caching, pitch, faction mapping, pending spam, reset during load, failed download and disposal.');
