import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import '../scripts/register-loader.mjs';
const core=await import('../apps/preview/src/imageLabCore.ts');
const {buildImageRig}=await import('../apps/preview/src/imageLabRig.ts');
import {resolveRigFrame,identityMatrix} from '@standrig/core/evaluator';
import {validateRig} from '@standrig/core/inspect';
const url=new URL('../apps/preview/src/imageLabMaterials.ts',import.meta.url);
const material=existsSync(url)?await import(url):{};
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/QAAAABJRU5ErkJggg==';
const source={name:'test',data:png,width:1,height:1};
const project=()=>core.createProject(source,true);
const images=Object.fromEntries(core.ROLES.map(id=>[id,png]));
const states=Object.fromEntries(['eye-left-half','eye-left-closed','eye-right-half','eye-right-closed','mouth-A','mouth-E','mouth-O'].map(id=>[id,png]));
const rig=(p=project())=>buildImageRig(p,images,600,900,states);
const frame=(r,params)=>resolveRigFrame(r,{...project().params,...params},identityMatrix(),{physics:false});
test('real texture states replace squash while left/right eyes remain independent in native evaluator',()=>{
 const r=rig(),f=frame(r,{ParamEyeLOpen:0,ParamEyeROpen:.5});
 assert.ok(f.parts.has('eye-left-closed'),'missing extracted closed-eye native part');
 assert.equal(f.parts.get('eye-left-closed').opacity,1);
 assert.equal(f.parts.get('eye-right-half').opacity,1);
 assert.equal(f.parts.get('eye-left').opacity,0);
 assert.equal(f.parts.get('eye-right').opacity,0);
 assert.equal(f.parts.get('eye-left-closed').pose.scaleY,1);
 for(const value of [0,.2,.5,.7,1]){const s=frame(r,{ParamEyeLOpen:value});assert.ok(Math.abs(['eye-left','eye-left-half','eye-left-closed'].reduce((a,id)=>a+s.parts.get(id).opacity,0)-1)<1e-9);}
});
test('A E O cavities use independent mouth-form and openness and survive native JSON serialization',()=>{
 const r=JSON.parse(JSON.stringify(rig()));assert.equal(validateRig(r).ok,true);
 for(const [form,id] of [[-1,'E'],[0,'A'],[1,'O']]){
  const f=frame(r,{ParamMouthOpen:1,ParamMouthForm:form});assert.ok(f.parts.has('mouth-'+id),'missing mouth texture');
  assert.equal(f.parts.get('mouth-'+id).opacity,1);assert.equal(f.parts.get('mouth').opacity,0);
  assert.equal(frame(r,{ParamMouthOpen:0,ParamMouthForm:form}).parts.get('mouth-'+id).opacity,0);
 }
 assert.ok(r.assets.every(a=>a.src.startsWith('data:image/png;base64,')));
});
test('source and per-part replacements suppress sample overlays, preserving manual native behavior',()=>{
 assert.equal(rig(core.replaceSource(project(),source)).parts.length,8);
 const p=project();p.parts.find(p=>p.id==='eye-left').replacement=source;
 const r=rig(p);assert.ok(!r.parts.some(p=>p.id==='eye-left-closed'));assert.ok(r.parts.some(p=>p.id==='eye-right-closed'));
});
test('legacy project loads mouth form default and new form roundtrips',()=>{
 const p=project();delete p.params.ParamMouthForm;const loaded=core.parseProject(JSON.stringify(p));assert.equal(loaded.params.ParamMouthForm,0);
 loaded.params.ParamMouthForm=1;assert.equal(core.parseProject(core.serializeProject(loaded)).params.ParamMouthForm,1);
});
test('extraction samples supplied sheet pixels into full-stage registered patches, never mutates source',()=>{
 assert.equal(typeof material.extractMaterialTextures,'function');
 const pixels=new Uint8ClampedArray(1280*853*4);for(let i=0;i<pixels.length;i+=4)pixels.set([71,92,113,255],i);
 const result=material.extractMaterialTextures(pixels,1280,853,project(),600,900);
 assert.equal(Object.keys(result).length,7);
 const p=result['eye-left-closed'];assert.equal(p.length,600*900*4);assert.equal(p[3],0);
 const center=(Math.round(143/1536*900)*600+Math.round(477/1024*600))*4;
 assert.deepEqual([...p.slice(center,center+4)],[71,92,113,255]);
 assert.deepEqual([...pixels.slice(0,4)],[71,92,113,255]);
 assert.deepEqual(material.extractMaterialTextures(pixels,1280,853,core.replaceSource(project(),source),600,900),{});
 assert.throws(()=>material.extractMaterialTextures(new Uint8ClampedArray(4),1280,853,project(),600,900));
});
test('reference landmarks change native shared deformation, stay neutral at zero and vanish for manual sources',()=>{
 assert.equal(typeof material.referenceHeadOffset,'function');
 assert.deepEqual(material.referenceHeadOffset(.5,.1,0,0),[0,0]);
 const left=material.referenceHeadOffset(477/1024,143/1536,-12,0),right=material.referenceHeadOffset(544/1024,143/1536,-12,0);
 assert.notEqual(left[0],right[0],'yaw must change perspective, not translate the face');
 const p=project(),r=rig(p),manual=rig(core.replaceSource(p,source));
 assert.notDeepEqual(frame(r,{ParamAngleX:12}).parts.get('head').sharedWarps,frame(manual,{ParamAngleX:12}).parts.get('head').sharedWarps);
});
test('supplied face regions cover actual original eyes and mouth, not nose or opposite-eye gap',()=>{
 const p=project();for(const [id,x,y] of [['eye-left',477,143],['eye-right',544,143],['mouth',511,190]])assert.ok(core.insidePolygon(x/1024,y/1536,p.parts.find(p=>p.id===id).polygon));
 assert.ok(!core.insidePolygon(511/1024,171/1536,p.parts.find(p=>p.id==='mouth').polygon));
});
test('all newly supplied source bytes are versioned and SHA256 pinned',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../assets/character/source-manifest.json',import.meta.url)));
 for(const file of ['head-reference.jpg','expression-sheet.jpg','head-underlay.jpg','body-underlay.jpg']){
  const entry=manifest.sources.find(s=>s.file===file);assert.ok(entry,'missing pinned '+file);
  assert.equal(createHash('sha256').update(readFileSync(new URL('../assets/character/'+file,import.meta.url))).digest('hex'),entry.sha256);
 }
});
