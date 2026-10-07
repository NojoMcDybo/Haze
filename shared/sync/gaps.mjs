// Glukose-Lücken verwalten und gezielt nachholen (Tandem Source über tconnectsync, sonst Clarity-Import).
// Versuche werden pro Kalendertag gezählt (tried: {'YYYY-MM-DD': n}); nach zwei Versuchen gilt ein Tag als
// „nicht verfügbar“, damit lange Lücken (z. B. vor Beginn der Aufzeichnung) nicht endlos angefragt werden.
import {dayKey} from '../analysis/time.mjs';
const MIN=60000,DAY=86400000;
const daysOf=(g,tz,end=g.end)=>{const out=new Set();for(let t=g.start;t<end;t+=DAY/4)out.add(dayKey(t,tz));out.add(dayKey(Math.max(g.start,end-1),tz));return [...out].sort();};
export function detectGaps(times,{from,to,tz,tried={},minGap=15*MIN,minLength=30*MIN,now=Date.now()}){
 const found=[];let last=from;
 for(const t of times){if(t-last>minGap&&t-last>=minLength)found.push({start:last,end:t});last=t;}
 if(Math.min(to,now)-last>=minLength)found.push({start:last,end:Math.min(to,now)});
 return found.map(g=>{
  const d=daysOf(g,tz),counts=d.map(k=>tried[k]||0),tries=Math.min(...counts);
  return {...g,minutes:Math.round((g.end-g.start)/MIN),tries,status:counts.every(c=>c>=2)?'nicht verfügbar':counts.some(c=>c>0)?'angefragt':'offen',updated:now};
 });
}
// Tagesbereiche für tconnectsync --start-date/--end-date: nur Tage, die älter als `delay` sind (die Pumpe lädt
// stündlich hoch) und höchstens einmal versucht wurden; Neueste zuerst, zusammenhängende Tage gebündelt.
export function planBackfill(gaps,{tz,tried={},now=Date.now(),delay=90*MIN,maxDays=7,maxRuns=3}={}){
 const dates=new Set();
 for(const g of gaps){if(g.start>now-delay)continue;for(const d of daysOf(g,tz,Math.min(g.end,now-delay)))if((tried[d]||0)<2)dates.add(d);}
 const sorted=[...dates].sort().reverse(),runs=[];
 for(const d of sorted){const r=runs.at(-1),prev=r&&new Date(Date.parse(r.start)-DAY).toISOString().slice(0,10);if(r&&prev===d&&(Date.parse(r.end)-Date.parse(d))/DAY<maxDays-1+1e-9)r.start=d;else{if(runs.length>=maxRuns)break;runs.push({start:d,end:d});}}
 return runs;
}
export function markTried(tried,runs){
 const out={...tried};for(const r of runs)for(let t=Date.parse(r.start);t<=Date.parse(r.end);t+=DAY){const d=new Date(t).toISOString().slice(0,10);out[d]=(out[d]||0)+1;}
 return out;
}
