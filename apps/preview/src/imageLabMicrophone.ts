import {amplitudeMouth} from './imageLabGuideAudio';
type Environment={secure:()=>boolean;getStream:()=>Promise<MediaStream>;context:()=>AudioContext};
/** Local analyser only: deliberately no connection to destination, recorder or network. */
export function createMicrophone(onMouth:(v:number)=>void,onStatus:(s:string)=>void,onTakeover:()=>void,env:Environment={secure:()=>window.isSecureContext,getStream:()=>navigator.mediaDevices.getUserMedia({audio:true,video:false}),context:()=>new AudioContext()}){
 let generation=0,active=false,stream:MediaStream|undefined,context:AudioContext|undefined,source:MediaStreamAudioSourceNode|undefined,analyser:AnalyserNode|undefined,mouth=0,sensitivity=1;
 let samples=new Float32Array(1024);
 const ended=()=>stop('장치 연결 종료');
 function stop(reason='정지'){
  generation++;active=false;
  if(stream){for(const track of stream.getTracks()){track.removeEventListener('ended',ended);track.stop();}stream=undefined;}
  source?.disconnect();source=undefined;analyser?.disconnect();analyser=undefined;
  const old=context;context=undefined;if(old){old.onstatechange=null;if(old.state!=='closed')void old.close().catch(()=>onStatus('오류 · 마이크 컨텍스트 해제 실패'));}
  mouth=0;onMouth(0);onStatus('마이크 '+reason+' · 입 닫힘');
 }
 async function start(){
  stop();onTakeover();const token=++generation;active=true;
  try{
   if(!env.secure())throw Error('마이크는 localhost 또는 HTTPS에서 시작해.');
   onStatus('마이크 권한 대기 · 정지로 취소 가능');
   const pending=await env.getStream();
   if(token!==generation){pending.getTracks().forEach(t=>t.stop());return;}
   stream=pending;const tracks=stream.getTracks();if(!tracks.length||tracks.some(t=>t.readyState==='ended'))throw Error('사용 가능한 마이크 없음');
   for(const track of tracks)track.addEventListener('ended',ended);
   const ctx=env.context();context=ctx;await ctx.resume();if(token!==generation)return;
   source=ctx.createMediaStreamSource(stream);analyser=ctx.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=0;samples=new Float32Array(analyser.fftSize);source.connect(analyser);
   ctx.onstatechange=()=>{if(token===generation&&ctx.state!=='running')stop('오디오 중단');};
   onStatus('마이크 켜짐 · 로컬 RMS / 녹음·업로드·모니터 재생 없음');
  }catch(error){if(token===generation){stop('오류');const name=(error as Error).name;onStatus(name==='NotFoundError'?'마이크 입력 장치 없음 · 권한 거부와 달라. USB 마이크를 연결하거나 실제 오디오 입력이 있는 노트북에서 열어 줘. 입력 장치 확인 버튼으로 목록을 확인해.':name==='NotAllowedError'?'마이크 권한 거부 · 브라우저와 시스템 마이크 권한을 확인해.':'마이크 오류 · '+String(error));}}
 }
 return {start,stop,get active(){return active;},setSensitivity(v:number){sensitivity=Number.isFinite(v)?Math.max(.25,Math.min(4,v)):1;},tick(dt:number){if(!analyser)return;try{analyser.getFloatTimeDomainData(samples);for(let i=0;i<samples.length;i++)samples[i]*=sensitivity;mouth=amplitudeMouth(samples,mouth,dt);onMouth(mouth);}catch{stop('분석 오류');}}};
}
