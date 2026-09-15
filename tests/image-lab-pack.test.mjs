import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../scripts/register-loader.mjs';
import {createHash} from 'node:crypto';
const {validateSpeechPack,packShape}=await import('../apps/preview/src/imageLabSpeechPack.ts');
// Synthetic PCM and synthetic token occupancy only: not observed speech/alignment evidence.
const rate=8000,duration=2,bytes=Buffer.alloc(44+rate*duration*2);
bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVE',8);
bytes.write('fmt ',12);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);
bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);
bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);
bytes.writeUInt32LE(bytes.length-44,40);
for(let i=0;i<rate*duration;i++)bytes.writeInt16LE(Math.round(8000*Math.sin(2*Math.PI*220*i/rate)),44+i*2);
const fixture=()=>({kind:'standrig-speech',schema_version:1,status:'aligned',text:'Synthetic test fixture — not observed speech',audio:'data:audio/wav;base64,'+bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex'),duration,tokens:[{token:'ㅏ',start_seconds:.2,end_seconds:.3,confidence:1},{token:'ㅣ',start_seconds:.5,end_seconds:.6,confidence:1},{token:'ㅗ',start_seconds:1,end_seconds:1.1,confidence:1}]});
test('synthetic PCM WAV + JSON pack validates without retiming synthetic tokens',async()=>{const p=fixture(),r=await validateSpeechPack(JSON.stringify(p));assert.deepEqual(r.tokens,p.tokens);});
test('reject malformed and hostile packs',async()=>{for(const change of [{status:'error'},{schema_version:2},{audio:'https://evil.test/a.wav'},{audio:'data:audio/wav;base64,!!!!'},{sha256:'0'.repeat(64)},{duration:31},{duration:1},{tokens:[{token:'X',start_seconds:0,end_seconds:.1,confidence:1}]},{tokens:[{token:'ㅏ',start_seconds:0,end_seconds:.1,confidence:0}]}])await assert.rejects(validateSpeechPack(JSON.stringify({...fixture(),...change})));await assert.rejects(validateSpeechPack(' '.repeat(5*1024*1024+1)));});
test('I explicitly uses E; observed occupancy preserved and hold bounded with silence gate',()=>{const p=fixture();p.tokens=[{token:'ㅣ',start_seconds:1,end_seconds:1.02,confidence:1}];const before=JSON.stringify(p);assert.equal(packShape(p,1.01,.5).form,-1);assert.equal(packShape(p,1.08,.5).interpolated,true);assert.equal(packShape(p,1.15,.5).open,0);assert.equal(packShape(p,1.01,0).open,0);assert.equal(JSON.stringify(p),before);});
