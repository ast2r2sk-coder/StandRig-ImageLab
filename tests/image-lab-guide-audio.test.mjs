import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import '../scripts/register-loader.mjs';
import {ROLES,createProject,parseProject,serializeProject,replacementPlacement} from '../apps/preview/src/imageLabCore.ts';
const url=new URL('../apps/preview/src/imageLabGuideAudio.ts',import.meta.url);
const api=existsSync(url)?await import(url):{};
const fn=name=>{assert.equal(typeof api[name],'function',`${name} missing behavior`);return api[name];};
test('role prompts preserve identity, alignment, manual and hidden-material cautions',()=>{
 const prompts=ROLES.map(role=>fn('buildPartPrompt')(role));
 assert.equal(new Set(prompts).size,8);
 for(const prompt of prompts)for(const term of ['identity','alignment','transparent','chroma','hidden','manual'])assert.ok(prompt.includes(term),term);
 for(const role of [null,'unknown',{},'__proto__'])assert.throws(()=>fn('buildPartPrompt')(role));
});
test('RMS mapping is bounded, noise-gated and attack/release smoothed',()=>{
 const map=fn('amplitudeMouth');
 assert.equal(map(new Float32Array(128),0,.016),0);
 assert.equal(map(new Float32Array(128).fill(.005),0,.016),0);
 const open=map(new Float32Array(128).fill(.3),0,.016);assert.ok(open>0&&open<1);
 const release=map(new Float32Array(128),open,.016);assert.ok(release>0&&release<open);
 assert.ok(map(new Float32Array(128).fill(100),1,10)<=1);
 for(const values of [[null,0,.01],[[],0,.01],[[NaN],0,.01],[[Infinity],0,.01],[[.2],NaN,.01],[[.2],0,-1]])assert.throws(()=>map(...values));
});
test('clock ownership cancels stale decode and stop/end/reset close mouth',()=>{
 const clock=fn('createAudioClock')();
 const first=clock.start();assert.equal(clock.owns(first),true);
 const second=clock.start();assert.equal(clock.owns(first),false);assert.equal(clock.owns(second),true);
 for(const reason of ['stop','end','reset','error']){const token=clock.start();assert.equal(clock.stop(reason),0);assert.equal(clock.owns(token),false);assert.equal(clock.active,false);}
});
test('audio budgets reject malformed, oversized and excessive duration',()=>{
 const validate=fn('validateAudioBudget');validate(1024,2,1,24000);
 for(const args of [[0,1,1,24000],[Infinity,1,1,24000],[20*1024*1024+1,1,1,24000],[1,121,1,24000],[1,NaN,1,24000],[1,1,8,24000],[1,1,2,192000]])assert.throws(()=>validate(...args));
});
const source={name:'pixel.png',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/QAAAABJRU5ErkJggg==',width:1,height:1};
test('explicit placement survives roundtrip; legacy placement remains unchanged',()=>{
 const p=createProject(source);assert.deepEqual(parseProject(serializeProject(p)),p);
 p.parts[0].placement={x:.1,y:-.1,scale:1.5};
 assert.deepEqual(parseProject(serializeProject(p)).parts[0].placement,p.parts[0].placement);
 const poly=[[.2,.2],[.4,.2],[.4,.4],[.2,.4]];
 const base=replacementPlacement({width:10,height:10},poly,100,100);
 const moved=replacementPlacement({width:10,height:10},poly,100,100,p.parts[0].placement);
 assert.equal(moved.width,base.width*1.5);assert.equal(moved.x,base.x+10-(moved.width-base.width)/2);
 for(const placement of [null,{x:'0',y:0,scale:1},{x:0,y:0,scale:0},{x:NaN,y:0,scale:1}]){p.parts[0].placement=placement;assert.throws(()=>parseProject(JSON.stringify(p)));}
});
