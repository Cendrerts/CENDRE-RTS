// Interpolate from the actually displayed position, never the previous server target.
export class NetworkMotion {
 constructor(){this.clear();}
 clear(){this.entries=new Map();this.at=null;this.duration=200;this.interval=200;}
 position(unit,now){const p=this.entries.get(unit.id);if(!p)return {x:unit.x,y:unit.y};const a=Math.max(0,Math.min(1,(now-this.at)/this.duration));return {x:p.x+(p.tx-p.x)*a,y:p.y+(p.ty-p.y)*a};}
 receive(units,now){const gap=this.at===null?200:now-this.at;if(gap>60&&gap<2000)this.interval=this.interval*.6+gap*.4;const next=new Map();for(const u of units){const p=this.position(u,now);next.set(u.id,{x:p.x,y:p.y,tx:u.x,ty:u.y});}this.entries=next;this.at=now;this.duration=Math.max(80,Math.min(500,this.interval));}
}
export function pollDelay(elapsed,pending,failed,finished){return failed?750:finished?3000:pending?0:Math.max(0,200-elapsed);}
