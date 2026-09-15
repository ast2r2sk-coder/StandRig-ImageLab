import type {RigDocument,RigDeformer,RigSharedWarpControlPoint,RigWarpPinBinding,Transform2D} from '@standrig/core/types';
import {PARAMS,LABELS,type LabProject,type Role} from './imageLabCore';
import {MATERIAL_CROPS,referenceHeadOffset,type MaterialImages,type MaterialId} from './imageLabMaterials';
import type {ParameterBinding} from '@standrig/core/types';
const transform=():Transform2D=>({x:0,y:0,rotation:0,scaleX:1,scaleY:1,pivotX:0,pivotY:0,opacity:1});
const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
function key(parameter:string,property:'offsetX'|'offsetY',range:number,negative:number,positive:number):RigWarpPinBinding{return {parameter,property,additive:true,keys:[{input:-range,value:negative},{input:0,value:0},{input:range,value:positive}]};}
/** All partitions share a continuous stage-space field: no independently rotating cutout seams. */
export function buildImageRig(project:LabProject,images:Record<Role,string>,width:number,height:number,materials:MaterialImages={}):RigDocument {
 const field=(id:string,parentId:string|null,fraction:number,bindings:(x:number,y:number)=>RigWarpPinBinding[]):RigDeformer=>{
  const points:RigSharedWarpControlPoint[]=[];for(let row=0;row<=16;row++)for(let column=0;column<=16;column++)points.push({id:`${id}-${column}-${row}`,row,column,offsetX:0,offsetY:0,bindings:bindings(column/16,row/16*fraction)});
  return {id,name:id,kind:'warp',parentId,visible:true,origin:{x:0,y:0},transform:transform(),sharedWarp:{version:1,enabled:true,bounds:{left:0,top:0,width,height:height*fraction},grid:{columns:16,rows:16},controlPoints:points}};
 };
 const [hx,hy]=project.anchors.headPivot,[bx,by]=project.anchors.bodyPivot;
 const body=field('body-rig',null,1,(x,y)=>{
  const w=smooth((.98-y)/.22),dx=(x-bx)*width,dy=(y-by)*height,a=4*Math.PI/180;
  return [key('ParamBodyAngleX','offsetX',6,(-dx*.012-width*.012)*w,(-dx*.012+width*.012)*w),key('ParamBodyAngleY','offsetY',4,-dy*.025*w,dy*.025*w),key('ParamBodyAngleZ','offsetX',4,((Math.cos(a)-1)*dx+Math.sin(a)*dy)*w,((Math.cos(a)-1)*dx-Math.sin(a)*dy)*w),key('ParamBodyAngleZ','offsetY',4,(-Math.sin(a)*dx+(Math.cos(a)-1)*dy)*w,(Math.sin(a)*dx+(Math.cos(a)-1)*dy)*w)];
 });
 const head=field('head-rig','body-rig',project.anchors.headJoin,(x,y)=>{
  const w=1-smooth((y-hy)/(project.anchors.headJoin-hy)),dx=(x-hx)*width,dy=(y-hy)*height,a=8*Math.PI/180;
  const depth=width*.07*Math.sqrt(Math.max(0,1-((x-hx)/.14)**2));
  return [key('ParamAngleX','offsetX',12,((Math.cos(Math.PI/15)-1)*dx-Math.sin(Math.PI/15)*depth)*w,((Math.cos(Math.PI/15)-1)*dx+Math.sin(Math.PI/15)*depth)*w),key('ParamAngleY','offsetY',8,(-dy*.025-height*.006)*w,(-dy*.025+height*.006)*w),key('ParamAngleZ','offsetX',8,((Math.cos(a)-1)*dx+Math.sin(a)*dy)*w,((Math.cos(a)-1)*dx-Math.sin(a)*dy)*w),key('ParamAngleZ','offsetY',8,(-Math.sin(a)*dx+(Math.cos(a)-1)*dy)*w,(Math.sin(a)*dx+(Math.cos(a)-1)*dy)*w)];
 });
 const hair=field('hair-field','head-rig',.45,(x,y)=>{
  const lateral=smooth((Math.abs(x-hx)-.09)/.10),vertical=smooth((y-.10)/.16)*(1-smooth((y-.35)/.10));
  const amount=Math.min(1,width*.012)*lateral*vertical;
  return [key('ParamHairSway','offsetX',4,-amount,amount)];
 });
 const rig:RigDocument={schemaVersion:'0.1.0',name:'Image Lab / continuous-field draft',stage:{width,height,background:'transparent'},parameters:[...PARAMS.map(p=>({...p})),{id:'ParamHairDrive',label:'Hair spring input only',min:-4,max:4,default:0},{id:'ParamHairSway',label:'Hair spring',min:-4,max:4,default:0}],deformers:[body,head,hair],
 assets:project.parts.map(p=>({id:p.id,name:LABELS[p.id],type:'image',width,height,src:images[p.id]})),
 parts:project.parts.map(p=>{const t=transform();const bindings=[];
 if(p.id.startsWith('eye')||p.id==='mouth'){
 const xs=p.polygon.map(v=>v[0]),ys=p.polygon.map(v=>v[1]);t.pivotX=(Math.min(...xs)+Math.max(...xs))/2;t.pivotY=(Math.min(...ys)+Math.max(...ys))/2;t.x=t.pivotX*width;t.y=t.pivotY*height;
 bindings.push({parameter:p.id==='mouth'?'ParamMouthOpen':p.id==='eye-left'?'ParamEyeLOpen':'ParamEyeROpen',property:'scaleY' as const,additive:false,keys:p.id==='mouth'?[{input:0,value:1},{input:1,value:2}]:[{input:0,value:.04},{input:1,value:1}]});}
 return {id:p.id,name:LABELS[p.id],kind:'image' as const,assetId:p.id,parentId:null,deformerId:p.id.startsWith('hair-')?'hair-field':'head-rig',visible:true,drawOrder:p.order,transform:t,bindings};}),
 physics:{enabled:project.settings.physicsEnabled,chains:[{id:'hair-spring',name:'Continuous hair spring',enabled:true,targetPartIds:[],sourceParameters:[{parameter:'ParamHairDrive',scale:1}],stiffness:project.settings.stiffness,damping:project.settings.damping,mass:1,gravity:0,wind:0,output:{property:'rotation',scale:0},parameterOutput:{parameter:'ParamHairSway',scale:1,min:-4,max:4},segments:[{id:'tip',length:1,delay:.06,damping:1}]}]}};
 if(project.preset==='supplied-front'){
  for(const p of head.sharedWarp!.controlPoints){
   const x=p.column/16,y=p.row/16*project.anchors.headJoin;
   p.bindings!.push(key('ParamAngleX','offsetX',12,referenceHeadOffset(x,y,-12,0)[0]*width,referenceHeadOffset(x,y,12,0)[0]*width),key('ParamAngleY','offsetY',8,referenceHeadOffset(x,y,0,-8)[1]*height,referenceHeadOffset(x,y,0,8)[1]*height));
  }
  const opacity=(parameter:string,values:[number,number][]):ParameterBinding=>({parameter,property:'opacity',additive:false,composition:'multiply',keys:values.map(([input,value])=>({input,value}))});
  for(const role of ['eye-left','eye-right','mouth'] as const){
   const region=project.parts.find(p=>p.id===role)!;
   const entries=Object.entries(MATERIAL_CROPS).filter(([,c])=>c.role===role);
   if(region.replacement||!entries.every(([id])=>materials[id as MaterialId]))continue;
   const base=rig.parts.find(p=>p.id===role)!;base.transform=transform();
   const parameter=role==='mouth'?'ParamMouthOpen':role==='eye-left'?'ParamEyeLOpen':'ParamEyeROpen';
   base.bindings=[opacity(parameter,role==='mouth'?[[0,1],[1,0]]:[[0,0],[.5,0],[1,1]])];
   for(const [id] of entries){
    const bindings=role==='mouth'?[opacity(parameter,[[0,0],[1,1]]),opacity('ParamMouthForm',[[-1,id==='mouth-E'?1:0],[0,id==='mouth-A'?1:0],[1,id==='mouth-O'?1:0]])]:[opacity(parameter,[[0,id.endsWith('closed')?1:0],[.5,id.endsWith('half')?1:0],[1,0]])];
    rig.assets.push({id,name:id,type:'image',width,height,src:materials[id as MaterialId]!});
    rig.parts.push({id,name:id,kind:'image',assetId:id,parentId:null,deformerId:'head-rig',visible:true,drawOrder:region.order,transform:transform(),bindings});
   }
  }
 }
 return rig;
}
