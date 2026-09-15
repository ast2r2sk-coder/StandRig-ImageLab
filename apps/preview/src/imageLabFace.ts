type Result={faceLandmarks:{x:number;y:number;z:number}[][];faceBlendshapes?:{categories:{categoryName:string;score:number}[]}[]};
export type FacePose={tracked:boolean;left:number;right:number;mouth:number;x:number;y:number;rotation:number};
const neutral=():FacePose=>({tracked:false,left:1,right:1,mouth:0,x:0,y:0,rotation:0});
const clamp=(n:number,min:number,max:number)=>Number.isFinite(n)?Math.max(min,Math.min(max,n)):0;
export function createFaceMapper(){
 let origin:{x:number;y:number;roll:number}|undefined,prior=neutral();
 return {calibrate(){origin=undefined;prior=neutral();},map(r:Result):FacePose{
  const points=r.faceLandmarks[0],nose=points?.[1],a=points?.[33],b=points?.[263];
  if(!nose||!a||!b||![nose.x,nose.y,a.x,a.y,b.x,b.y].every(Number.isFinite)){prior=neutral();return prior;}
  const roll=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
  origin??={x:nose.x,y:nose.y,roll};
  const scores=Object.fromEntries((r.faceBlendshapes?.[0]?.categories??[]).map(c=>[c.categoryName,c.score]));
  const target:FacePose={tracked:true,left:1-clamp(scores.eyeBlinkLeft??0,0,1),right:1-clamp(scores.eyeBlinkRight??0,0,1),mouth:clamp(scores.jawOpen??0,0,1),x:clamp(-(nose.x-origin.x)*100,-24,24),y:clamp((nose.y-origin.y)*100,-18,18),rotation:clamp(-(roll-origin.roll),-8,8)};
  for(const key of ['left','right','mouth','x','y','rotation'] as const)target[key]=prior[key]+.55*(target[key]-prior[key]);
  prior=target;return target;
 }};
}
export function applyFace(params:Record<string,number>,face:FacePose,mouthOwned:boolean){
 const out={...params};out.ParamEyeLOpen=face.left;out.ParamEyeROpen=face.right;
 if(!mouthOwned)out.ParamMouthOpen=face.mouth;
 return out;
}
