export const CATEGORIES=[
 {id:'economy',label:'Économie / Production',icon:'⚒',x:1,y:-1},
 {id:'military',label:'Militaire',icon:'⚔',x:1,y:1},
 {id:'defense',label:'Défense',icon:'⛨',x:-1,y:1},
 {id:'technology',label:'Technologie / Spécial',icon:'✦',x:-1,y:-1}
];
export function quadrant(dx,dy,deadZone=32){
 if(Math.hypot(dx,dy)<deadZone)return null;
 return dx>=0?(dy<0?'economy':'military'):(dy>=0?'defense':'technology');
}
export function createRadialMenu(api){
 const root=document.createElement('div');root.id='radialUI';root.hidden=true;
 root.innerHTML='<div id="radialWheel" role="group" aria-label="Catégories de construction"></div><section id="radialPanel" aria-label="Menu de construction"><div class="radial-heading"><button id="radialBack" aria-label="Retour aux catégories">←</button><strong id="radialTitle"></strong><button id="radialClose" aria-label="Annuler la construction">×</button></div><p id="radialHint" role="status"></p><div id="radialChoices"></div><div id="radialFallback"></div><button id="radialConfirm" hidden>Confirmer la construction</button></section>';
 document.body.append(root);
 const $=s=>root.querySelector(s),wheel=$('#radialWheel'),choices=$('#radialChoices');
 let session=null,phase='categories',anchor=null,pointer=null,skipClick=false;
 function button(category){const b=document.createElement('button');b.type='button';b.dataset.category=category.id;b.innerHTML='<span>'+category.icon+'</span>'+category.label;b.onclick=()=>{if(!skipClick)chooseCategory(category.id);};return b;}
 for(const c of CATEGORIES){const b=button(c);b.style.setProperty('--qx',c.x);b.style.setProperty('--qy',c.y);wheel.append(b);$('#radialFallback').append(button(c));}
 const center=document.createElement('button');center.className='radial-center';center.textContent='×';center.setAttribute('aria-label','Fermer le menu radial');center.onclick=()=>{if(!skipClick)close();};wheel.append(center);
 function close(){session=null;pointer=null;root.hidden=true;root.classList.remove('ghost-mode');document.body.classList.remove('radial-open');api.clearGhost();}
 function categories(){if(!session)return;api.clearGhost();phase='categories';root.classList.remove('ghost-mode');wheel.hidden=false;$('#radialPanel').hidden=true;choices.replaceChildren();$('#radialConfirm').hidden=true;$('#radialBack').hidden=true;$('#radialTitle').textContent='Construire';$('#radialHint').textContent='';$('#radialFallback').hidden=!session.edge;}
 function open(x,y,context){close();session={context,edge:false};root.hidden=false;document.body.classList.add('radial-open');const rect=root.getBoundingClientRect();anchor={x:rect.left+rect.width/2,y:rect.top+rect.height/2};wheel.style.left='50%';wheel.style.top='50%';api.onOpen();categories();}
 function chooseCategory(id){if(!session||phase!=='categories')return;phase='buildings';wheel.hidden=true;$('#radialPanel').hidden=false;$('#radialFallback').hidden=true;$('#radialBack').hidden=false;$('#radialTitle').textContent=CATEGORIES.find(c=>c.id===id).label;choices.replaceChildren();
  const options=api.options(session.context,id);$('#radialHint').textContent=options.length?'Choisissez un bâtiment.':id==='defense'?'Aucun bâtiment défensif disponible pour le moment.':'Construisez d’abord le bâtiment principal sur cette mine.';
  for(const option of options){const b=document.createElement('button');b.textContent=option.name+' · '+option.detail;b.disabled=!!option.disabled;b.onclick=()=>{
   if(option.action){const ctx=session.context;close();api.action(ctx,option);return;}
   api.preview(session.context,option);phase='ghost';root.classList.add('ghost-mode');choices.replaceChildren();$('#radialTitle').textContent=option.name;$('#radialConfirm').hidden=false;refresh();
  };choices.append(b);}
 }
 function refresh(){if(!session)return;if(!api.available(session.context)){close();return;}if(phase==='ghost'){const info=api.ghostStatus();$('#radialHint').textContent=info.message;$('#radialConfirm').disabled=!info.valid;}}
 $('#radialClose').onclick=close;$('#radialBack').onclick=categories;$('#radialConfirm').onclick=()=>{refresh();if(session&&!$('#radialConfirm').disabled&&api.confirm())close();};
 root.addEventListener('click',e=>{if(e.target===root&&phase!=='ghost')close();});
 wheel.addEventListener('pointerdown',e=>{if(phase!=='categories'||pointer)return;e.preventDefault();pointer={id:e.pointerId,x:e.clientX,y:e.clientY};skipClick=false;wheel.setPointerCapture(e.pointerId);});
 wheel.addEventListener('pointermove',e=>{if(pointer?.id!==e.pointerId)return;const id=quadrant(e.clientX-anchor.x,e.clientY-anchor.y);for(const b of wheel.querySelectorAll('[data-category]'))b.classList.toggle('hover-sector',b.dataset.category===id);});
 wheel.addEventListener('pointerup',e=>{if(pointer?.id!==e.pointerId)return;const moved=Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>18;pointer=null;
  const id=quadrant(e.clientX-anchor.x,e.clientY-anchor.y);
  if(moved&&id){skipClick=true;chooseCategory(id);setTimeout(()=>skipClick=false,0);}
  else if(!moved){if(id)chooseCategory(id);else close();skipClick=true;setTimeout(()=>skipClick=false,0);}
 });
 const cancelPointer=()=>{pointer=null;for(const b of wheel.querySelectorAll('[data-category]'))b.classList.remove('hover-sector');};
 wheel.addEventListener('pointercancel',cancelPointer);wheel.addEventListener('lostpointercapture',cancelPointer);
 addEventListener('resize',close);addEventListener('blur',close);addEventListener('keydown',e=>{if(e.key==='Escape'&&session){e.preventDefault();e.stopImmediatePropagation();close();}},true);
 return {open,close,refresh,get isGhost(){return !!session&&phase==='ghost';}};
}
