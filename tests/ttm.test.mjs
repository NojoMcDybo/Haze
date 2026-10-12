import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
import {FILES,CONTEXT,loadTtm} from '../desktop/ttm.mjs';
const desktop=path.resolve('desktop');

test('TTM: Prüfsummen der mitgelieferten Dateien stimmen, Modell rechnet 12 Werte',async()=>{
 for(const [rel,hash] of Object.entries(FILES))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(desktop,rel))).digest('hex'),hash,rel);
 const m=await loadTtm(),y=Array.from({length:CONTEXT},(_,i)=>140+30*Math.sin(i/24));
 const p=await m.path(y);assert.equal(p.length,12);assert.ok(p.every(v=>v>=40&&v<=400));
 // Ruhiger Verlauf bleibt ruhig.
 const flat=await m.path(Array(CONTEXT).fill(120));assert.ok(flat.every(v=>Math.abs(v-120)<5),flat.join());
});
test('TTM: eine veränderte Modelldatei wird abgelehnt',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'haze-ttm-'));
 fs.cpSync(path.join(desktop,'vendor'),path.join(dir,'vendor'),{recursive:true});fs.cpSync(path.join(desktop,'models'),path.join(dir,'models'),{recursive:true});fs.copyFileSync(path.join(desktop,'ttm.mjs'),path.join(dir,'ttm.mjs'));
 const f=path.join(dir,'models','ttm-r2-360-60-ft-l1.onnx'),b=fs.readFileSync(f);b[b.length-10]^=1;fs.writeFileSync(f,b);
 const {loadTtm:load}=await import(pathToFileURL(path.join(dir,'ttm.mjs')).href);
 await assert.rejects(load(),/Prüfsumme stimmt nicht: models/);
 fs.rmSync(dir,{recursive:true,force:true});
});
