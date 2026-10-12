// Analyse im eigenen Thread, damit Dashboard, Widget und Notch flüssig bleiben.
// Liest haze.db selbst (WAL erlaubt parallele Leser) oder erzeugt im Demo-Modus künstliche Daten.
import {parentPort,workerData} from 'node:worker_threads';
import {analyze} from '../shared/analysis/index.mjs';
import {longterm} from '../shared/analysis/longterm.mjs';
import {synthetic} from '../shared/analysis/synthetic.mjs';
import {remember} from '../shared/analysis/patterns.mjs';
import {evaluate} from '../shared/analysis/forecast.mjs';
import {openStore} from '../shared/store.mjs';
const {file,from,to,tz,demo,kind}=workerData;
try{
 let data;
 if(demo)data=synthetic({days:kind==='longterm'?240:kind==='forecast'?40:Math.ceil((to-from)/86400000)+2,end:to,tz,longterm:kind==='longterm',unusual:[228,200]});
 else{const s=openStore(file);try{data=s.load(from,to);}finally{s.close();}}
 const result=kind==='forecast'?evaluate([...data.glucose].sort((a,b)=>a.time-b.time),{to}):kind==='longterm'?longterm(data,{from,to,tz}):analyze(data,{from,to,tz});
 // Gedächtnis der Muster: seit wann eine Regel gilt und welche verschwunden sind (meta 'pattern-memory'). Fehler hier stören nie.
 if(kind==='longterm'&&!demo&&result.patterns)try{const s=openStore(file);try{
  const r=remember(JSON.parse(s.meta('pattern-memory')||'{}'),result.patterns.rules.found,result.period.lastDay);s.setMeta('pattern-memory',JSON.stringify(r.memory));
  result.patterns.memory={since:Object.fromEntries(Object.entries(r.memory).map(([k,v])=>[k,v.first])),gone:r.gone.sort((a,b)=>a.last<b.last?1:-1).slice(0,5)};
 }finally{s.close();}}catch{}
 parentPort.postMessage({ok:true,result});
}catch(e){parentPort.postMessage({ok:false,error:e.message});}
