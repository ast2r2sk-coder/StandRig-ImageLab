import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import '../scripts/register-loader.mjs';
import {createProject} from '../apps/preview/src/imageLabCore.ts';
import {resolveRigFrame,identityMatrix,resolvePhysicsFrame} from '../packages/core/dist/evaluator.js';
const url=new URL('../apps/preview/src/imageLabRig.ts',import.meta.url);
const api=existsSync(url)?await import(url):{};
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/QAAAABJRU5ErkJggg==';
const project=createProject({name:'test',data:png,width:1,height:1},true);
function rig(){assert.equal(typeof api.buildImageRig,'function');return api.buildImageRig(project,Object.fromEntries(project.parts.map(p=>[p.id,png])),600,900);}
test('native image rig has embedded layers, hierarchy, head/body warp and expression bindings',()=>{
 const r=rig();assert.equal(r.parts.length,8);assert.equal(r.assets.length,8);
 const neutral=resolveRigFrame(r,project.params,identityMatrix(),{physics:false});
 const moved=resolveRigFrame(r,{...project.params,ParamAngleX:12,ParamBodyAngleY:4,ParamEyeLOpen:0},identityMatrix(),{physics:false});
 assert.notDeepEqual(moved.parts.get('head').sharedWarps,neutral.parts.get('head').sharedWarps);
 assert.notDeepEqual(moved.parts.get('body').sharedWarps,neutral.parts.get('body').sharedWarps);
 assert.ok(moved.parts.get('eye-left').pose.scaleY<.1);
 assert.ok(r.assets.every(a=>a.src.startsWith('data:image/png;')));
});
test('native hair springs respond, remain finite at long dt and disable cleanly',()=>{
 const r=rig(),state=new Map();let frame;
 for(let i=0;i<1000;i++)frame=resolvePhysicsFrame(r,{ParamAngleX:i<500?12:0},state,20,i);
 for(const s of state.values()){assert.ok(Number.isFinite(s.value));assert.ok(Math.abs(s.value)<100);}
 assert.ok(Number.isFinite(frame.parameterOffsets.ParamHairSway));r.physics.enabled=false;
 assert.deepEqual(resolvePhysicsFrame(r,{},state,20,0).parameterOffsets,{});
});
