// Messartefakte, die Auswertungen verfälschen würden. Heuristik, keine Diagnose: Treffer werden gekennzeichnet und
// aus Episoden und Nachtkennzahlen herausgenommen, aber nie gelöscht.
import {MIN,HOUR,minuteOfDay} from './time.mjs';
// Kompressionstief: im Schlaf steiler Abfall (>= 30 mg/dL in <= 20 min) auf < 70 und ebenso schnelle Erholung
// (>= 30 mg/dL in <= 40 min), ohne erfasste Kohlenhydrate rund um den Tiefpunkt.
export function compressionLows(entries,{sleeps=[],treatments=[],tz,nightFrom=22*60,nightTo=8*60}={}){
 const asleep=t=>sleeps.length?sleeps.some(s=>t>=s.start&&t<=s.end):(m=>m>=nightFrom||m<nightTo)(minuteOfDay(t,tz));
 const carbs=treatments.filter(t=>t.carbs>0).map(t=>t.time);
 const out=[];
 for(let i=1;i<entries.length-1;i++){
  const e=entries[i];if(e.value>=70||!asleep(e.time))continue;
  let lowest=true;
  for(let j=i-1;j>=0&&e.time-entries[j].time<=10*MIN;j--)if(entries[j].value<e.value)lowest=false;
  for(let k=i+1;k<entries.length&&entries[k].time-e.time<=10*MIN;k++)if(entries[k].value<e.value)lowest=false;
  if(!lowest)continue;
  if(out.length&&e.time<=out.at(-1).end)continue;
  let drop=null,rise=null;
  for(let j=i-1;j>=0&&e.time-entries[j].time<=20*MIN;j--)if(entries[j].value-e.value>=30)drop=entries[j];
  for(let k=i+1;k<entries.length&&entries[k].time-e.time<=40*MIN;k++)if(entries[k].value-e.value>=30){rise=entries[k];break;}
  if(!drop||!rise||carbs.some(t=>t>=e.time-10*MIN&&t<=e.time+30*MIN))continue;
  out.push({start:drop.time,end:rise.time,nadir:e.value,nadirTime:e.time});
 }
 return out;
}
// Sensorstart: G7 liefert in der Aufwärmphase (30 min) keine Werte; der erste Tag ist oft ungenauer.
export function sensorWindows(deviceEvents=[]){
 return deviceEvents.filter(d=>d.type==='sensor_start').map(d=>({start:d.time,warmupEnd:d.time+30*MIN,firstDayEnd:d.time+24*HOUR}));
}
export function exclude(entries,spans){
 if(!spans.length)return entries;const s=[...spans].sort((a,b)=>a.start-b.start);
 return entries.filter(e=>!s.some(x=>e.time>=x.start&&e.time<=x.end));
}
