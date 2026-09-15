import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../scripts/register-loader.mjs';
const {createFaceMapper,applyFace}=await import('../apps/preview/src/imageLabFace.ts');
const result=(x=.5,jaw=0)=>({faceLandmarks:[Array.from({length:468},(_,i)=>({x:i===33?.4:i===263?.6:x,y:.5,z:0}))],faceBlendshapes:[{categories:[{categoryName:'jawOpen',score:jaw},{categoryName:'eyeBlinkLeft',score:1}]}]});
test('neutral calibration, mirrored bounded motion and no stale face',()=>{const m=createFaceMapper();assert.equal(m.map(result()).x,0);let f;for(let i=0;i<20;i++)f=m.map(result(.9,1));assert.ok(f.x<0&&f.x>=-24);assert.ok(f.mouth>.9&&f.mouth<=1);assert.equal(m.map({faceLandmarks:[]}).tracked,false);assert.equal(m.map({faceLandmarks:[]}).x,0);m.calibrate();assert.equal(m.map(result(.9)).x,0);});
test('face owns eyes, audio owns mouth; never writes deformation angles',()=>{const p={ParamMouthOpen:.7,ParamEyeLOpen:1,ParamEyeROpen:1,ParamAngleX:0};const f={tracked:true,left:0,right:.4,mouth:.9,x:10,y:3,rotation:4};assert.equal(applyFace(p,f,true).ParamMouthOpen,.7);assert.equal(applyFace(p,f,false).ParamMouthOpen,.9);assert.equal(applyFace(p,f,true).ParamEyeLOpen,0);assert.equal(applyFace(p,f,false).ParamAngleX,0);});
