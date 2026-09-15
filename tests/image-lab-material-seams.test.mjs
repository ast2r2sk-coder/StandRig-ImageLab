import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../scripts/register-loader.mjs';
const core=await import('../apps/preview/src/imageLabCore.ts');
const {extractMaterialTextures}=await import('../apps/preview/src/imageLabMaterials.ts');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/QAAAABJRU5ErkJggg==';
const project=()=>core.createProject({name:'test',data:png,width:1,height:1},true);
test('mouth stays centered at original smile with skin margin above chin',()=>{
 const b=core.regionBounds(project().parts.find(p=>p.id==='mouth').polygon,1024,1536);
 assert.ok(b.height<=20,'mouth crop must not extend to chin');assert.ok(b.y+b.height<=202);
 assert.ok(Math.abs(b.x+b.width/2-511)<=1);assert.ok(Math.abs(b.y+b.height/2-190)<=1);
});
test('mouth underlay uses lateral skin rather than copying jaw below bounding box',()=>{
 const p=project(),w=1024,h=1536,pixels=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<pixels.length;i+=4)pixels.set([245,216,194,255],i);
 const b=core.regionBounds(p.parts.find(p=>p.id==='mouth').polygon,w,h);
 for(let x=b.x;x<b.x+b.width;x++)pixels.set([42,30,25,255],((b.y+b.height+2)*w+x)*4);
 const layers=core.partitionImage(pixels,w,h,p.parts,0,true),head=layers.find(p=>p.id==='head').pixels;
 const i=(190*w+511)*4;assert.deepEqual([...head.slice(i,i+4)],[245,216,194,255]);
});
test('eye underlay preserves original hair in mask corners instead of filling peach rectangles',()=>{
 const p=project(),w=1024,h=1536,pixels=new Uint8ClampedArray(w*h*4);for(let i=0;i<pixels.length;i+=4)pixels.set([245,216,194,255],i);
 const b=core.regionBounds(p.parts.find(p=>p.id==='eye-left').polygon,w,h),i=((b.y+2)*w+b.x+2)*4;pixels.set([80,180,160,255],i);
 const head=core.partitionImage(pixels,w,h,p.parts,0,true).find(p=>p.id==='head').pixels;
 assert.deepEqual([...head.slice(i,i+4)],[80,180,160,255]);
});
test('expression patches feather inside curved boundary, not broad opaque skin rectangles',()=>{
 const p=project(),pixels=new Uint8ClampedArray(1280*853*4);for(let i=0;i<pixels.length;i+=4)pixels.set([245,216,194,255],i);
 const out=extractMaterialTextures(pixels,1280,853,p,1024,1536);
 for(const id of ['eye-left-half','eye-right-closed','mouth-A']){
  const role=id.startsWith('mouth')?'mouth':id.startsWith('eye-left')?'eye-left':'eye-right';
  const b=core.regionBounds(p.parts.find(p=>p.id===role).polygon,1024,1536);
  assert.equal(out[id][((b.y+2)*1024+b.x+2)*4+3],0,'inner corner must be transparent: '+id);
 }
});
