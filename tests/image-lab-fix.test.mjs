import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../scripts/register-loader.mjs';
const core=await import('../apps/preview/src/imageLabCore.ts');
const {buildImageRig}=await import('../apps/preview/src/imageLabRig.ts');
import {validateRig} from '@standrig/core/inspect';
import {resolveRigFrame,identityMatrix} from '@standrig/core/evaluator';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/QAAAABJRU5ErkJggg==';
const source={name:'test',data:png,width:1,height:1};
const project=()=>core.createProject(source,true);
const rig=()=>buildImageRig(project(),Object.fromEntries(core.ROLES.map(id=>[id,png])),600,900);
test('sample hair mask excludes navy/skin/white inside hair polygon and preserves mint alpha',()=>{
 const parts=project().parts;parts.forEach(p=>p.order=p.id==='hair-left'?50:0);
 parts.find(p=>p.id==='hair-left').polygon=[[0,0],[1,0],[1,1],[0,1]];
 const pixels=new Uint8ClampedArray([90,190,175,128,20,30,50,255,244,213,197,255,240,240,240,255]);
 const layers=core.partitionImage(pixels,4,1,parts,0,true);
 assert.deepEqual([...layers.find(p=>p.id==='hair-left').pixels],[90,190,175,128,0,0,0,0,0,0,0,0,0,0,0,0]);
 const manual=core.partitionImage(pixels,4,1,parts,0,false);
 assert.deepEqual(manual.find(p=>p.id==='hair-left').pixels,pixels);
});
test('source replacement disables sample-specific classification',()=>assert.equal(core.replaceSource(project(),source).preset,'manual'));
test('full-stage exported part maps back to stage without polygon recrop or shrink',()=>{
 const polygon=project().parts.find(p=>p.id==='head').polygon;
 assert.deepEqual(core.replacementPlacement({width:600,height:900},polygon,600,900),{x:0,y:0,width:600,height:900,clip:false});
 assert.deepEqual(core.replacementPlacement({width:120,height:140},polygon,600,900),{...core.regionBounds(polygon,600,900),clip:true});
});
test('native rig passes actual core validator',()=>{const result=validateRig(rig());assert.equal(result.ok,true,JSON.stringify(result));});
test('compound extremes preserve common head/body ancestry with a hair-only extra field',()=>{
 const r=rig();for(const sign of [-1,1]){
 const frame=resolveRigFrame(r,{ParamAngleX:12*sign,ParamAngleY:8*sign,ParamAngleZ:8*sign},identityMatrix(),{physics:false});
 const head=frame.parts.get('head');
 for(const id of ['body','hair-back','hair-left','hair-right']){
 const part=frame.parts.get(id);assert.deepEqual(part.matrix,head.matrix,id+' transform separates');
 const isHair=id.startsWith('hair-');
 assert.equal(part.sharedWarps.length,head.sharedWarps.length+(isHair?1:0));
 assert.deepEqual(part.sharedWarps.slice(0,head.sharedWarps.length),head.sharedWarps,id+' common ancestry differs');
 if(isHair)assert.equal(r.parts.find(p=>p.id===id).deformerId,'hair-field');
 assert.deepEqual(part.warp,head.warp,id+' local warp differs');
 }
 assert.ok(head.sharedWarps?.length,'missing continuous head field');
 }
});
test('paused frames do not step physics; manual edits request one redraw',()=>{
 assert.equal(core.needsLabRender(false,'same','same'),false);
 assert.equal(core.needsLabRender(true,'same','same'),true);
 assert.equal(core.needsLabRender(false,'old','new'),true);
});
