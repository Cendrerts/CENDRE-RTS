// This 2D engine uses world (x,y), equivalent to ground-plane (x,z).
export function cameraBounds(ox,oy,scale,width,height){
 return {minX:-ox/scale,maxX:(width-ox)/scale,minY:-oy/scale,maxY:(height-oy)/scale};
}
export function unitsOfType(units,team,type,bounds){
 const total=units.filter(u=>u.team===team&&u.type===type&&u.hp>0);
 const visible=total.filter(u=>u.x>=bounds.minX&&u.x<=bounds.maxX&&u.y>=bounds.minY&&u.y<=bounds.maxY);
 return {total,visible};
}
export function createPortraitTap(){
 let previous=null;
 return {
  reset(){previous=null;},
  tap(type,now){
   const double=previous?.type===type&&now>=previous.time&&now-previous.time<350;
   previous=double?null:{type,time:now};
   return double?'all':'visible';
  }
 };
}
