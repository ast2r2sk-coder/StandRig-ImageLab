import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../scripts/register-loader.mjs';
import * as core from '../apps/preview/src/imageLabCore.ts';
const poly=[[.2,.2],[.4,.2],[.4,.4],[.2,.4]];
const source={width:1200,height:1800};
test('exact source canvas preserves registration on a 900px stage',()=>{
 assert.deepEqual(core.replacementPlacement(source,poly,600,900,undefined,source),{x:0,y:0,width:600,height:900,clip:false});
 assert.deepEqual(core.replacementPlacement(source,poly,600,900,{x:0,y:0,scale:.5},source),{x:150,y:225,width:300,height:450,clip:false});
});
test('only exact source or stage dimensions qualify, never arbitrary matching aspect ratio',()=>{
 for(const image of [{width:300,height:450},{width:1199,height:1800},{width:1200,height:1799},{width:1800,height:2700}])assert.equal(core.replacementPlacement(image,poly,600,900,undefined,source).clip,true);
 assert.equal(core.replacementPlacement({width:600,height:900},poly,600,900,undefined,source).clip,false);
 assert.equal(core.replacementPlacement(source,poly,600,900).clip,true);
});
for(const mode of ['import','reset'])test(`${mode} part clears placement without changing other fields or input`,()=>{
 assert.equal(typeof core.replacePart,'function');
 const old={id:'head',polygon:poly,order:3,replacement:{name:'old'},placement:{x:.1,y:.2,scale:.8}};
 const snapshot=structuredClone(old),image=mode==='import'?{name:'new'}:undefined;
 const result=core.replacePart(old,image);
 assert.equal(result.placement,undefined);assert.equal(result.replacement,image);
 assert.deepEqual({id:result.id,polygon:result.polygon,order:result.order},{id:old.id,polygon:poly,order:3});
 assert.deepEqual(old,snapshot);
});
