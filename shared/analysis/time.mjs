// Ortszeit ohne Abhängigkeiten: Tag (YYYY-MM-DD) und Minute des Tages in einer IANA-Zeitzone.
// Der Offset wird je Stunde gecacht; das reicht für Sommerzeitwechsel (immer zur vollen Stunde).
export const MIN=60000,HOUR=3600000,DAY=86400000;
export const defaultZone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Berlin';
const zones=new Map();
function zone(tz){
 let z=zones.get(tz);if(z)return z;
 const f=new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
 z={f,cache:new Map()};zones.set(tz,z);return z;
}
// Offset (ms) der Zone gegenüber UTC zum Zeitpunkt ts.
export function offset(ts,tz=defaultZone()){
 const z=zone(tz),h=Math.floor(ts/HOUR);let o=z.cache.get(h);if(o!==undefined)return o;
 const p=Object.fromEntries(z.f.formatToParts(new Date(h*HOUR)).map(x=>[x.type,x.value]));
 o=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)-h*HOUR;
 if(z.cache.size>200000)z.cache.clear();z.cache.set(h,o);return o;
}
const pad=n=>String(n).padStart(2,'0');
export function dayKey(ts,tz=defaultZone()){const d=new Date(ts+offset(ts,tz));return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;}
export function minuteOfDay(ts,tz=defaultZone()){const d=new Date(ts+offset(ts,tz));return d.getUTCHours()*60+d.getUTCMinutes();}
// Lokale Mitternacht des Tages key (YYYY-MM-DD) als UTC-Zeitstempel.
export function dayStart(key,tz=defaultZone()){
 const [y,m,d]=key.split('-').map(Number),guess=Date.UTC(y,m-1,d);
 let t=guess-offset(guess,tz);t=guess-offset(t,tz);return t;
}
export function addDays(key,n){const [y,m,d]=key.split('-').map(Number),x=new Date(Date.UTC(y,m-1,d+n));return `${x.getUTCFullYear()}-${pad(x.getUTCMonth()+1)}-${pad(x.getUTCDate())}`;}
export function days(fromKey,toKey){const out=[];for(let k=fromKey;k<=toKey;k=addDays(k,1))out.push(k);return out;}
