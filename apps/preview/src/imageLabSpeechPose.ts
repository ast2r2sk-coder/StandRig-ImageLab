import {PARAMS} from './imageLabCore';

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
const DURATION=2.4;
const smooth=(t:number)=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};
/** Offset envelope with zero velocity at endpoints, in existing parameter units only. */
export function poseTimeline(kind:GentlePose,seconds:number):Record<string,number>{
 if(!['bow','nod','tilt'].includes(kind)||!Number.isFinite(seconds))throw Error('Invalid gentle pose');
 const t=Math.max(0,Math.min(1,seconds/DURATION));
 const envelope=t===0||t===1?0:Math.sin(Math.PI*smooth(t))**2;
 return {ParamAngleY:kind==='bow'?-4*envelope:kind==='nod'?-3*envelope:0,ParamAngleZ:kind==='tilt'?3*envelope:0,ParamBodyAngleY:kind==='bow'?-1.5*envelope:0};
}
/** Render-only overlay: project angles remain the saved prior pose; mouth is never owned. */
export function createGentlePose(){
 let kind:GentlePose|undefined,elapsed=0,returning=false,returnTime=0;
 let offset:Record<string,number>={},returnFrom:Record<string,number>={};
 return {
  get active(){return kind!==undefined;},
  start(next:GentlePose){if(kind)return false;poseTimeline(next,0);kind=next;elapsed=0;returning=false;offset=poseTimeline(next,0);return true;},
  cancel(immediate=false){if(immediate){kind=undefined;offset={};return;}if(kind&&!returning){returning=true;returnTime=0;returnFrom={...offset};}},
  tick(dt:number,params:Record<string,number>){
   if(!kind)return params;
   if(returning){returnTime+=Math.max(0,dt);const scale=1-smooth(returnTime/.3);offset=Object.fromEntries(Object.entries(returnFrom).map(([id,v])=>[id,v*scale]));if(returnTime>=.3){kind=undefined;return params;}}
   else{elapsed+=Math.max(0,dt);if(elapsed>=DURATION){kind=undefined;return params;}offset=poseTimeline(kind,elapsed);}
   const result={...params};for(const [id,value] of Object.entries(offset)){if(!value)continue;const p=PARAMS.find(p=>p.id===id)!;result[id]=Math.max(p.min,Math.min(p.max,(params[id]??0)+value));}return result;
  }
 };
}
