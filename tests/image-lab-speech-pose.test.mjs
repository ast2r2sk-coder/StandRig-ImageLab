import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import '../scripts/register-loader.mjs';
const url=new URL('../apps/preview/src/imageLabSpeechPose.ts',import.meta.url);
const api=existsSync(url)?await import(url):{};
const fn=name=>{assert.equal(typeof api[name],'function',`${name} missing behavior`);return api[name];};
const ko={name:'Yuna',lang:'ko-KR',voiceURI:'local-ko',localService:true};
const en={name:'Local',lang:'en-US',voiceURI:'local-en',localService:true};
const remote={name:'Remote',lang:'ko-KR',voiceURI:'remote',localService:false};
// Fake speech backend only: these tests prove controller behavior, NOT real speech.
function setup(voices=[remote,en,ko]){
 let now=0,last=0,status='',takeovers=0,cancels=0;const spoken=[],timers=new Map();let serial=0;
 const synth={getVoices:()=>voices,speak:u=>spoken.push(u),cancel:()=>{cancels++;}};
 const controller=fn('createLocalSpeech')({synth,utterance:text=>({text}),now:()=>now,setTimer:(f,ms)=>{timers.set(++serial,{f,at:now+ms});return serial;},clearTimer:id=>timers.delete(id),onMouth:v=>last=v,onStatus:s=>status=s,onTakeover:()=>takeovers++});
 const advance=ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.f();}controller.tick(now);};
 return {controller,spoken,advance,timers,synth,get mouth(){return last;},get status(){return status;},get takeovers(){return takeovers;},get cancels(){return cancels;}};
}
test('local voices only, Korean preferred, no remote/default fallback',()=>{
 const voices=fn('localVoices')([remote,en,ko,{...en,localService:undefined}]);assert.deepEqual(voices,[ko,en]);
 const s=setup([]);assert.equal(s.controller.speak('안녕','local-ko'),false);assert.equal(s.spoken.length,0);assert.match(s.status,/로컬.*오디오/);assert.equal(s.mouth,0);
 const r=setup();assert.equal(r.controller.speak('안녕','remote'),false);assert.equal(r.spoken.length,0);
});
test('trimmed max300 text validated before transmission',()=>{
 const s=setup();for(const text of ['', '  ','a'.repeat(301)]){assert.equal(s.controller.speak(text,'local-ko'),false);}assert.equal(s.spoken.length,0);
 assert.equal(s.controller.speak(' 안녕하세요 ','local-ko'),true);assert.equal(s.spoken[0].text,'안녕하세요');assert.equal(s.spoken[0].voice,ko);assert.equal(s.spoken[0].lang,'ko-KR');assert.equal(s.takeovers,1);
});
test('mouth stays closed until actual start; boundaries approximate; end cleans timers',()=>{
 const s=setup();s.controller.speak('안녕하세요','local-ko');s.advance(100);assert.equal(s.mouth,0);
 const u=s.spoken[0];u.onboundary({charIndex:0});s.advance(30);assert.equal(s.mouth,0);
 u.onstart();s.advance(100);assert.ok(s.mouth>0&&s.mouth<=1);u.onboundary({charIndex:2});s.advance(50);assert.ok(s.mouth>0);
 u.onend();assert.equal(s.mouth,0);assert.equal(s.controller.active,false);assert.equal(s.timers.size,0);assert.match(s.status,/완료/);
});
test('start timeout and end watchdog bounded; late start/end/boundary never revive',()=>{
 for(const started of [false,true]){const s=setup();s.controller.speak('안녕','local-ko');const u=s.spoken[0];if(started)u.onstart();s.advance(121000);assert.equal(s.controller.active,false);assert.equal(s.mouth,0);assert.match(s.status,/오류/);u.onstart();u.onboundary({charIndex:1});u.onend();s.advance(100);assert.equal(s.mouth,0);assert.match(s.status,/오류/);assert.equal(s.timers.size,0);}
});
test('all cancellation reasons invalidate old callbacks without touching new utterance',()=>{
 for(const reason of ['stop','reset','load','source','slider','audio','play','pagehide']){const s=setup();s.controller.speak('안녕','local-ko');const u=s.spoken[0];u.onstart();s.advance(50);s.controller.stop(reason);assert.equal(s.mouth,0);assert.equal(s.timers.size,0);s.controller.speak('다시','local-ko');u.onstart();u.onboundary({charIndex:0});u.onerror({error:'late'});u.onend();s.advance(100);assert.equal(s.mouth,0);assert.equal(s.controller.active,true);s.spoken[1].onstart();s.advance(100);assert.ok(s.mouth>0);}
});
test('synthesis errors and thrown backend calls close mouth visibly',()=>{
 const s=setup();s.controller.speak('안녕','local-ko');s.spoken[0].onstart();s.spoken[0].onerror({error:'synthesis-failed'});assert.equal(s.mouth,0);assert.match(s.status,/오류/);assert.equal(s.timers.size,0);
 s.synth.speak=()=>{throw Error('unavailable');};assert.equal(s.controller.speak('안녕','local-ko'),false);assert.equal(s.controller.active,false);
});
test('whole-character timelines are bounded, smooth and return to identity without warp keys',()=>{
 const sample=fn('poseTimeline');for(const kind of ['bow','nod','tilt']){assert.deepEqual(sample(kind,0),sample(kind,10));let previous=sample(kind,0);for(let t=.01;t<=3;t+=.01){const next=sample(kind,t);assert.deepEqual(Object.keys(next).sort(),['rotation','x','y']);for(const [id,value] of Object.entries(next)){assert.ok(Math.abs(value)<=4);assert.ok(Math.abs(value-previous[id])<.2);}previous=next;}}
 assert.throws(()=>sample('wave',0));
});
test('rigid pose supports smooth cancellation and replay without owning expressions',()=>{
 const p=fn('createGentlePose')(),identity={x:0,y:0,rotation:0};
 assert.equal(p.start('bow'),true);assert.deepEqual(p.tick(0),identity);const active=p.tick(.5);assert.ok(active.rotation>1);assert.equal(p.start('nod'),true);
 p.cancel();assert.deepEqual(p.tick(0),active);assert.deepEqual(p.tick(.4),identity);assert.equal(p.active,false);
 p.start('tilt');p.tick(.5);assert.deepEqual(p.tick(4),identity);assert.equal(p.active,false);
});
