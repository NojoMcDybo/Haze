// Glukose-Kennzahlen nach internationalem Konsens (Battelino 2019, Diabetes Care; Battelino 2023, Lancet D&E).
// Alles zeitgewichtet: Jeder Wert steht für die Zeit bis zum nächsten Wert, höchstens bis zur Lückengrenze.
import {MIN,DAY,minuteOfDay} from './time.mjs';
import {weightedMean,weightedSd,quantileSorted} from './stats.mjs';
export const RANGES={veryLow:54,low:70,high:180,veryHigh:250};
export const NOMINAL=5*MIN,GAP=15*MIN;
// Mehrere Quellen für denselben Zeitpunkt (± 2,5 min): die mit der kleinsten Priorität gewinnt.
export const SOURCE_PRIORITY={share:0,nightscout:0,clarity:1,dexcom:1,pump:2};
export function merge(readings,priority=SOURCE_PRIORITY,window=150000){
 const rank=s=>priority[s]??9,out=[];
 for(const r of [...readings].filter(r=>Number.isFinite(r?.time)&&Number.isFinite(r?.value)&&r.value>=20&&r.value<=600).sort((a,b)=>a.time-b.time||rank(a.source)-rank(b.source))){
  const last=out.at(-1);
  if(last&&r.time-last.time<=window){if(rank(r.source)<rank(last.source))out[out.length-1]=r;continue;}
  out.push(r);
 }
 return out;
}
// Gewicht je Messwert in ms.
export function weights(entries,to=Infinity){
 return entries.map((e,i)=>{const next=entries[i+1],dt=next?next.time-e.time:NOMINAL,w=dt<=GAP?dt:NOMINAL;return Math.max(0,Math.min(w,to-e.time));});
}
export const inRange=(entries,from,to)=>entries.filter(e=>e.time>=from&&e.time<to);
const band=v=>v<RANGES.veryLow?'veryLow':v<RANGES.low?'low':v<=RANGES.high?'target':v<=RANGES.veryHigh?'high':'veryHigh';
export function summary(all,from,to){
 const entries=inRange(all,from,to),w=weights(entries,to),v=entries.map(e=>e.value),total=w.reduce((s,x)=>s+x,0);
 const span=Math.max(1,to-from),out={from,to,readings:entries.length,minutes:Math.round(total/MIN),coverage:Math.min(1,total/span),days:span/DAY};
 if(!total)return {...out,mean:null,sd:null,cv:null,gmi:null,gri:null,tir:null,tbr:null,tbr54:null,tar:null,tar250:null,bands:null,sufficient:false};
 const b={veryLow:0,low:0,target:0,high:0,veryHigh:0};entries.forEach((e,i)=>{b[band(e.value)]+=w[i];});
 const pct=Object.fromEntries(Object.entries(b).map(([k,x])=>[k,x/total*100]));
 const mean=weightedMean(v,w),sd=weightedSd(v,w);
 return {...out,mean,sd,cv:mean?sd/mean*100:null,gmi:3.31+0.02392*mean,
  // GRI (Klonoff 2023): 3,0·sehr niedrig + 2,4·niedrig + 1,6·sehr hoch + 0,8·hoch, gedeckelt bei 100.
  gri:Math.min(100,3*pct.veryLow+2.4*pct.low+1.6*pct.veryHigh+.8*pct.high),
  tir:pct.target,tbr:pct.veryLow+pct.low,tbr54:pct.veryLow,tar:pct.high+pct.veryHigh,tar250:pct.veryHigh,bands:pct,
  // Konsens: mindestens 14 Tage und 70 % Tragezeit für belastbare Kennzahlen.
  sufficient:out.days>=14-1e-9&&out.coverage>=.7};
}
// Konsens-Zielwerte (Erwachsene mit Typ-1-Diabetes) als Referenz für die Darstellung, nicht als Bewertung.
export const TARGETS={tir:{min:70},tbr:{max:4},tbr54:{max:1},tar:{max:25},tar250:{max:5},cv:{max:36}};
// AGP: Perzentile 5/25/50/75/95 je Zeitfenster des Tages, leicht geglättet (zirkulär 1-2-1).
export function agp(entries,tz,binMinutes=15){
 const bins=Math.round(1440/binMinutes),buckets=Array.from({length:bins},()=>[]);
 for(const e of entries)buckets[Math.min(bins-1,Math.floor(minuteOfDay(e.time,tz)/binMinutes))].push(e.value);
 const qs=[.05,.25,.5,.75,.95],raw=buckets.map(b=>{const s=b.sort((x,y)=>x-y);return {n:s.length,q:qs.map(q=>quantileSorted(s,q))};});
 return raw.map((r,i)=>{
  const nb=[raw[(i-1+bins)%bins],r,raw[(i+1)%bins]];
  const q=qs.map((_,k)=>{let s=0,n=0;nb.forEach((x,j)=>{if(x.q[k]!=null){const w=j===1?2:1;s+=x.q[k]*w;n+=w;}});return n?s/n:null;});
  return {minute:i*binMinutes,n:r.n,p5:q[0],p25:q[1],p50:q[2],p75:q[3],p95:q[4]};
 });
}
// Episoden: Beginn nach >= minMinutes jenseits der Schwelle, Ende nach >= recoverMinutes zurück (Konsens 2023).
// Eine Messlücke > 15 min beendet eine laufende Episode (als unvollständig markiert).
export function episodes(entries,{below,above,minMinutes=15,recoverMinutes=15}={}){
 const hit=below!=null?v=>v<below:v=>v>above,out=[];let run=null,ep=null,back=null,prev=null;
 const close=(end,complete)=>{const minutes=Math.round((end-ep.start)/MIN);out.push({...ep,end,minutes,complete});ep=null;back=null;};
 for(const e of entries){
  if(prev&&e.time-prev.time>GAP){if(ep)close(prev.time+NOMINAL,false);run=null;}
  if(hit(e.value)){
   back=null;
   if(ep){if(below!=null?e.value<ep.extreme:e.value>ep.extreme){ep.extreme=e.value;ep.extremeTime=e.time;}}
   else{run??={start:e.time,extreme:e.value,extremeTime:e.time};if(below!=null?e.value<run.extreme:e.value>run.extreme){run.extreme=e.value;run.extremeTime=e.time;}
    if(e.time-run.start+NOMINAL>=minMinutes*MIN){ep={...run};run=null;}}
  }else{
   run=null;
   if(ep){back??=e.time;if(e.time-back+NOMINAL>=recoverMinutes*MIN)close(back,true);}
  }
  prev=e;
 }
 if(ep)close(prev.time+NOMINAL,false);
 return out;
}
export function hypos(entries){return {level1:episodes(entries,{below:RANGES.low}),level2:episodes(entries,{below:RANGES.veryLow})};}
export function hypers(entries){return {level1:episodes(entries,{above:RANGES.high}),level2:episodes(entries,{above:RANGES.veryHigh})};}
// Lücken im Glukoseverlauf (für Datenstatus und Nachholen).
export function gaps(entries,from,to,minGap=GAP){
 const out=[];let last=from;
 for(const e of inRange(entries,from,to)){if(e.time-last>minGap)out.push({start:last,end:e.time,minutes:Math.round((e.time-last)/MIN)});last=e.time;}
 if(to-last>minGap)out.push({start:last,end:to,minutes:Math.round((to-last)/MIN)});
 return out;
}
