import {insidePolygon,regionBounds,type LabProject} from './imageLabCore';

/** Coordinates are manually registered against the supplied 1280x853 sheet.
 * Patches retain actual drawn skin/eyelashes/cavities, not synthetic expressions.
 * Destinations follow editable part masks; the original neutral art is retained.
 */
export const MATERIAL_CROPS = {
 'eye-left-half': {role:'eye-left',box:[555,163,74,42]},
 'eye-right-half': {role:'eye-right',box:[650,163,74,42]},
 'eye-left-closed': {role:'eye-left',box:[982,163,74,42]},
 'eye-right-closed': {role:'eye-right',box:[1077,163,74,42]},
 'mouth-A': {role:'mouth',box:[176,650,74,47]},
 'mouth-E': {role:'mouth',box:[603,650,74,47]},
 'mouth-O': {role:'mouth',box:[1030,650,74,47]},
} as const;
export type MaterialId=keyof typeof MATERIAL_CROPS;
export type MaterialImages=Partial<Record<MaterialId,string>>;
export function extractMaterialTextures(pixels:Uint8ClampedArray,sw:number,sh:number,project:LabProject,width:number,height:number):Partial<Record<MaterialId,Uint8ClampedArray>> {
 if(![sw,sh,width,height].every(v=>Number.isInteger(v)&&v>0&&v<=4096)||pixels.length!==sw*sh*4)throw Error('Invalid material raster dimensions');
 const result:Partial<Record<MaterialId,Uint8ClampedArray>>={};
 if(project.preset!=='supplied-front')return result;
 for(const [id,crop] of Object.entries(MATERIAL_CROPS)){
  const part=project.parts.find(p=>p.id===crop.role)!;if(part.replacement)continue;
  const b=regionBounds(part.polygon,width,height),out=new Uint8ClampedArray(width*height*4);
  const [sx,sy,cw,ch]=crop.box;
  for(let y=b.y;y<b.y+b.height;y++)for(let x=b.x;x<b.x+b.width;x++){
   if(!insidePolygon((x+.5)/width,(y+.5)/height,part.polygon))continue;
   const u=(x+.5-b.x)/b.width,v=(y+.5-b.y)/b.height;
   const xx=Math.min(sw-1,Math.max(0,Math.floor((sx+u*cw)/1280*sw))),yy=Math.min(sh-1,Math.max(0,Math.floor((sy+v*ch)/853*sh)));
   const from=(yy*sw+xx)*4,to=(y*width+x)*4;out.set(pixels.subarray(from,from+4),to);
   // Rounded interior feather removes peach rectangle corners, while the
   // central eyelashes/cavity remain opaque. No extension beyond the mask.
   const radius=Math.hypot((u-.5)*2,(v-.5)*2);
   const fade=Math.max(0,Math.min(1,(1-radius)/.3));
   out[to+3]*=fade*fade*(3-2*fade);
  }
  result[id as MaterialId]=out;
 }
 return result;
}

/** Reference-informed 2D approximation, not reconstructed 3D or measured degrees.
 * The supplied grid shows far-side eye compression and a shorter lower face on
 * down-pitch. These authored differential offsets supplement the native field.
 * Positive yaw is screen-right; positive pitch is down. Neutral is identity.
 */
export function referenceHeadOffset(x:number,y:number,yaw:number,pitch:number):[number,number] {
 const nx=(x-511/1024)/(.12),ny=(y-143/1536)/.065;
 const support=Math.max(0,1-Math.abs(nx)/1.5)*Math.max(0,1-Math.abs(ny)/1.8);
 const turn=Math.max(-1,Math.min(1,yaw/12)),tilt=Math.max(-1,Math.min(1,pitch/8));
 return [support*(turn*.0035-Math.abs(turn)*nx*.005),support*(tilt*.003-Math.abs(tilt)*ny*.003)];
}
