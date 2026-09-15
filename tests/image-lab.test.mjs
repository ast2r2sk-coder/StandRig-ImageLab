import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import '../scripts/register-loader.mjs';
const url = new URL('../apps/preview/src/imageLabCore.ts', import.meta.url);
const core = existsSync(url) ? await import(url) : {};
const api = (name) => { assert.equal(typeof core[name], 'function', `${name}: image-first behavior is not implemented`); return core[name]; };
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/QAAAABJRU5ErkJggg==';
const source = { name: 'local.png', data: png, width: 1, height: 1 };
const sample = () => api('createProject')(source, true);

test('manual key removes magenta, preserves mint/skin and input buffer', () => {
  const pixels = new Uint8ClampedArray([252,2,250,255, 90,190,175,255, 244,213,197,255]);
  const keyed = api('chromaKey')(pixels, { keyEnabled: true, keyColor: [252,2,250], tolerance: 65, softness: 65 });
  assert.equal(keyed[3], 0); assert.deepEqual([...keyed.slice(4)], [...pixels.slice(4)]); assert.equal(pixels[3], 255);
});
test('key edges have fractional alpha, despill, and preserve existing transparency', () => {
  const pixels = new Uint8ClampedArray([210,55,206,128]);
  const result = api('chromaKey')(pixels, { keyEnabled:true, keyColor:[252,2,250], tolerance:45, softness:100 });
  assert.ok(result[3]>0 && result[3]<128); assert.ok(result[0]<210 && result[2]<206);
});
test('key disabled is an exact copy', () => {
  const pixels = new Uint8ClampedArray([252,2,250,255]);
  assert.deepEqual(api('chromaKey')(pixels, {keyEnabled:false}), pixels);
});
test('normalized polygon coverage includes edges and excludes exterior', () => {
  const poly=[[0.2,0.2],[0.8,0.2],[0.8,0.8],[0.2,0.8]];
  assert.equal(api('insidePolygon')(0.5,0.5,poly),true);
  assert.equal(api('insidePolygon')(0.2,0.5,poly),true);
  assert.equal(api('insidePolygon')(0.1,0.5,poly),false);
});
test('settings clamp finite extremes and reject nonfinite values', () => {
  const settings=api('normalizeSettings')({...sample().settings,tolerance:999,stiffness:999,damping:-10});
  assert.equal(settings.tolerance,180); assert.equal(settings.stiffness,80); assert.equal(settings.damping,2);
  assert.throws(()=>api('normalizeSettings')({...settings,softness:NaN}),/finite|유한/);
});
test('image header validates raster signature and dimensions before decoding', () => {
  assert.deepEqual(api('inspectDataImage')(png),{width:1,height:1,mime:'image/png'});
  for(const value of ['https://evil.test/a.png','data:image/svg+xml;base64,PHN2Zy8+','data:image/png;base64,aGVsbG8=']) assert.throws(()=>api('inspectDataImage')(value));
  const bytes=Buffer.from(png.split(',')[1],'base64'); bytes.writeUInt32BE(50000,16);
  assert.throws(()=>api('inspectDataImage')('data:image/png;base64,'+bytes.toString('base64')),/크기|dimension/);
});
test('project roundtrip preserves masks, settings, params and embedded replacement', () => {
  const p=sample(); p.parts[0].replacement=source; p.params.ParamAngleX=7; p.parts[1].polygon[0]=[0.1,0.2];
  const text=api('serializeProject')(p); assert.deepEqual(api('parseProject')(text),p);
});
test('source replacement keeps masks/rig settings but removes filename dependence', () => {
  const p=sample(); const changed=api('replaceSource')(p,{...source,name:'next.png'});
  assert.deepEqual(changed.parts,p.parts); assert.deepEqual(changed.anchors,p.anchors);
  assert.equal(changed.source.name,'next.png'); assert.equal(p.source.name,'local.png');
});
test('generic intake has no automatic segmentation/key claim', () => {
  const p=api('createProject')(source,false); assert.equal(p.settings.keyEnabled,false); assert.equal(p.preset,'manual');
  assert.equal(p.parts.length,8);
});
test('rejects malformed JSON, unsupported format, URLs, duplicate roles and missing fields', () => {
  for(const text of ['{','null','[]','{}']) assert.throws(()=>api('parseProject')(text));
  for(const edit of [p=>p.version=9,p=>p.source.data='https://evil.test/img',p=>p.parts[0].id='body',p=>delete p.settings,p=>p.params.ParamAngleX='12',p=>p.source.width=4,p=>p.parts[0].replacement={...source,data:'file:///tmp/a.png'}]) {
    const p=sample(); edit(p); assert.throws(()=>api('parseProject')(JSON.stringify(p)));
  }
});
test('rejects degenerate, self-intersecting and unbounded polygons', () => {
  for(const polygon of [[[0,0],[1,1],[0,1],[1,0]],[[0,0],[0,0],[0,0]],[[0,0],[2,0],[0,1]]]) {
    const p=sample(); p.parts[0].polygon=polygon; assert.throws(()=>api('parseProject')(JSON.stringify(p)));
  }
});
test('rejects oversized input before JSON parse', () => {
  assert.throws(()=>api('parseProject')(' '.repeat(40*1024*1024+1)),/크기|size/);
});
test('parameter values clamp to disclosed draft ranges', () => {
  const p=sample(); p.params.ParamAngleX=999; p.params.ParamBodyAngleY=-999;
  const loaded=api('parseProject')(JSON.stringify(p)); assert.equal(loaded.params.ParamAngleX,12); assert.equal(loaded.params.ParamBodyAngleY,-4);
});
test('partition assigns every opaque pixel once with editable priority and body fallback', () => {
  const p=sample(); const pixels=new Uint8ClampedArray(4*4*4).fill(255);
  const layers=api('partitionImage')(pixels,4,4,p.parts,0);
  for(let i=3;i<pixels.length;i+=4) assert.equal(layers.reduce((sum,l)=>sum+l.pixels[i],0),255);
  assert.equal(layers.length,8);
});
test('feature underlay uses source skin instead of retaining duplicate eye artwork', () => {
  const p=sample(); const pixels=new Uint8ClampedArray(20*20*4);
  for(let i=0;i<pixels.length;i+=4) pixels.set([240,210,190,255],i);
  p.parts.find(x=>x.id==='eye-left').polygon=[[.4,.4],[.6,.4],[.6,.6],[.4,.6]];
  for(let y=8;y<12;y++) for(let x=8;x<12;x++) pixels.set([30,30,30,255],(y*20+x)*4);
  const layers=api('partitionImage')(pixels,20,20,p.parts,0);
  const head=layers.find(x=>x.id==='head'); const i=(10*20+10)*4;
  assert.ok(head.pixels[i]>150); assert.equal(head.pixels[i+3],255);
});
