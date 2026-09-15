import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
test('image lab imports versioned source assets rather than ignored workspace files',()=>{
 const entry=readFileSync(new URL('apps/preview/src/imageLab.ts',root),'utf8');
 assert.ok(!entry.includes('../../../workspace/'),'clean clone must not depend on local-only workspace');
 for(const name of ['front.jpg','reference-sheet.jpg']){
  assert.ok(entry.includes('../../../assets/character/'+name+'?url'));
  assert.ok(existsSync(new URL('assets/character/'+name,root)),'versioned sample missing: '+name);
 }
});
test('character provenance pins actual source bytes and does not claim completed model',()=>{
 const path=new URL('assets/character/source-manifest.json',root);
 assert.ok(existsSync(path),'versioned source manifest missing');
 const manifest=JSON.parse(readFileSync(path,'utf8'));
 assert.equal(manifest.status,'draft-only-not-model-freeze');
 for(const s of manifest.sources){const b=readFileSync(new URL('assets/character/'+s.file,root));assert.equal(createHash('sha256').update(b).digest('hex'),s.sha256);}
});
