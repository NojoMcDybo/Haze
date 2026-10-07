// Kontextfenster: Glukose rund um Aktivitäten, in Nächten und pro Tag, verbunden mit Garmin- und Pumpendaten.
import {MIN,HOUR,dayStart,addDays,dayKey,minuteOfDay} from './time.mjs';
import {summary,episodes,RANGES} from './glucose.mjs';
import {median,mean} from './stats.mjs';
// Binärsuche: erster Index mit time >= t.
export function lower(entries,t){let lo=0,hi=entries.length;while(lo<hi){const m=lo+hi>>1;if(entries[m].time<t)lo=m+1;else hi=m;}return lo;}
export const slice=(entries,from,to)=>entries.slice(lower(entries,from),lower(entries,to));
export function valueNear(entries,t,before=10*MIN,after=5*MIN){
 const i=lower(entries,t-before);let best=null;
 for(let k=i;k<entries.length&&entries[k].time<=t+after;k++)if(!best||Math.abs(entries[k].time-t)<Math.abs(best.time-t))best=entries[k];
 return best?.value??null;
}
const total=(items,key,from,to)=>items.filter(x=>x.time>=from&&x.time<to).reduce((s,x)=>s+(Number(x[key])||0),0);
const modeActive=(treatments,type,from,to)=>treatments.some(t=>t.type===type&&t.time<to&&t.time+(t.duration||0)*MIN>from);
const round=(v,d=0)=>v==null||!Number.isFinite(v)?null:Math.round(v*10**d)/10**d;

export function activityContext(entries,activities=[],{treatments=[],hypoEpisodes}={}){
 const lows=hypoEpisodes??episodes(entries,{below:RANGES.low});
 return activities.filter(a=>Number.isFinite(a.start)&&a.end>a.start).map(a=>{
  const window=slice(entries,a.start,a.end+2*HOUR),startValue=valueNear(entries,a.start),endValue=valueNear(entries,a.end,10*MIN,10*MIN);
  const nadirEntry=window.reduce((m,e)=>!m||e.value<m.value?e:m,null),minutes=(a.end-a.start)/MIN;
  const late=lows.filter(l=>l.start>a.end+2*HOUR&&l.start<=a.end+24*HOUR);
  const covered=slice(entries,a.start-30*MIN,a.end+2*HOUR).length*5/((a.end-a.start)/MIN+150);
  return {id:a.id,type:a.type||'sonstige',start:a.start,end:a.end,minutes:round(minutes),
   startValue,endValue,change:startValue!=null&&endValue!=null?endValue-startValue:null,
   nadir:nadirEntry?.value??null,nadirMinutes:nadirEntry?round((nadirEntry.time-a.start)/MIN):null,
   drop:startValue!=null&&nadirEntry?startValue-nadirEntry.value:null,
   ratePerMin:startValue!=null&&endValue!=null&&minutes>0?round((endValue-startValue)/minutes,2):null,
   hypoDuring:lows.some(l=>l.start<a.end+2*HOUR&&l.end>a.start),lateHypos:late.length,firstLateHypo:late[0]?.start??null,
   carbsAround:total(treatments,'carbs',a.start-HOUR,a.end),bolusBefore:round(total(treatments,'insulin',a.start-3*HOUR,a.start),1),
   exerciseMode:modeActive(treatments,'exercise_mode',a.start,a.end),
   avgHr:a.avgHr??null,maxHr:a.maxHr??null,load:a.load??null,trainingEffect:a.trainingEffect??null,kcal:a.kcal??null,
   coverage:Math.min(1,round(covered,2))};
 });
}
export function activityTypes(contexts){
 const by=new Map();for(const c of contexts){if(!by.has(c.type))by.set(c.type,[]);by.get(c.type).push(c);}
 return [...by].map(([type,list])=>{const v=k=>list.map(c=>c[k]).filter(Number.isFinite);
  return {type,n:list.length,minutes:round(median(v('minutes'))),startValue:round(median(v('startValue'))),change:round(median(v('change'))),drop:round(median(v('drop'))),
   hypoDuring:list.filter(c=>c.hypoDuring).length,withLateHypo:list.filter(c=>c.lateHypos>0).length};}).sort((a,b)=>b.n-a.n);
}
// Nächte aus Garmin-Schlaf; ohne Schlafdaten die Konsens-Nacht 00–06 Uhr.
export function nightWindows(sleeps,dayKeys,tz){
 if(sleeps?.length)return sleeps.filter(s=>s.end>s.start).map(s=>({...s,night:s.night??dayKey(s.end,tz),source:'garmin'}));
 return dayKeys.map(k=>({night:k,start:dayStart(k,tz),end:dayStart(k,tz)+6*HOUR,source:'clock'}));
}
export function nightContext(entries,nights,{treatments=[],alarms=[],compression=[]}={}){
 return nights.map(n=>{
  const s=summary(entries,n.start,n.end),window=slice(entries,n.start,n.end),lows=episodes(window,{below:RANGES.low});
  const wake=valueNear(entries,n.end,15*MIN,15*MIN),early=slice(entries,n.end-5*HOUR,n.end-2*HOUR);
  const nadir=early.reduce((m,e)=>m==null||e.value<m?e.value:m,null);
  return {night:n.night,start:n.start,end:n.end,source:n.source,hours:round((n.end-n.start)/HOUR,1),
   score:n.score??null,deep:n.deep??null,light:n.light??null,rem:n.rem??null,awake:n.awake??null,hrv:n.hrv??null,rhr:n.rhr??null,
   mean:round(s.mean),cv:round(s.cv,1),tir:round(s.tir,1),tbr:round(s.tbr,1),tar:round(s.tar,1),coverage:round(s.coverage,2),
   min:window.length?Math.min(...window.map(e=>e.value)):null,hypos:lows.length,
   compression:compression.filter(c=>c.nadirTime>=n.start&&c.nadirTime<n.end).length,
   dawnRise:wake!=null&&nadir!=null?wake-nadir:null,
   alarms:alarms.filter(a=>a.time>=n.start&&a.time<n.end).length,
   sleepMode:modeActive(treatments,'sleep_mode',n.start,n.end),
   carbs:total(treatments,'carbs',n.start,n.end)};
 });
}
function basalUnits(treatments,from,to){
 let u=0;for(const t of treatments){if(t.type!=='basal'||!Number.isFinite(t.rate))continue;const s=Math.max(from,t.time),e=Math.min(to,t.time+(t.duration||0)*MIN);if(e>s)u+=t.rate*(e-s)/HOUR;}
 return u;
}
export function dayContext(entries,dayKeys,tz,{daily=[],nights=[],activities=[],treatments=[]}={}){
 const dailyBy=new Map(daily.map(d=>[d.date,d])),nightBy=new Map(nights.map(n=>[n.night,n]));
 return dayKeys.map(k=>{
  const from=dayStart(k,tz),to=dayStart(addDays(k,1),tz),s=summary(entries,from,to),g=dailyBy.get(k)||{},n=nightBy.get(k);
  const acts=activities.filter(a=>a.start>=from&&a.start<to);
  return {date:k,mean:round(s.mean),sd:round(s.sd),cv:round(s.cv,1),tir:round(s.tir,1),tbr:round(s.tbr,1),tar:round(s.tar,1),coverage:round(s.coverage,2),
   steps:g.steps??null,intensityMinutes:g.intensityMinutes??null,stressAvg:g.stressAvg??null,bbMax:g.bbMax??null,bbMin:g.bbMin??null,rhr:g.rhr??null,
   sleepScore:n?.score??null,sleepHours:n&&n.source==='garmin'?n.hours:null,hrv:n?.hrv??null,nightTir:n?.tir??null,nightTbr:n?.tbr??null,nightCv:n?.cv??null,nightHypos:n?.hypos??null,
   activityMinutes:acts.length?round(acts.reduce((x,a)=>x+(a.end-a.start)/MIN,0)):0,activityLoad:acts.some(a=>Number.isFinite(a.load))?round(acts.reduce((x,a)=>x+(a.load||0),0)):null,
   bolus:round(total(treatments.filter(t=>t.type==='bolus'),'insulin',from,to),1),basal:round(basalUnits(treatments,from,to),1),carbs:round(total(treatments,'carbs',from,to))};
 });
}
// Stundenprofil: mittlere Glukose je Tagesstunde, getrennt nach Tagen mit und ohne Aktivität (für die Übersicht).
export function hourlyProfile(entries,tz){
 const h=Array.from({length:24},()=>[]);for(const e of entries)h[Math.floor(minuteOfDay(e.time,tz)/60)].push(e.value);
 return h.map((v,i)=>({hour:i,mean:round(mean(v)),n:v.length}));
}
