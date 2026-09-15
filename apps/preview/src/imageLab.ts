import './imageLab.css';
import {createMicrophone} from './imageLabMicrophone';
import {createCamera} from './imageLabCamera';
import {applyFace} from './imageLabFace';
import {installBroadcast} from './imageLabBroadcast';
import {createLocalSpeech,localVoices,createGentlePose,composeLabMotion,labRigidMotion} from './imageLabSpeechPose';
import {validateSpeechPack,packShape,MAX_PACK_BYTES,type SpeechPack} from './imageLabSpeechPack';
import {buildPartPrompt} from './imageLabGuideAudio';
import {replacePart} from './imageLabCore';
import {createLocalAudio} from './imageLabAudio';
import front from '../../../assets/character/front.jpg?url';
import reference from '../../../assets/character/reference-sheet.jpg?url';
import expressions from '../../../assets/character/expression-sheet.jpg?url';
import {extractMaterialTextures,type MaterialImages} from './imageLabMaterials';
import {RigRuntime} from '@standrig/runtime';
import {buildImageRig} from './imageLabRig';
import {createProject,parseProject,serializeProject,replaceSource,inspectDataImage,chromaKey,partitionImage,regionBounds,replacementPlacement,needsLabRender,PARAMS,ROLES,LABELS,MAX_IMAGE_BYTES,MAX_PROJECT_BYTES,type LabProject,type LocalImage,type Role} from './imageLabCore';
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=(id:string)=>el<HTMLInputElement>(id);
const stage=el<HTMLCanvasElement>('stage'),mask=el<HTMLCanvasElement>('mask');
let project:LabProject,runtime:RigRuntime|undefined,sourceImage:HTMLImageElement,playing=false,closeup=false,busy=false;
let textures={} as Record<Role,string>;let previous=0,elapsed=0,lastSignature="";
const status=(s:string)=>{el('status').textContent=s;};
const audioStatus=(s:string)=>{el('audioStatus').textContent=s;};
let speechMouth=0,wasActive=false;
const mouthOverlay=(value:number)=>{speechMouth=value;};
// A speech session owns only mouth openness. Closing is persistent; never restore a saved open mouth.
const takeMouth=()=>{if(project){project.params.ParamMouthOpen=0;input('ParamMouthOpen').value='0';}speechMouth=0;};
const audio=createLocalAudio(mouthOverlay,audioStatus,takeMouth);
installBroadcast();
const cameraPanel=document.createElement('section');
cameraPanel.innerHTML='<button id="cameraStart">카메라 시작</button><button id="cameraStop">카메라 정지</button><button id="cameraCalibrate">현재 얼굴 중립 보정</button><button id="micDiagnostic">입력 장치 확인</button><p>얼굴만 추적 · 손/전신 추적 없음. 눈·입 표현과 전체 캐릭터 위치/기울임, 비율 유지. CAMERA 폴더 포함 localhost 패키지 필요. 영상 저장/전송 없음.</p><p id="cameraStatus" role="status">카메라 꺼짐</p>';
el('broadcastControls').append(cameraPanel);
const camera=createCamera(s=>{el('cameraStatus').textContent=s;});
el('cameraStart').addEventListener('click',()=>{if(project&&!busy)void camera.start();});
el('cameraStop').addEventListener('click',()=>camera.stop());
el('cameraCalibrate').addEventListener('click',()=>camera.calibrate());
el('micDiagnostic').addEventListener('click',async()=>{try{const devices=await navigator.mediaDevices.enumerateDevices();const count=devices.filter(d=>d.kind==='audioinput').length;el('micStatus').textContent=count?`오디오 입력 ${count}개 표시됨 (기본 장치 포함 가능) · 시스템에서 기본 입력 선택 후 마이크 시작`:'표시되는 오디오 입력 없음 · USB 마이크를 연결하거나 실제 입력이 있는 노트북에서 열어 줘. 권한/브라우저가 목록을 숨길 수도 있어.';}catch{el('micStatus').textContent='장치 확인 불가 · localhost와 브라우저 권한을 확인해.';}});
window.addEventListener('pagehide',()=>camera.stop('pagehide'));
const mic=createMicrophone(mouthOverlay,s=>{el('micStatus').textContent=s;},()=>{speech.stop('mic');stopAudio();takeMouth();});
el('micStart').addEventListener('click',()=>{if(project&&!busy)void mic.start();});
el('micStop').addEventListener('click',()=>mic.stop());
input('micSensitivity').addEventListener('input',()=>mic.setSensitivity(input('micSensitivity').valueAsNumber));
window.addEventListener('pagehide',()=>mic.stop('pagehide'));
let loadedPack:SpeechPack|undefined,playingPack:SpeechPack|undefined,packGeneration=0;
const packPanel=document.createElement('section');
const packLabel=document.createElement('label');packLabel.textContent='오프라인 speech pack (.speech.json, 최대 5MB)';
const packInput=document.createElement('input');packInput.type='file';packInput.accept='.speech.json,application/json';packInput.id='speechPackFile';packLabel.append(packInput);
const packPlay=document.createElement('button');packPlay.id='speechPackPlay';packPlay.textContent='팩 재생';packPlay.disabled=true;
const packStop=document.createElement('button');packStop.id='speechPackStop';packStop.textContent='팩 정지';
const packInfo=document.createElement('p');packInfo.id='speechPackStatus';packInfo.textContent='로컬 CLI speech.py로 먼저 생성 → 파일 가져오기 → 재생. 원클릭 TTS 아님. CTC 추정 자모 구간, 최대 0.12초 렌더 보간. I(ㅣㅟㅡㅢ)는 전용 그림 없이 E 대체.';
packPanel.append(packLabel,packPlay,packStop,packInfo);el('audioStatus').after(packPanel);
packInput.addEventListener('change',async()=>{speech.stop('pack');stopAudio();loadedPack=undefined;packPlay.disabled=true;const generation=packGeneration;try{const file=packInput.files?.[0];if(!file||file.size>MAX_PACK_BYTES)throw Error('팩 제한 5MB');const parsed=await validateSpeechPack(await file.text());if(generation!==packGeneration)return;loadedPack=parsed;packPlay.disabled=false;packInfo.textContent='검증 완료 · '+parsed.text+' · I→E 대체 / 추정 구간';}catch(e){if(generation===packGeneration)packInfo.textContent='오류 · '+String(e);}});
packPlay.addEventListener('click',()=>{if(!project||busy||!loadedPack)return;speech.stop('pack');stopAudio();playingPack=loadedPack;const bytes=Uint8Array.from(atob(loadedPack.audio.split(',')[1]),c=>c.charCodeAt(0));void audio.play(new File([bytes],'speech.wav',{type:'audio/wav'}),loadedPack.duration);});
packStop.addEventListener('click',()=>stopAudio());
const pose=createGentlePose();
const synth=window.speechSynthesis;
const speech=createLocalSpeech({synth,utterance:text=>new SpeechSynthesisUtterance(text),now:()=>performance.now(),setTimer:(f,ms)=>window.setTimeout(f,ms),clearTimer:id=>window.clearTimeout(id),onMouth:mouthOverlay,onStatus:text=>{el('ttsStatus').textContent=text;},onTakeover:()=>{stopAudio();takeMouth();}});
function voices(){const select=el<HTMLSelectElement>('ttsVoice'),prior=select.value;select.replaceChildren();for(const voice of localVoices(synth?.getVoices()??[])){const option=document.createElement('option');option.value=voice.voiceURI;option.textContent=`${voice.name} · ${voice.lang} · 로컬`;select.append(option);}if([...select.options].some(o=>o.value===prior))select.value=prior;if(!select.options.length){const option=document.createElement('option');option.value='';option.textContent='로컬 음성 없음';select.append(option);}if(!speech.active)el('ttsStatus').textContent=select.value?'로컬 음성 준비 · 말하기를 눌러.':'오류 · 로컬 음성이 없어. 로컬 오디오 파일을 선택해.';}
synth?.addEventListener('voiceschanged',voices);voices();
el('ttsRefresh').addEventListener('click',voices);
el('ttsSpeak').addEventListener('click',()=>{if(!project||busy)return;stopAudio();speech.speak(el<HTMLTextAreaElement>('ttsText').value,el<HTMLSelectElement>('ttsVoice').value);});
el('ttsStop').addEventListener('click',()=>{speech.stop();if(!audio.active)takeMouth();});
el('ttsVoice').addEventListener('change',()=>speech.stop('voice'));
const poseButtons=[['poseBow','bow'],['poseNod','nod'],['poseTilt','tilt']] as const;
for(const [id,kind] of poseButtons)el(id).addEventListener('click',()=>{if(!project||busy)return;if(pose.start(kind))el('poseStatus').textContent='포즈 진행 · 캐릭터 전체 인사 기울임 (머리만 회전 아님)';});
el('poseStop').addEventListener('click',()=>pose.cancel());
function stopAudio(){mic.stop();packGeneration++;playingPack=undefined;audio.stop();audioStatus('정지 · 입 닫힘 / 오디오 해제');}
function stopMotion(){camera.stop();speech.stop('transition');stopAudio();pose.cancel(true);el('poseStatus').textContent='이전 포즈 복원 · 직접 조작 우선';}
el('audioPlay').addEventListener('click',()=>speech.stop('audio'));
input('audioFile').addEventListener('change',()=>speech.stop('audio'));
window.addEventListener('pagehide',()=>{speech.stop('pagehide');pose.cancel(true);synth?.removeEventListener('voiceschanged',voices);});
el('audioPlay').addEventListener('click',()=>{stopAudio();if(!project||busy){audioStatus('오류 · 이미지 준비가 끝난 뒤 재생해.');return;}const file=input('audioFile').files?.[0];if(!file){audioStatus('오류 · 오디오 파일을 선택해.');return;}void audio.play(file);});
el('audioStop').addEventListener('click',()=>{audio.stop();if(!speech.active)takeMouth();audioStatus('정지 · 입 닫힘 / 오디오 해제');});
input('audioFile').addEventListener('change',()=>{stopAudio();audioStatus(input('audioFile').files?.[0]?'파일 선택 완료 · 재생 버튼을 눌러.':'파일 선택 후 재생해.');});
window.addEventListener('pagehide',()=>{audio.stop('pagehide');runtime?.dispose();});
el('copyPrompt').addEventListener('click',async()=>{const text=el<HTMLTextAreaElement>('partPrompt');try{await navigator.clipboard.writeText(text.value);el('promptStatus').textContent='프롬프트 복사 완료';}catch{text.focus();text.select();el('promptStatus').textContent='자동 복사 불가 · 선택된 텍스트를 Ctrl+C / ⌘C로 복사해.';}});
const selected=()=>project.parts.find(p=>p.id===el<HTMLSelectElement>('role').value)!;
async function decode(data:string){const image=new Image();image.src=data;await image.decode();return image;}
function canvas(w:number,h:number){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
async function local(blob:Blob,name:string):Promise<LocalImage>{
 if(blob.size>MAX_IMAGE_BYTES)throw Error('이미지 제한 8MB');
 const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(blob);});
 inspectDataImage(data);const image=await decode(data),ratio=Math.min(1,1536/Math.max(image.width,image.height));
 const c=canvas(Math.round(image.width*ratio),Math.round(image.height*ratio));c.getContext('2d')!.drawImage(image,0,0,c.width,c.height);
 return {name:name.slice(0,120),data:c.toDataURL('image/png'),width:c.width,height:c.height};
}
function download(data:Blob|string,name:string){const url=typeof data==='string'?data:URL.createObjectURL(data);const a=document.createElement('a');a.href=url;a.download=name;a.click();if(typeof data!=='string')setTimeout(()=>URL.revokeObjectURL(url),1000);}
function json(value:string,name:string){download(new Blob([value],{type:'application/json'}),name);}
async function run(action:()=>void|Promise<void>){if(busy)return;busy=true;try{await action();}catch(e){status(`오류 · ${e instanceof Error?e.message:String(e)}`);}finally{busy=false;}}
function maskView(){if(!project||!sourceImage)return;const ctx=mask.getContext('2d')!;ctx.clearRect(0,0,mask.width,mask.height);ctx.drawImage(sourceImage,0,0,mask.width,mask.height);const p=selected();ctx.beginPath();p.polygon.forEach(([x,y],i)=>i?ctx.lineTo(x*mask.width,y*mask.height):ctx.moveTo(x*mask.width,y*mask.height));ctx.closePath();ctx.fillStyle='#60ffc233';ctx.fill();ctx.strokeStyle='#b1ffdd';ctx.lineWidth=2;ctx.stroke();for(const [x,y] of p.polygon){ctx.beginPath();ctx.arc(x*mask.width,y*mask.height,5,0,7);ctx.fillStyle='#fff';ctx.fill();}el<HTMLTextAreaElement>('polygon').value=JSON.stringify(p.polygon);input('order').value=String(p.order);el<HTMLTextAreaElement>('partPrompt').value=buildPartPrompt(p.id);input('placeX').value=String(p.placement?.x??0);input('placeY').value=String(p.placement?.y??0);input('placeScale').value=String(p.placement?.scale??1);}
function sync(){for(const id of ['tolerance','softness','overlap','stiffness','damping'] as const)input(id).value=String(project.settings[id]);input('key').checked=project.settings.keyEnabled;input('physics').checked=project.settings.physicsEnabled;input('color').value='#'+project.settings.keyColor.map(x=>x.toString(16).padStart(2,'0')).join('');for(const p of PARAMS){input(p.id).value=String(project.params[p.id]);el(`${p.id}-value`).textContent=String(project.params[p.id]);}el<HTMLImageElement>('before').src=project.source.data;maskView();}
async function rebuild(){stopMotion();status('파트 분리 / 네이티브 리그 준비 중…');const validated=parseProject(serializeProject(project));sourceImage=await decode(validated.source.data);
 const ratio=Math.min(1,900/sourceImage.height),w=Math.round(sourceImage.width*ratio),h=Math.round(sourceImage.height*ratio),c=canvas(w,h),ctx=c.getContext('2d')!;ctx.drawImage(sourceImage,0,0,w,h);
 const keyed=chromaKey(ctx.getImageData(0,0,w,h).data,validated.settings);const layers=partitionImage(keyed,w,h,validated.parts,validated.settings.overlap,validated.preset==='supplied-front');const next={} as Record<Role,string>;
 for(const layer of layers){ctx.clearRect(0,0,w,h);ctx.putImageData(new ImageData(new Uint8ClampedArray(layer.pixels),w,h),0,0);const part=validated.parts.find(p=>p.id===layer.id)!;
 if(part.replacement){const image=await decode(part.replacement.data),b=replacementPlacement(image,part.polygon,w,h,part.placement,validated.source);ctx.clearRect(0,0,w,h);ctx.save();ctx.beginPath();part.polygon.forEach(([x,y],i)=>i?ctx.lineTo(x*w,y*h):ctx.moveTo(x*w,y*h));ctx.closePath();if(b.clip)ctx.clip();ctx.drawImage(image,b.x,b.y,b.width,b.height);ctx.restore();}next[layer.id]=c.toDataURL('image/png');}
 const materials:MaterialImages={};
 if(validated.preset==='supplied-front'){
  const sheet=await decode(expressions),sc=canvas(sheet.width,sheet.height),sctx=sc.getContext('2d')!;sctx.drawImage(sheet,0,0);
  const extracted=extractMaterialTextures(sctx.getImageData(0,0,sc.width,sc.height).data,sc.width,sc.height,validated,w,h);
  for(const [id,pixels] of Object.entries(extracted)){ctx.clearRect(0,0,w,h);ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels),w,h),0,0);materials[id as keyof MaterialImages]=c.toDataURL('image/png');}
 }
 const nextRuntime=new RigRuntime(buildImageRig(validated,next,w,h,materials));await nextRuntime.loadAssets();runtime?.dispose();runtime=nextRuntime;lastSignature="";textures=next;project=validated;sync();status('준비 완료 · 로컬 초안 / 최대 포즈 시각 검증 전');}
for(const role of ROLES){const option=document.createElement('option');option.value=role;option.textContent=LABELS[role];el('role').append(option);}el<HTMLSelectElement>('role').value='head';
for(const p of PARAMS){const label=document.createElement('label');label.textContent=p.label;const out=document.createElement('output');out.id=`${p.id}-value`;const slider=document.createElement('input');slider.id=p.id;slider.type='range';slider.min=String(p.min);slider.max=String(p.max);slider.step='.1';slider.value=String(p.default);slider.oninput=()=>{if(!project)return;const value=Number(slider.value);if(p.id.startsWith('ParamMouth')){speech.stop('mouth slider');stopAudio();}project.params[p.id]=value;slider.value=String(value);out.textContent=slider.value;};label.append(out,slider);el('params').append(label);}
function on(id:string,action:()=>void|Promise<void>,event='click'){el(id).addEventListener(event,()=>void run(action));}
// Independent of run's busy guard: transitions must cancel pending decode immediately.
for(const [id,event] of [['reset','click'],['source','change'],['load','change']] as const)el(id).addEventListener(event,stopMotion);
on('applyPlacement',async()=>{if(!selected().replacement)throw Error('선택 파트 이미지를 먼저 가져와.');const draft=structuredClone(project);draft.parts.find(p=>p.id===selected().id)!.placement={x:input('placeX').valueAsNumber,y:input('placeY').valueAsNumber,scale:input('placeScale').valueAsNumber};const prior=project;project=parseProject(JSON.stringify(draft));try{await rebuild();}catch(e){project=prior;throw e;}});
on('source',async()=>{const f=input('source').files?.[0];if(!f)return;project=replaceSource(project,await local(f,f.name));await rebuild();status('원본 교체 완료 · 기존 마스크 유지. 다른 구도라면 조정해 줘.');},'change');
on('part',async()=>{const f=input('part').files?.[0];if(!f)return;Object.assign(selected(),replacePart(selected(),await local(f,f.name)));await rebuild();},'change');
on('clearPart',async()=>{Object.assign(selected(),replacePart(selected()));await rebuild();});on('partExport',()=>download(textures[selected().id],`${selected().id}.png`));
on('role',maskView,'change');
on('apply',async()=>{const draft=structuredClone(project);draft.parts.find(p=>p.id===selected().id)!.polygon=JSON.parse(el<HTMLTextAreaElement>('polygon').value);project=parseProject(JSON.stringify(draft));await rebuild();});
on('order',async()=>{const value=Number(input('order').value);if(!Number.isFinite(value))throw Error('순서를 확인해 줘');selected().order=value;await rebuild();},'change');
for(const id of ['tolerance','softness','overlap','stiffness','damping'] as const)on(id,async()=>{project.settings[id]=Number(input(id).value);await rebuild();},'change');
on('key',async()=>{project.settings.keyEnabled=input('key').checked;await rebuild();},'change');on('color',async()=>{const s=input('color').value;project.settings.keyColor=[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)) as [number,number,number];await rebuild();},'change');
on('physics',()=>{project.settings.physicsEnabled=input('physics').checked;if(runtime){runtime.rig.physics.enabled=project.settings.physicsEnabled;runtime.resetPhysics();}},'change');
on('play',()=>{playing=!playing;el('play').textContent=playing?'일시정지':'재생';runtime?.resumeClock();});on('reset',()=>{playing=false;elapsed=0;lastSignature='';project.params=Object.fromEntries(PARAMS.map(p=>[p.id,p.default]));runtime?.resetPhysics();el('play').textContent='재생';sync();});on('zoom',()=>{closeup=!closeup;el('zoom').textContent=closeup?'전체 보기':'얼굴 확대';});
on('save',()=>json(serializeProject(project),'image-lab.project.json'));on('native',()=>{if(runtime)json(JSON.stringify(runtime.rig),'image-lab.standrig.json');});on('png',()=>download(stage.toDataURL('image/png'),'image-lab.png'));
on('load',async()=>{const f=input('load').files?.[0];if(!f)return;if(f.size>MAX_PROJECT_BYTES)throw Error('프로젝트 제한 40MB');const prior=project;try{project=parseProject(await f.text());await rebuild();}catch(e){project=prior;throw e;}},'change');
let drag=-1,oldPolygon:typeof project.parts[number]['polygon'];
mask.onpointerdown=e=>{if(!project||busy)return;const r=mask.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;drag=selected().polygon.findIndex(p=>Math.hypot((p[0]-x)*r.width,(p[1]-y)*r.height)<15);oldPolygon=structuredClone(selected().polygon);mask.setPointerCapture(e.pointerId);};
mask.onpointermove=e=>{if(drag<0||busy)return;const r=mask.getBoundingClientRect();selected().polygon[drag]=[Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];maskView();};
mask.onpointerup=()=>{if(drag<0)return;drag=-1;void run(async()=>{try{parseProject(JSON.stringify(project));}catch(e){selected().polygon=oldPolygon;maskView();throw e;}await rebuild();});};
stage.onpointermove=e=>{if(!project||!input('follow').checked)return;const r=stage.getBoundingClientRect();project.params.ParamAngleX=((e.clientX-r.left)/r.width-.5)*24;project.params.ParamAngleY=(.5-(e.clientY-r.top)/r.height)*16;};
function frame(now:number){
 const dt=Math.min(.05,(now-previous)/1000);previous=now;
 if(runtime&&project){
  audio.tick(dt);speech.tick(now);mic.tick(dt);
  const wasPosing=pose.active,poseMotion=pose.tick(dt);
  if(wasPosing&&!pose.active)el('poseStatus').textContent='전체 기울임 복원 완료';
  for(const [id,kind] of poseButtons)el(id).setAttribute('aria-pressed',String(pose.kind===kind));
  const active=playing||audio.active||speech.active||mic.active||pose.active||camera.active;
  if(active)elapsed+=dt;else elapsed=0;
  let renderParams=composeLabMotion(project.params,{seconds:elapsed,active,mouth:audio.active||speech.active||mic.active?speechMouth:undefined});
  if(camera.active)renderParams=applyFace(renderParams,camera.pose,audio.active||speech.active||mic.active);
  if(playingPack&&audio.active){const shape=packShape(playingPack,audio.currentTime,speechMouth);renderParams.ParamMouthForm=shape.form;renderParams.ParamMouthOpen=shape.open;}
  // Without registered expression textures, do not automatically scale face cutouts.
  for(const [id,asset] of [['ParamEyeLOpen','eye-left-closed'],['ParamEyeROpen','eye-right-closed'],['ParamMouthOpen','mouth-A']]){
   if(!runtime.rig.assets.some(a=>a.id===asset))renderParams[id]=project.params[id];
  }
  const motion=labRigidMotion(elapsed,playing||audio.active||speech.active||mic.active);
  // Drive only the spring, never head/body geometry or saved parameters.
  renderParams.ParamHairDrive=active?Math.max(-4,Math.min(4,2.4*Math.sin(elapsed*1.8)+poseMotion.rotation*.7)):0;
  stage.style.transformOrigin='50% 85%';
  const rigid=camera.active?camera.pose:{x:motion.x+poseMotion.x,y:motion.y+poseMotion.y,rotation:motion.rotation+poseMotion.rotation};
  stage.style.transform=`translate(${rigid.x}px, ${rigid.y}px) rotate(${rigid.rotation}deg)`;
  // Sliders stay editable baselines; outputs describe the actual expression sent to the renderer.
  for(const p of PARAMS)el(`${p.id}-value`).textContent=renderParams[p.id].toFixed(3);
  // Include overlay and ownership so the final exact baseline is rendered, then idle.
  const signature=JSON.stringify([renderParams,active,project.settings.physicsEnabled,closeup,input('mesh').checked,stage.clientWidth,stage.clientHeight]);
  if(needsLabRender(active,lastSignature,signature)){
   if(!wasActive)runtime.resumeClock();
   runtime.render(stage,renderParams,{transparent:true,showBounds:input('mesh').checked,zoom:closeup?3:1,panY:closeup?stage.clientHeight*.95:0,fitPadding:20});lastSignature=signature;
  }
  wasActive=active;
 }
 requestAnimationFrame(frame);
}requestAnimationFrame(frame);
el<HTMLImageElement>('reference').src=reference;
void run(async()=>{const response=await fetch(front);if(!response.ok)throw Error('샘플 로드 실패');project=createProject(await local(await response.blob(),'supplied-front.jpg'),true);await rebuild();});
