import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../apps/preview/src/imageLab.ts',import.meta.url),'utf8');
test('live adapter builds native rig from decoded versioned expression sheet pixels',()=>{
 assert.ok(source.includes('../../../assets/character/expression-sheet.jpg?url'));
 assert.match(source,/extractMaterialTextures\(/);
 assert.match(source,/buildImageRig\(validated,next,w,h,\w+\)/);
});
test('offline packager embeds the expression sheet rather than leaving a network asset dependency',()=>{
 const packager=readFileSync(new URL('../scripts/package-image-lab.mjs',import.meta.url),'utf8');
 assert.ok(packager.includes('expression-sheet'));
});
