export const AMBIENCE_ASSETS = Object.freeze({cuistots_ambiant:'/game/assets/Ambiance_cuistots_.mp3'});

export function ambienceVolume(camera, base, innerRadius=150, falloffRadius=1200) {
  const t=Math.max(0,Math.min(1,(Math.hypot(camera.x-base.x,camera.y-base.y)-innerRadius)/(falloffRadius-innerRadius)));
  return .35*(1-t*t*(3-2*t));
}

export function createSeamlessBuffer(context,input,crossfadeSeconds=.1) {
  const overlap=Math.min(Math.floor(input.sampleRate*crossfadeSeconds),Math.floor(input.length/4));
  if(overlap<2)return input;
  const length=input.length-overlap;
  const output=context.createBuffer(input.numberOfChannels,length,input.sampleRate);
  for(let c=0;c<input.numberOfChannels;c++){
    const source=input.getChannelData(c),target=output.getChannelData(c);
    target.set(source.subarray(overlap));
    for(let i=0;i<overlap;i++){
      const t=i/(overlap-1),blend=t*t*(3-2*t);
      target[length-overlap+i]=source[length+i]*(1-blend)+source[i]*blend;
    }
  }
  return output;
}

export class CuistotsAmbience {
  constructor({context,destination=context.destination,basePosition,innerRadius=150,falloffRadius=1200,url=AMBIENCE_ASSETS.cuistots_ambiant}) {
    if(!Number.isFinite(innerRadius)||!Number.isFinite(falloffRadius)||innerRadius<0||falloffRadius<=innerRadius)throw new RangeError('Rayons invalides.');
    Object.assign(this,{context,url,innerRadius,falloffRadius});
    this.basePosition={...basePosition};
    this.gain=context.createGain();this.gain.gain.value=0;this.gain.connect(destination);
    this.targetVolume=0;this.source=null;this.bufferPromise=null;this.startPromise=null;this.disposed=false;this.abortController=new AbortController();
  }
  updateCamera(camera,active=true){
    if(this.disposed)return;
    const target=active?ambienceVolume(camera,this.basePosition,this.innerRadius,this.falloffRadius):0;
    // Do not restart an unchanged ramp every animation frame.
    if(target===this.targetVolume)return;
    this.targetVolume=target;
    const parameter=this.gain.gain,now=this.context.currentTime;
    if(parameter.cancelAndHoldAtTime)parameter.cancelAndHoldAtTime(now);
    else {const value=parameter.value;parameter.cancelScheduledValues(now);parameter.setValueAtTime(value,now);}
    parameter.linearRampToValueAtTime(target,now+.05);
  }
  preload(){
    if(this.disposed)return Promise.reject(new Error('Ambiance détruite.'));
    if(!this.bufferPromise)this.bufferPromise=(async()=>{
      const response=await fetch(this.url,{signal:this.abortController.signal});
      if(!response.ok)throw new Error(`Ambiance Cuistots : HTTP ${response.status}`);
      const buffer=await this.context.decodeAudioData(await response.arrayBuffer());
      return createSeamlessBuffer(this.context,buffer);
    })().catch(error=>{this.bufferPromise=null;throw error;});
    return this.bufferPromise;
  }
  start(){
    if(this.disposed)return Promise.resolve();
    if(this.startPromise)return this.startPromise;
    const resume=this.context.resume();
    this.startPromise=Promise.all([this.preload(),resume]).then(([buffer])=>{
      if(this.disposed||this.source||this.context.state!=='running')return;
      const source=this.context.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(this.gain);source.start();this.source=source;
    }).finally(()=>{this.startPromise=null;});
    return this.startPromise;
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.abortController.abort();
    this.source?.stop();this.source?.disconnect();this.gain.disconnect();this.source=null;this.bufferPromise=null;
  }
}
