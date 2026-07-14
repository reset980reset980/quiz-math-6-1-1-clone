import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const index=read('index.html');
const manifest=JSON.parse(read('docs/research/ASSET_MANIFEST.json'));
const errors=JSON.parse(read('docs/research/ASSET_ERRORS.json'));

assert.match(index,/Quiz Survivor: 분수의 나눗셈/);
assert.match(index,/assets\/index-BFKr9x2y\.js/);
assert.match(index,/assets\/index-BcfxPZCh\.css/);
assert.equal(errors.length,0);
assert.equal(manifest.length,155);
for(const item of manifest){
  const file=path.join(root,item.path);
  assert.ok(fs.existsSync(file),`missing ${item.path}`);
  assert.equal(fs.statSync(file).size,item.bytes,`size mismatch ${item.path}`);
}
for(const required of [
  'assets/phaser-DFK5Ua9d.js',
  'assets/react-DS5UYnvf.js',
  'assets/firebase-fgrhYwij.js',
  'assets/g6-1-1-CLDU9m4L.js',
  'assets/generated/hero_idle_strip.png',
  'assets/generated/weapon_pencil.png',
  'assets/audio/bgm.mp3'
]) assert.ok(fs.existsSync(path.join(root,required)),`missing runtime asset ${required}`);

const bundle=read('assets/index-BFKr9x2y.js');
assert.match(bundle,/apiKey:void 0/);
assert.match(bundle,/projectId:void 0/);
assert.match(bundle,/localStorage/);
assert.doesNotMatch(bundle,/quiz-math-6-1-1\.vercel\.app/);
console.log(`SMOKE_OK assets=${manifest.length} bytes=${manifest.reduce((n,x)=>n+x.bytes,0)}`);
