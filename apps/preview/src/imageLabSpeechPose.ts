export type RigidMotion={x:number;y:number;rotation:number};
const identity=():RigidMotion=>({x:0,y:0,rotation:0});
/** Uniform stage translation/rotation, never parameter-driven face/body deformation. */
export function labRigidMotion(seconds:number,active:boolean):RigidMotion{
 return active?{x:Math.sin(seconds*.9)*1.5,y:Math.sin(seconds*1.4),rotation:Math.sin(seconds)*.6}:identity();
}


/** Browser-reported local voices only; never fall back to the default/remote engine. */
export function localVoices(voices:SpeechSynthesisVoice[]):SpeechSynthesisVoice[]{
 return voices.filter(v=>v.localService===true).sort((a,b)=>Number(/^ko(?:-|$)/i.test(b.lang))-Number(/^ko(?:-|$)/i.test(a.lang)));
}
type SpeechOptions={
 synth:Pick<SpeechSynthesis,'getVoices'|'speak'|'cancel'>|undefined;
 utterance:(text:string)=>SpeechSynthesisUtterance;
 now:()=>number;
 setTimer:(callback:()=>void,ms:number)=>number;
 clearTimer:(id:number)=>void;
 onMouth:(value:number)=>void;
 onStatus:(text:string)=>void;
 onTakeover:()=>void;
};
const FALLBACK='로컬 음성이 없어. OS 음성을 설치하거나 로컬 오디오 파일을 선택해.';
/** Event-gated approximation, not an audio analyser or phoneme aligner. No RAF here. */
export function createLocalSpeech(o:SpeechOptions){
 let generation=0,active=false,started=false,startAt=0,boundaryAt=-Infinity;
 let startTimer:number|undefined,endTimer:number|undefined;
 // Hold a strong reference until completion (some browser engines otherwise lose events).
 let current:SpeechSynthesisUtterance|undefined;
 function clear(){if(startTimer!==undefined)o.clearTimer(startTimer);if(endTimer!==undefined)o.clearTimer(endTimer);startTimer=endTimer=undefined;}
 function stop(reason='stop'){
  const owned=active;generation++;active=false;started=false;current=undefined;clear();
  if(owned){try{o.synth?.cancel();}catch{/* Ownership has already been invalidated. */}o.onMouth(0);o.onStatus(`TTS 정지 · ${reason} · 입 닫힘`);}
 }
 function speak(text:string,voiceURI:string){
  stop();
  if(typeof text!=='string'||!text.trim()||text.length>300){o.onStatus('오류 · 읽을 문장을 1~300자로 입력해.');return false;}
  try{
   const voice=localVoices(o.synth?.getVoices()??[]).find(v=>v.voiceURI===voiceURI);
   if(!voice||!o.synth){o.onStatus(`오류 · ${FALLBACK}`);return false;}
   o.onTakeover();o.onMouth(0);
   const token=++generation;active=true;started=false;boundaryAt=-Infinity;
   const owns=()=>active&&generation===token;
   const finish=(message:string)=>{if(!owns())return;stop();o.onStatus(message);};
   const u=o.utterance(text.trim());current=u;u.voice=voice;u.lang=voice.lang;u.rate=1;u.pitch=1;u.volume=1;
   u.onstart=()=>{if(!owns()||started)return;started=true;startAt=o.now();if(startTimer!==undefined)o.clearTimer(startTimer);startTimer=undefined;o.onStatus('TTS 말하는 중 · 이벤트 기반 입 근사 (RMS·음소 아님)');};
   u.onboundary=()=>{if(owns()&&started)boundaryAt=o.now();};
   u.onend=()=>finish('TTS 완료 · 입 닫힘');
   u.onerror=()=>finish('오류 · TTS 엔진이 중단됐어. 로컬 오디오 파일로 재생해.');
   startTimer=o.setTimer(()=>finish('오류 · TTS 시작 시간 초과. 로컬 오디오 파일로 재생해.'),5000);
   // Total request lifetime bounded even if onstart/onend never arrives or timers are throttled.
   const deadline=o.now()+120000;
   endTimer=o.setTimer(()=>finish('오류 · TTS 종료 시간 초과. 로컬 오디오 파일로 재생해.'),120000);
   expires=deadline;
   o.onStatus('TTS 시작 대기 · 실제 시작 전 입 닫힘');o.synth.speak(current);return true;
  }catch{stop('error');o.onStatus('오류 · TTS를 시작할 수 없어. 로컬 오디오 파일로 재생해.');return false;}
 }
 let expires=0;
 return {get active(){return active;},speak,stop,tick(now:number){
  if(!active)return;
  if(now>=expires){stop('watchdog');o.onStatus('오류 · TTS 종료 시간 초과. 로컬 오디오 파일로 재생해.');return;}
  if(!started){o.onMouth(0);return;}
  // Rhythmic placeholder gated by real start; boundaries add short emphasis, not phonemes.
  const seconds=(now-startAt)/1000,accent=Math.max(0,1-(now-boundaryAt)/180)*.12;
  o.onMouth(Math.min(.75,Math.pow(Math.sin(seconds*Math.PI*4),2)*.55+accent));
 }};
}
export type GentlePose='bow'|'nod'|'tilt';
/** Texture-expression overlay only. Never write automatic head/body warp deltas. */
export function composeLabMotion(base:Record<string,number>,o:{seconds:number;active:boolean;mouth?:number}){
 const result={...base};
 if(o.active){
  const blink=o.seconds%4,factor=blink<.24?Math.abs(blink-.12)/.12:1;
  for(const id of ['ParamEyeLOpen','ParamEyeROpen'])result[id]=(base[id]??1)*factor;
 }
 if(o.mouth!==undefined)result.ParamMouthOpen=o.mouth;
 return result;
}
const DURATION=2.4;
const smooth=(t:number)=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};
/** Whole-character greeting tilt, NOT head-only nod or perspective bow. */
export function poseTimeline(kind:GentlePose,seconds:number):RigidMotion{
 if(!['bow','nod','tilt'].includes(kind)||!Number.isFinite(seconds))throw Error('Invalid gentle pose');
 const t=Math.max(0,Math.min(DURATION,seconds));
 const envelope=kind==='nod'?Math.sin(Math.PI*smooth((t%1.2)/1.2))**2:t<.6?smooth(t/.6):t<1.2?1:1-smooth((t-1.2)/1.2);
 return {x:0,y:(kind==='tilt'?0:3)*envelope,rotation:(kind==='tilt'?-2:2)*envelope};
}
export function createGentlePose(){
 let kind:GentlePose|undefined,elapsed=0,returning=false,returnTime=0;
 let offset=identity(),returnFrom=identity(),restartFrom=identity();
 return {
  get active(){return kind!==undefined;},
  get kind(){return kind;},
  get progress(){return Math.min(1,elapsed/DURATION);},
  start(next:GentlePose){poseTimeline(next,0);restartFrom=kind?{...offset}:identity();kind=next;elapsed=0;returning=false;offset={...restartFrom};return true;},
  cancel(immediate=false){if(immediate){kind=undefined;offset=identity();return;}if(kind&&!returning){returning=true;returnTime=0;returnFrom={...offset};}},
  tick(dt:number):RigidMotion{
   if(!Number.isFinite(dt)||dt<0)throw Error('Invalid pose delta');
   if(!kind)return identity();
   if(returning){returnTime+=dt;const scale=1-smooth(returnTime/.3);offset={x:returnFrom.x*scale,y:returnFrom.y*scale,rotation:returnFrom.rotation*scale};if(returnTime>=.3){kind=undefined;return identity();}}
   else{elapsed+=dt;if(elapsed>=DURATION){kind=undefined;return identity();}offset=poseTimeline(kind,elapsed);const blend=smooth(elapsed/.3);for(const id of ['x','y','rotation'] as const)offset[id]=restartFrom[id]*(1-blend)+offset[id]*blend;}
   return {...offset};
  }
 };
}
