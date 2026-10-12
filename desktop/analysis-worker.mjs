// Analyse im eigenen Thread, damit Dashboard, Widget und Notch flüssig bleiben.
// Liest haze.db selbst (WAL erlaubt parallele Leser) oder erzeugt im Demo-Modus künstliche Daten.
import {parentPort,workerData} from 'node:worker_threads';
import {analyze} from '../shared/analysis/index.mjs';
import {longterm} from '../shared/analysis/longterm.mjs';
import {synthetic} from '../shared/analysis/synthetic.mjs';
import {remember} from '../shared/analysis/patterns.mjs';
import {evaluate,recentWindow} from '../shared/analysis/forecast.mjs';
import {bodyDay,bodyDays,bodyTrends} from '../shared/analysis/body.mjs';
import {dayStart} from '../shared/analysis/time.mjs';
import {openStore} from '../shared/store.mjs';
const {file,from,to,tz,demo,kind,recent,day}=workerData;
// TTM (desktop/ttm.mjs) nur laden, wenn es gebraucht wird; schlägt das fehl, läuft die Prognose ohne es weiter.
async function ttm(){try{const {loadTtm}=await import('./ttm.mjs');return {model:await loadTtm()};}catch(e){return {error:e.message};}}
try{
 let data;
 if(demo)data=synthetic({days:kind==='longterm'?240:kind==='forecast'||kind==='forecast-live'?40:Math.ceil((to-from)/86400000)+2,end:to,tz,longterm:kind==='longterm',unusual:[228,200],body:kind==='body'});
 else{const s=openStore(file);try{data=s.load(from,to);
  // Schlaf und Tag: schwere Verläufe (Phasen, Stress, Body Battery, Puls) nur rund um den gewählten Tag laden.
  if(kind==='body'){const days=bodyDays(data,tz),d=days.includes(day)?day:days[0];if(d){const t=dayStart(d,tz);Object.assign(data,s.body(t-86400000,t+2*86400000));}}}finally{s.close();}}
 let result;
 if(kind==='forecast'){const t=await ttm();result=await evaluate([...data.glucose].sort((a,b)=>a.time-b.time),{to,extra:t.model||null});if(t.error)result.external={key:'ttm',label:'IBM TTM',status:`nicht verfügbar: ${t.error}`};}
 // Live für TTM: frische Werte aus Nightscout (recent) plus Historie aus haze.db, 30 h am Stück.
 else if(kind==='forecast-live'){const t=await ttm();if(!t.model)throw Error(t.error);const all=[...data.glucose,...(recent||[])].sort((a,b)=>a.time-b.time),w=recentWindow(all,t.model.context,to);
  result=w?{time:w.time,values:await t.model.path(w.values)}:null;}

 // Schlaf und Tag: gewählter Tag (sonst der neueste mit Garmin-Daten), Liste der Tage, 4-Wochen-Kacheln.
 else if(kind==='body'){const days=bodyDays(data,tz),d=days.includes(day)?day:days[0];result=d?{days,...bodyDay(data,{day:d,tz,now:to}),trends:bodyTrends(data,{day:d,tz})}:{days:[]};}
 else result=kind==='longterm'?longterm(data,{from,to,tz}):analyze(data,{from,to,tz});
 // Gedächtnis der Muster: seit wann eine Regel gilt und welche verschwunden sind (meta 'pattern-memory'). Fehler hier stören nie.
 if(kind==='longterm'&&!demo&&result.patterns)try{const s=openStore(file);try{
  const r=remember(JSON.parse(s.meta('pattern-memory')||'{}'),result.patterns.rules.found,result.period.lastDay);s.setMeta('pattern-memory',JSON.stringify(r.memory));
  result.patterns.memory={since:Object.fromEntries(Object.entries(r.memory).map(([k,v])=>[k,v.first])),gone:r.gone.sort((a,b)=>a.last<b.last?1:-1).slice(0,5)};
 }finally{s.close();}}catch{}
 parentPort.postMessage({ok:true,result});
}catch(e){parentPort.postMessage({ok:false,error:e.message});}
