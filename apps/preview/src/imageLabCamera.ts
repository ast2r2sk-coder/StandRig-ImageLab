import {FaceLandmarker,FilesetResolver} from '@mediapipe/tasks-vision';
import {createFaceMapper} from './imageLabFace';
export function createCamera(onStatus:(s:string)=>void){
 const mapper=createFaceMapper(),video=document.createElement('video');video.muted=true;video.playsInline=true;
 let generation=0,active=false,stream:MediaStream|undefined,model:FaceLandmarker|undefined,raf=0,last=0,lastVideo=-1,pose=mapper.map({faceLandmarks:[]});
 function stop(reason='정지'){
  generation++;active=false;cancelAnimationFrame(raf);raf=0;
  stream?.getTracks().forEach(t=>{t.removeEventListener('ended',ended);t.stop();});stream=undefined;video.pause();video.srcObject=null;
  model?.close();model=undefined;mapper.calibrate();pose=mapper.map({faceLandmarks:[]});onStatus('카메라 '+reason+' · 중립');
 }
 const ended=()=>stop('장치 연결 종료');
 async function start(){
  stop();const token=++generation;active=true;
  try{
   if(!window.isSecureContext||location.protocol==='file:')throw Error('CAMERA 폴더가 포함된 패키지를 localhost에서 열어 줘. 단일 HTML만으로는 카메라를 사용할 수 없어.');
   onStatus('카메라 권한 대기 · 녹화/저장/업로드 없음');
   const pending=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
   if(token!==generation){pending.getTracks().forEach(t=>t.stop());return;}
   stream=pending;for(const t of stream.getTracks())t.addEventListener('ended',ended);
   video.srcObject=stream;await video.play();if(token!==generation)return;
   onStatus('로컬 얼굴 모델 준비 중');
   const base=new URL('./CAMERA/',location.href).href;
   const files=await FilesetResolver.forVisionTasks(base+'wasm');if(token!==generation)return;
   const loaded=await FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:base+'face_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numFaces:1,outputFaceBlendshapes:true});
   if(token!==generation){loaded.close();return;}model=loaded;last=0;lastVideo=-1;
   const loop=(now:number)=>{
    if(token!==generation)return;
    try{if(now-last>=1000/15){last=now;if(video.readyState>=2&&video.currentTime!==lastVideo){lastVideo=video.currentTime;pose=mapper.map(model!.detectForVideo(video,now));}else pose=mapper.map({faceLandmarks:[]});onStatus(pose.tracked?'얼굴 추적 · 눈/입 + 캐릭터 전체 위치·기울임 (머리만 회전 아님)':'얼굴 없음 · 중립');}}catch{stop('추론 오류 · 정지 후 다시 시작해');return;}
    raf=requestAnimationFrame(loop);
   };raf=requestAnimationFrame(loop);
  }catch(e){if(token===generation){stop('오류');const name=(e as Error).name;onStatus(name==='NotFoundError'?'카메라 입력 장치 없음 · 카메라가 있는 노트북이나 USB 웹캠에서 열어 줘.':name==='NotAllowedError'?'카메라 권한 거부 · 브라우저/시스템 권한을 확인해.':'카메라 오류 · '+String(e));}}
 }
 return {start,stop,calibrate(){mapper.calibrate();pose=mapper.map({faceLandmarks:[]});},get active(){return active;},get pose(){return pose;}};
}
