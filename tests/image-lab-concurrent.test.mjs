import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../scripts/register-loader.mjs';
import {resolveRigFrame,identityMatrix} from '@standrig/core/evaluator';
const {projectSharedWarpPoint}=await import('../packages/core/dist/sharedWarpProjection.js');
const {composeLabMotion,labRigidMotion,createGentlePose}=await import('../apps/preview/src/imageLabSpeechPose.ts');
const {buildImageRig}=await import('../apps/preview/src/imageLabRig.ts');
const {createProject,ROLES}=await import('../apps/preview/src/imageLabCore.ts');
const baseline={ParamAngleX:2,ParamAngleY:1,ParamAngleZ:1,ParamBodyAngleZ:0,ParamEyeLOpen:1,ParamEyeROpen:.8,ParamMouthOpen:.3};
test('automatic speech/play never adds angle warps or mutates baseline; eyes and mouth coexist',()=>{
 const base={...baseline},frames=Array.from({length:601},(_,i)=>composeLabMotion(base,{seconds:i/100,active:true,mouth:.6}));
 assert.ok(frames.some(f=>f.ParamEyeLOpen<.1));
 for(const f of frames){for(const id of Object.keys(base).filter(id=>id.includes('Angle')))assert.equal(f[id],base[id]);assert.equal(f.ParamMouthOpen,.6);}
 assert.deepEqual(base,baseline);assert.deepEqual(composeLabMotion(base,{seconds:6,active:false}),base);
 const transforms=Array.from({length:100},(_,i)=>labRigidMotion(i/20,true));assert.ok(transforms.some(f=>Math.abs(f.rotation)>.3));
 for(const t of transforms){assert.ok(Math.abs(t.rotation)<=.6);assert.ok(Math.abs(t.x)<=1.5);assert.ok(Math.abs(t.y)<=1);}
});
test('all poses only move rigid stage; replay is continuous and returns to identity',()=>{
 for(const kind of ['bow','nod','tilt']){const p=createGentlePose();p.start(kind);const a=p.tick(.7);assert.ok(Math.abs(a.rotation)>1);assert.deepEqual(Object.keys(a).sort(),['rotation','x','y']);p.start(kind);assert.deepEqual(p.tick(0),a);assert.equal(p.progress,0);assert.deepEqual(p.tick(5),{x:0,y:0,rotation:0});assert.equal(p.active,false);}
});
test('hair springs cannot deform face/body or expression meshes',()=>{
 const project=createProject({name:'test',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',width:1,height:1},true);
 const rig=buildImageRig(project,Object.fromEntries(ROLES.map(r=>[r,'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='])),600,900);
 for(const p of rig.parts)assert.equal(p.deformerId,p.id.startsWith('hair-')?'hair-field':'head-rig');
 assert.equal(rig.physics.chains[0].parameterOutput.parameter,'ParamHairSway');
 assert.deepEqual(rig.physics.chains[0].sourceParameters,[{parameter:'ParamHairDrive',scale:1}]);
 const base=rig.parameters.reduce((v,p)=>(v[p.id]=p.default,v),{});
 const mesh=(frame,id)=>{const p=frame.parts.get(id);return Array.from({length:289},(_,i)=>projectSharedWarpPoint({x:(i%17)*600/16,y:Math.floor(i/17)*900/16},p.matrix,identityMatrix(),p.sharedWarps));};
 const rest=resolveRigFrame(rig,base,identityMatrix(),{physics:false});
 const off=resolveRigFrame(rig,{...base,ParamHairDrive:4},identityMatrix(),{physics:false});
 for(const id of ROLES)assert.deepEqual(mesh(off,id),mesh(rest,id),'drive must not bind geometry directly');
 const physicsState=new Map();let moved=false;
 for(let i=0;i<180;i++){
  const f=resolveRigFrame(rig,{...base,ParamHairDrive:4},identityMatrix(),{physicsState,physicsDt:1/60,physicsTime:i/60});
  for(const id of ROLES.filter(id=>!id.startsWith('hair-')))assert.deepEqual(mesh(f,id),mesh(rest,id),id+' evaluated mesh changed');
  const points=mesh(f,'hair-left'),original=mesh(rest,'hair-left');
  const max=Math.max(...points.map((p,j)=>Math.hypot(p.x-original[j].x,p.y-original[j].y)));
  assert.ok(max<=1.001,'spring exceeds one stage pixel');if(i>10&&max>.02)moved=true;
 }
 assert.ok(moved,'hair tip must respond after temporal spring frames');
});
