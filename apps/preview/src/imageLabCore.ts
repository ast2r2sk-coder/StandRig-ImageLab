// Local image-project contract. No URLs, DOM, storage, services or model-freeze claims.
export type Point = [number, number];
export const ROLES = ['hair-back', 'body', 'head', 'hair-left', 'hair-right', 'eye-left', 'eye-right', 'mouth'] as const;
export type Role = typeof ROLES[number];
export const LABELS: Record<Role, string> = { 'hair-back':'뒤 머리', body:'몸 / 나머지', head:'머리', 'hair-left':'화면 왼쪽 머리', 'hair-right':'화면 오른쪽 머리', 'eye-left':'화면 왼쪽 눈', 'eye-right':'화면 오른쪽 눈', mouth:'입' };
export const PARAMS = [
  {id:'ParamAngleX',label:'머리 X · 좌우',min:-12,max:12,default:0},
  {id:'ParamAngleY',label:'머리 Y · 상하',min:-8,max:8,default:0},
  {id:'ParamAngleZ',label:'머리 Z · 기울기',min:-8,max:8,default:0},
  {id:'ParamBodyAngleX',label:'몸 X · 좌우',min:-6,max:6,default:0},
  {id:'ParamBodyAngleY',label:'몸 Y · 상하',min:-4,max:4,default:0},
  {id:'ParamBodyAngleZ',label:'몸 Z · 기울기',min:-4,max:4,default:0},
  {id:'ParamEyeLOpen',label:'왼쪽 눈 열기',min:0,max:1,default:1},
  {id:'ParamEyeROpen',label:'오른쪽 눈 열기',min:0,max:1,default:1},
  {id:'ParamMouthOpen',label:'입 열기',min:0,max:1,default:0},
  {id:'ParamMouthForm',label:'입 형태 · E / A / O',min:-1,max:1,default:0},
];
export const MAX_PROJECT_BYTES = 40 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export interface LocalImage { name:string; data:string; width:number; height:number }
export interface Placement {x:number;y:number;scale:number}
export interface PartRegion { id:Role; polygon:Point[]; order:number; replacement?:LocalImage; placement?:Placement }
function placement(value:unknown):Placement {
 const p=record(value);
 if(typeof p.x!=='number'||!Number.isFinite(p.x)||Math.abs(p.x)>1||typeof p.y!=='number'||!Number.isFinite(p.y)||Math.abs(p.y)>1||typeof p.scale!=='number'||!Number.isFinite(p.scale)||p.scale<.1||p.scale>4)throw Error('배치: X/Y -1~1, 배율 0.1~4');
 return {x:p.x,y:p.y,scale:p.scale};
}
export interface LabSettings { keyEnabled:boolean; keyColor:[number,number,number]; tolerance:number; softness:number; overlap:number; physicsEnabled:boolean; stiffness:number; damping:number }
export interface LabProject {
  format:'image-standrig-project'; version:1; preset:'supplied-front'|'manual'; source:LocalImage;
  parts:PartRegion[]; settings:LabSettings; params:Record<string,number>;
  anchors:{headPivot:Point; headRadius:Point; headJoin:number; bodyPivot:Point};
}
export const defaults = ():LabSettings => ({keyEnabled:true,keyColor:[252,2,250],tolerance:65,softness:65,overlap:4,physicsEnabled:true,stiffness:32,damping:7});
export function clamp(value:number,min:number,max:number) { return Math.min(max,Math.max(min,value)); }
function finite(value:unknown,min:number,max:number):number {
  if(typeof value!=='number'||!Number.isFinite(value)) throw new Error('유한한 숫자가 필요해. (finite number)');
  return clamp(value,min,max);
}
function record(value:unknown):Record<string,unknown> {
  if(!value || typeof value!=='object'||Array.isArray(value)) throw new Error('잘못된 프로젝트 구조야.');
  return value as Record<string,unknown>;
}
function bool(value:unknown):boolean { if(typeof value!=='boolean') throw new Error('잘못된 설정 값이야.'); return value; }
function point(value:unknown):Point {
  if(!Array.isArray(value)||value.length!==2||value.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<0||x>1)) throw new Error('좌표는 0~1이어야 해.');
  return [value[0],value[1]];
}
export function normalizeSettings(value:unknown):LabSettings {
  const s=record(value);
  if(!Array.isArray(s.keyColor)||s.keyColor.length!==3) throw new Error('키 색상을 확인해 줘.');
  return { keyEnabled:bool(s.keyEnabled),keyColor:s.keyColor.map(x=>Math.round(finite(x,0,255))) as [number,number,number], tolerance:finite(s.tolerance,0,180),softness:finite(s.softness,1,180),overlap:Math.round(finite(s.overlap,0,12)),physicsEnabled:bool(s.physicsEnabled),stiffness:finite(s.stiffness,5,80),damping:finite(s.damping,2,20) };
}
export function inspectDataImage(data:unknown):{width:number;height:number;mime:string} {
  if(typeof data!=='string'||data.length>Math.ceil(MAX_IMAGE_BYTES*4/3)+40) throw new Error('이미지 크기 제한은 8MB야.');
  const match=/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if(!match||match[2].length%4!==0) throw new Error('PNG/JPG data 이미지만 허용해. 외부 URL은 불가해.');
  const binary=atob(match[2]); const a=Uint8Array.from(binary,c=>c.charCodeAt(0));
  const view=new DataView(a.buffer); let width=0,height=0;
  if(match[1]==='image/png') {
    if(a.length<33||[137,80,78,71,13,10,26,10].some((v,i)=>a[i]!==v)||view.getUint32(8)!==13||binary.slice(12,16)!=='IHDR') throw new Error('PNG 파일 내용이 올바르지 않아.');
    width=view.getUint32(16); height=view.getUint32(20);
  } else {
    if(a[0]!==255||a[1]!==216) throw new Error('JPG 파일 내용이 올바르지 않아.');
    for(let i=2;i+8<a.length;) {
      if(a[i++]!==255) throw new Error('잘못된 JPG 마커야.');
      while(a[i]===255)i++;
      const marker=a[i++]; if(marker===217||marker===218)break;
      const len=(a[i]<<8)|a[i+1]; if(len<2||i+len>a.length)break;
      if([192,193,194].includes(marker)){height=(a[i+3]<<8)|a[i+4];width=(a[i+5]<<8)|a[i+6];break;} i+=len;
    }
  }
  if(width<1||height<1||width>4096||height>4096||width*height>12000000) throw new Error('이미지 dimension 크기 제한: 4096px / 12MP.');
  return {width,height,mime:match[1]};
}
function localImage(value:unknown):LocalImage {
  const img=record(value); const dimensions=inspectDataImage(img.data);
  if(typeof img.name!=='string'||img.name.length>120||img.width!==dimensions.width||img.height!==dimensions.height) throw new Error('이미지 이름 / 해상도가 올바르지 않아.');
  // Imported working assets must already be normalized, avoiding large decoded layer allocations.
  if(Math.max(dimensions.width,dimensions.height)>1536) throw new Error('프로젝트 이미지는 최대 1536px로 정규화해야 해.');
  return {name:img.name,data:img.data as string,width:dimensions.width,height:dimensions.height};
}
const rect=(x:number,y:number,w:number,h:number):Point[]=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
export function createProject(source:LocalImage,sample=false):LabProject {
  const polygons:Point[][] = [
    [[.395,.11],[.60,.11],[.70,.36],[.59,.40],[.51,.25],[.42,.40],[.29,.36]],
    rect(0,0,1,1),
    [[.395,0],[.62,0],[.626,.125],[.575,.154],[.47,.154],[.393,.125]],
    [[.423,.095],[.458,.12],[.43,.24],[.405,.36],[.285,.335],[.358,.225]],
    [[.584,.095],[.61,.12],[.672,.225],[.715,.335],[.607,.36],[.574,.24]],
    rect(448/1024,127/1536,55/1024,31/1536),rect(521/1024,127/1536,55/1024,31/1536),rect(491/1024,180/1536,40/1024,20/1536),
  ];
  return {format:'image-standrig-project',version:1,preset:sample?'supplied-front':'manual',source:localImage(source),
    parts:ROLES.map((id,i)=>({id,polygon:polygons[i],order:id==='body'?0:i===0?1:i+1})),
    settings:{...defaults(),keyEnabled:sample},params:Object.fromEntries(PARAMS.map(p=>[p.id,p.default])),
    anchors:{headPivot:[.517,.15],headRadius:[.105,.078],headJoin:.20,bodyPivot:[.51,.81]}};
}
function cross(a:Point,b:Point,c:Point) { return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]); }
function polygon(value:unknown):Point[] {
  if(!Array.isArray(value)||value.length<3||value.length>32)throw new Error('마스크 꼭짓점은 3~32개여야 해.');
  const p=value.map(point); let area=0;
  for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length]; area+=a[0]*b[1]-a[1]*b[0];
    if(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-6)throw new Error('중복된 마스크 꼭짓점이야.');
    for(let j=i+2;j<p.length;j++){
      if(i===0&&j===p.length-1)continue;
      const c=p[j],d=p[(j+1)%p.length];
      if(cross(a,b,c)*cross(a,b,d)<=0 && cross(c,d,a)*cross(c,d,b)<=0 && Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0])) && Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1])))throw new Error('교차하는 마스크는 사용할 수 없어.');
    }
  }
  if(Math.abs(area)<1e-7)throw new Error('마스크 면적이 너무 작아.');
  return p;
}
export function parseProject(text:string):LabProject {
  if(typeof text!=='string'||text.length>MAX_PROJECT_BYTES)throw new Error('프로젝트 크기 size 제한은 40MB야.');
  const p=record(JSON.parse(text));
  if(p.format!=='image-standrig-project'||p.version!==1||!['manual','supplied-front'].includes(p.preset as string))throw new Error('Image Lab 프로젝트 JSON v1이 아니야. 네이티브 .srig는 별도 StandRig에서 열어 줘.');
  const a=record(p.anchors); const headPivot=point(a.headPivot),headRadius=point(a.headRadius),bodyPivot=point(a.bodyPivot);
  if(headRadius.some(x=>x<.01)||typeof a.headJoin!=='number'||!Number.isFinite(a.headJoin)||a.headJoin<=headPivot[1]||a.headJoin>1)throw new Error('머리 범위 / 목 연결 위치를 확인해 줘.');
  if(!Array.isArray(p.parts)||p.parts.length!==8)throw new Error('8개 역할 마스크가 필요해.');
  const seen=new Set<string>();
  const parts=p.parts.map(v=>{const r=record(v);const id=r.id as Role;
    if(!ROLES.includes(id)||seen.has(id))throw new Error('잘못되거나 중복된 역할이야.');seen.add(id);
    return {id,polygon:polygon(r.polygon),order:Math.round(finite(r.order,-50,50)),...(r.placement===undefined?{}:{placement:placement(r.placement)}),...(r.replacement===undefined?{}:{replacement:localImage(r.replacement)})};});
  const values=record(p.params); const params=Object.fromEntries(PARAMS.map(d=>[d.id,finite(d.id==='ParamMouthForm'&&values[d.id]===undefined?0:values[d.id],d.min,d.max)]));
  return {format:'image-standrig-project',version:1,preset:p.preset as LabProject['preset'],source:localImage(p.source),parts,settings:normalizeSettings(p.settings),params,anchors:{headPivot,headRadius,headJoin:a.headJoin,bodyPivot}};
}
export function serializeProject(project:LabProject):string { return JSON.stringify(parseProject(JSON.stringify(project))); }
export function replaceSource(project:LabProject,source:LocalImage):LabProject { return {...structuredClone(project),preset:'manual',source:localImage(source)}; }
export function chromaKey(pixels:Uint8ClampedArray,settings:Partial<LabSettings>):Uint8ClampedArray {
  const result=new Uint8ClampedArray(pixels); if(!settings.keyEnabled)return result;
  const key=settings.keyColor??[252,2,250]; const tolerance=settings.tolerance??65,softness=settings.softness??65;
  const minKey=Math.min(...key);
  for(let i=0;i<result.length;i+=4){
    const distance=Math.hypot(pixels[i]-key[0],pixels[i+1]-key[1],pixels[i+2]-key[2]);
    const alpha=clamp((distance-tolerance)/Math.max(1,softness),0,1);
    result[i+3]=pixels[i+3]*alpha;
    if(alpha>0&&alpha<1)for(let c=0;c<3;c++) result[i+c]=clamp((pixels[i+c]-key[c]*(1-alpha))/alpha,0,255);
    // Despill is limited to partially-keyed edges; interior character colors are untouched.
    if(alpha>0&&alpha<1)for(let c=0;c<3;c++) if(key[c]>minKey+80)result[i+c]*=.85+.15*alpha;
  }
  return result;
}
export function insidePolygon(x:number,y:number,p:Point[]):boolean {
  let inside=false;
  for(let i=0,j=p.length-1;i<p.length;j=i++){
    const a=p[j],b=p[i];
    if(Math.abs(cross(a,b,[x,y]))<1e-10&&x>=Math.min(a[0],b[0])&&x<=Math.max(a[0],b[0])&&y>=Math.min(a[1],b[1])&&y<=Math.max(a[1],b[1]))return true;
    if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }return inside;
}
export interface PixelLayer {id:Role;pixels:Uint8ClampedArray}
export function partitionImage(pixels:Uint8ClampedArray,width:number,height:number,parts:PartRegion[],overlap:number,sampleMint=false):PixelLayer[] {
  const sorted=[...parts].sort((a,b)=>b.order-a.order); const layers=parts.map(p=>({id:p.id,pixels:new Uint8ClampedArray(pixels.length)}));
  const byId=new Map(layers.map(l=>[l.id,l]));const owner=new Int8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const pixel=(y*width+x)*4;
    const mint=pixels[pixel+1]>pixels[pixel]+20&&pixels[pixel+2]>pixels[pixel]+15&&pixels[pixel+1]>65;
    const region=sorted.find(p=>p.id!=='body'&&(!sampleMint||!p.id.startsWith('hair')||mint)&&insidePolygon((x+.5)/width,(y+.5)/height,p.polygon))??parts.find(p=>p.id==='body')!;
    const n=y*width+x,i=n*4;owner[n]=parts.indexOf(region);
    byId.get(region.id)!.pixels.set(pixels.subarray(i,i+4),i);
  }
  // Feature skin underlays are independent of optional boundary bleed.
  // Copy a narrow source-art bleed under neighboring partitions; never extend background alpha.
  const radius=Math.round(clamp(overlap,0,12));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const n=y*width+x,i=n*4; if(pixels[i+3]===0)continue;
    const id=parts[owner[n]].id;if(id.startsWith('eye')||id==='mouth')continue;
    for(const [dx,dy] of [[-radius,0],[radius,0],[0,-radius],[0,radius]]){
      const xx=clamp(x+dx,0,width-1),yy=clamp(y+dy,0,height-1),target=owner[yy*width+xx];
      if(target===owner[n])continue;
      const part=parts[target];if(part.id.startsWith('eye')||part.id==='mouth'||part.order>=parts[owner[n]].order)continue;
      layers[target].pixels.set(pixels.subarray(i,i+4),i);
    }
  }
  // Feature removal leaves a sampled-skin underlay, not the old eyes/mouth behind the new ones.
  for(const feature of parts.filter(p=>p.id.startsWith('eye')||p.id==='mouth')){
    const box=regionBounds(feature.polygon,width,height); const head=byId.get('head')!.pixels;
    for(let y=box.y;y<box.y+box.height;y++)for(let x=box.x;x<box.x+box.width;x++){
      if(!insidePolygon((x+.5)/width,(y+.5)/height,feature.polygon))continue;
      const i=(y*width+x)*4; const sy=clamp(box.y+box.height+2,0,height-1),sample=(sy*width+x)*4;
      if(feature.id==='mouth'){
        // Sampling below the box copied the dark jaw into the entire patch.
        // Reconstruct from same-row skin on either side, never from the chin.
        const left=(y*width+clamp(box.x-2,0,width-1))*4,right=(y*width+clamp(box.x+box.width+1,0,width-1))*4;
        const t=(x-box.x+.5)/box.width;
        for(let c=0;c<4;c++)head[i+c]=pixels[left+c]*(1-t)+pixels[right+c]*t;
      }else if(sampleMint){
        const u=(x+.5-box.x)/box.width,v=(y+.5-box.y)/box.height;
        const radius=Math.hypot((u-.5)*2,(v-.5)*2);
        const fade=clamp((1-radius)/.3,0,1),weight=fade*fade*(3-2*fade);
        for(let c=0;c<4;c++)head[i+c]=pixels[i+c]*(1-weight)+pixels[sample+c]*weight;
      }else head.set(pixels.subarray(sample,sample+4),i);
    }
  }
  return layers;
}
export function regionBounds(polygon:Point[],width:number,height:number) {
  const xs=polygon.map(p=>p[0]*width),ys=polygon.map(p=>p[1]*height);
  const x=clamp(Math.floor(Math.min(...xs)),0,width-1),y=clamp(Math.floor(Math.min(...ys)),0,height-1);
  return {x,y,width:Math.max(1,Math.min(width,Math.ceil(Math.max(...xs)))-x),height:Math.max(1,Math.min(height,Math.ceil(Math.max(...ys)))-y)};
}
// Full-stage PNG exports include bleed outside the editable polygon. Preserve it on reimport.
export function replacePart(part:PartRegion,replacement?:LocalImage):PartRegion {
 return {...part,replacement,placement:undefined};
}
export function replacementPlacement(image:{width:number;height:number},polygon:Point[],width:number,height:number,transform?:Placement,sourceCanvas?:{width:number;height:number}) {
 const fullCanvas=(image.width===width&&image.height===height)||(sourceCanvas!==undefined&&image.width===sourceCanvas.width&&image.height===sourceCanvas.height);
 const base=fullCanvas?{x:0,y:0,width,height,clip:false}:{...regionBounds(polygon,width,height),clip:true};
 if(!transform)return base;
 const t=placement(transform);
 return {...base,x:base.x+t.x*width-base.width*(t.scale-1)/2,y:base.y+t.y*height-base.height*(t.scale-1)/2,width:base.width*t.scale,height:base.height*t.scale};
}
export function needsLabRender(playing:boolean,previous:string,current:string){return playing||previous!==current;}
