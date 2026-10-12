// IBM Granite TimeSeries TTM r2 (Apache-2.0, Variante 360-60-ft-l1-r2.1) als ONNX über onnxruntime-web 1.30.0 (WebAssembly, MIT).
// Läuft nur im Analyse-Thread. Alle Dateien liegen im Paket und werden vor dem Laden gegen feste SHA-256 geprüft:
// kein Netz, kein Python, kein natives Modul. Herkunft und Export: desktop/models/README.md, tools/export-ttm.py.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
export const FILES={
 'vendor/onnxruntime-web/ort.wasm.min.mjs':'219e6a1fc8a9938268d18efca3c91d310bd2f4a59bbd13744df5b2b7fc6cee3b',
 'vendor/onnxruntime-web/ort-wasm-simd-threaded.mjs':'e13f7f94fc51b4ca72b12faeb1ee95f4ace6dfbc8939bc718aabdc0a27c4299b',
 'vendor/onnxruntime-web/ort-wasm-simd-threaded.wasm':'3398c10d07d229bd91b364548e130e0e51a8e5704b88c7c083ebbeb78842dee2',
 'models/ttm-r2-360-60-ft-l1.onnx':'bc3c134654afd3c6a47557634b95625d7cfc88121db9b7db688310d86fdce0cc',
};
const read=rel=>{const b=fs.readFileSync(path.join(here,rel)),h=crypto.createHash('sha256').update(b).digest('hex');if(h!==FILES[rel])throw Error(`Prüfsumme stimmt nicht: ${rel}`);return b;};
export const CONTEXT=360,FREQ_5MIN=3n;// 360 × 5 min = 30 h Vorlauf; Frequenz-Token 3 = 5 Minuten
/** Lädt das Modell; path(y) liefert die nächsten 12 Werte (5–60 min) aus den letzten 360 Fünf-Minuten-Werten. */
export async function loadTtm(){
 read('vendor/onnxruntime-web/ort.wasm.min.mjs');read('vendor/onnxruntime-web/ort-wasm-simd-threaded.mjs');// Skripte prüfen, bevor sie geladen werden
 const ort=await import('./vendor/onnxruntime-web/ort.wasm.min.mjs');
 ort.env.wasm.numThreads=1;ort.env.wasm.wasmBinary=read('vendor/onnxruntime-web/ort-wasm-simd-threaded.wasm');
 const session=await ort.InferenceSession.create(read('models/ttm-r2-360-60-ft-l1.onnx'));
 return {label:'IBM TTM (vortrainiert)',context:CONTEXT,async path(y){
  // Wie im Training: jedes Fenster für sich standardisieren, danach zurückrechnen.
  const c=y.slice(-CONTEXT),mu=c.reduce((a,b)=>a+b,0)/c.length,sd=Math.sqrt(c.reduce((a,b)=>a+(b-mu)**2,0)/c.length)+1e-6;
  const out=await session.run({past_values:new ort.Tensor('float32',Float32Array.from(c,v=>(v-mu)/sd),[1,CONTEXT,1]),freq_token:new ort.Tensor('int64',BigInt64Array.from([FREQ_5MIN]),[1])});
  return Array.from(out.prediction.data.slice(0,12),v=>Math.max(40,Math.min(400,v*sd+mu)));
 }};
}
