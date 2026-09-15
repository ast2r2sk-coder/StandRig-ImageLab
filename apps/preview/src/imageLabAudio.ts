import {amplitudeMouth,createAudioClock,MAX_AUDIO_BYTES,validateAudioBudget} from './imageLabGuideAudio';
/** Only the host's frame loop samples audio. No second animation clock. */
export function createLocalAudio(onMouth:(value:number)=>void,onStatus:(text:string)=>void,onTakeover:()=>void){
 const clock=createAudioClock();
 let context:AudioContext|undefined,source:AudioBufferSourceNode|undefined,analyser:AnalyserNode|undefined;
 let samples=new Float32Array(1024),mouth=0,startedAt=0;
 function stop(reason='stop'){
  clock.stop(reason);mouth=0;onMouth(0);
  if(source){source.onended=null;try{source.stop();}catch{}source.disconnect();source.buffer=null;source=undefined;}
  analyser?.disconnect();analyser=undefined;
  const old=context;context=undefined;
  if(old&&old.state!=='closed')void old.close().catch(()=>onStatus('오류 · 오디오 리소스 해제 실패'));
 }
 async function play(file:File,expectedDuration?:number){
  stop();onTakeover();const token=clock.start();
  try{
   if(!file||!Number.isInteger(file.size)||file.size<=0||file.size>MAX_AUDIO_BYTES)throw Error('오디오 파일 제한 20MB');
   // Construct/resume synchronously within the Play button's user gesture.
   const ctx=new AudioContext({sampleRate:24000});context=ctx;
   await ctx.resume();if(!clock.owns(token))return;
   onStatus('로컬 오디오 디코딩 중…');
   const bytes=await file.arrayBuffer();if(!clock.owns(token))return;
   const buffer=await ctx.decodeAudioData(bytes);if(!clock.owns(token))return;
   validateAudioBudget(file.size,buffer.duration,buffer.numberOfChannels,buffer.sampleRate);
   if(expectedDuration!==undefined&&Math.abs(buffer.duration-expectedDuration)>.01)throw Error('WAV decoded duration mismatch');
   const node=ctx.createBufferSource(),meter=ctx.createAnalyser();
   node.buffer=buffer;meter.fftSize=1024;meter.smoothingTimeConstant=0;
   node.connect(meter);meter.connect(ctx.destination);source=node;analyser=meter;samples=new Float32Array(meter.fftSize);
   node.onended=()=>{if(clock.owns(token)){stop('end');onStatus('재생 완료 · 입 닫힘 / 오디오 해제');}};
   ctx.onstatechange=()=>{if(clock.owns(token)&&ctx.state!=='running'){stop('error');onStatus('오류 · 오디오가 중단됐어. 재생 버튼으로 다시 시작해.');}};
   startedAt=ctx.currentTime;node.start();onStatus(expectedDuration===undefined?'소리 재생 중 · 진폭 기반 입 열기 (음소 정렬 아님)':'팩 재생 중 · 실제 오디오 시계 / CTC 추정 구간 + 최대 0.12초 렌더 보간 · I→E 대체');
  }catch(error){if(clock.owns(token)){stop('error');onStatus(`오류 · ${error instanceof Error?error.message:String(error)}`);}}
 }
 return {get currentTime(){return source&&context?Math.max(0,context.currentTime-startedAt):0;},get active(){return clock.active;},play,stop,tick(dt:number){if(analyser){analyser.getFloatTimeDomainData(samples);mouth=amplitudeMouth(samples,mouth,dt);onMouth(mouth);}}};
}
