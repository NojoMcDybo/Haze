// Analyse-Engine: ein Aufruf, reine Funktion. Eingabe aus haze.db (oder Demo), Ausgabe für Oberfläche und Export.
// Eingabeformat (alle Zeiten UTC-ms, Glukose in ungerundeten mg/dL):
//  glucose:[{time,value,source}]  treatments:[{time,type,insulin?,carbs?,rate?,duration?}]  deviceEvents:[{time,type}]
//  activities:[{id,start,end,type,avgHr,maxHr,kcal,load,trainingEffect}]  sleeps:[{night,start,end,score,deep,light,rem,awake,hrv,rhr}]
//  daily:[{date,steps,intensityMinutes,stressAvg,bbMax,bbMin,rhr}]
import {DAY,MIN,defaultZone,dayKey,dayStart,addDays,days as dayRange,minuteOfDay} from './time.mjs';
import {merge,summary,agp,hypos,hypers,gaps,inRange,TARGETS} from './glucose.mjs';
import {compressionLows,sensorWindows,exclude} from './artifacts.mjs';
import {activityContext,activityTypes,nightWindows,nightContext,dayContext,hourlyProfile} from './context.mjs';
import {insights} from './insights.mjs';
export {TARGETS};
/** @param {any} data @param {{from?:number,to?:number,tz?:string,seed?:number,permutations?:number}} [options] */
export function analyze(data,{from,to,tz=defaultZone(),seed=7,permutations=999}={}){
 const all=merge(data.glucose||[]);
 to??=all.length?all.at(-1).time+5*MIN:Date.now();from??=to-14*DAY;
 const firstDay=dayKey(from,tz),lastDay=dayKey(to-1,tz),keys=dayRange(firstDay,lastDay);
 const within=x=>x.time>=from-DAY&&x.time<to+DAY;
 // Mit Pumpendaten zählen in Clarity von Hand erfasste Insulinmengen nicht doppelt.
 const pumpData=(data.treatments||[]).some(t=>t.source==='pump');
 const treatments=(data.treatments||[]).filter(within).filter(t=>!(pumpData&&t.source==='clarity'&&t.insulin>0)),deviceEvents=(data.deviceEvents||[]).filter(within);
 const sleeps=(data.sleeps||[]).filter(s=>s.end>from&&s.start<to),activities=(data.activities||[]).filter(a=>a.start>=from&&a.start<to);
 const raw=inRange(all,from-DAY,to+DAY);
 // Artefakte erkennen und für Kennzahlen ausklammern (Rohdaten bleiben erhalten).
 const compression=compressionLows(raw,{sleeps,treatments,tz});
 const warmups=sensorWindows(deviceEvents).map(w=>({start:w.start,end:w.warmupEnd}));
 const clean=exclude(raw,[...compression,...warmups]),period=inRange(clean,from,to);
 const lows=hypos(period),highs=hypers(period),nocturnal=e=>minuteOfDay(e.start,tz)<360;
 const nights=nightContext(clean,nightWindows(sleeps,keys,tz).filter(n=>n.end>from&&n.start<to),{treatments,alarms:deviceEvents.filter(d=>d.type==='alarm'),compression});
 const acts=activityContext(clean,activities,{treatments,hypoEpisodes:hypos(clean).level1});
 const dayTable=dayContext(clean,keys,tz,{daily:data.daily||[],nights,activities,treatments});
 const weeks=[];for(let k=firstDay;k<=lastDay;k=addDays(k,7)){const s=dayStart(k,tz),e=Math.min(to,dayStart(addDays(k,7),tz));const m=summary(clean,s,e);weeks.push({from:s,to:e,mean:m.mean,tir:m.tir,tbr:m.tbr,cv:m.cv,coverage:m.coverage});}
 const hasTreatments=treatments.some(t=>t.insulin>0||t.carbs>0),hasPump=treatments.some(t=>t.type==='basal'||t.type==='sleep_mode'||t.type==='exercise_mode');
 const caveats=['Beobachtungen in deinen eigenen Daten, kein Nachweis von Ursachen und keine Therapieempfehlung.'];
 if(!hasTreatments)caveats.push('Mahlzeiten und Insulin fehlen in den Daten; sie können Zusammenhänge überlagern.');
 if(hasPump)caveats.push('Control-IQ gleicht Schwankungen aus; Zusammenhänge können dadurch kleiner wirken.');
 const summaryAll=summary(clean,from,to);
 if(!summaryAll.sufficient)caveats.push(`Weniger als 14 Tage oder unter 70 % Tragezeit (${Math.round(summaryAll.coverage*100)} %): Kennzahlen nur eingeschränkt belastbar.`);
 return {
  period:{from,to,tz,days:keys.length,firstDay,lastDay},
  summary:summaryAll,targets:TARGETS,
  agp:agp(period,tz),hourly:hourlyProfile(period,tz),
  episodes:{hypo:lows.level1.map(e=>({...e,night:nocturnal(e)})),hypo54:lows.level2.map(e=>({...e,night:nocturnal(e)})),hyper:highs.level1.length,hyper250:highs.level2.length},
  nights,activities:acts,activityTypes:activityTypes(acts),days:dayTable,weeks,
  insights:insights({days:dayTable,nights:nights.filter(n=>n.source==='garmin'),activities:acts},{seed,permutations,bootstrap:permutations}),
  quality:{readings:period.length,raw:inRange(raw,from,to).length,compression:compression.filter(c=>c.nadirTime>=from&&c.nadirTime<to),warmups:warmups.length,
   gaps:gaps(inRange(all,from,to),from,to).filter(g=>g.minutes>=60),sources:countSources(inRange(all,from,to)),
   garmin:{sleeps:sleeps.length,activities:activities.length,daily:(data.daily||[]).filter(d=>d.date>=firstDay&&d.date<=lastDay).length},
   pump:{treatments:treatments.length,hasTreatments,hasPump}},
  caveats,
 };
}
function countSources(entries){const c={};for(const e of entries)c[e.source||'unbekannt']=(c[e.source||'unbekannt']||0)+1;return c;}
