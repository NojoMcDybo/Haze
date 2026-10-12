// „Schlaf und Tag“: Garmin-Werte sichtbar machen, auf derselben Zeitachse wie die Glukose. Rein beschreibend.
// Nacht: Schlafphasen (Hypnogramm) mit Glukose, Puls und Kennzahlen. Tag: Glukose, Body Battery, Stress, Schritte je Stunde.
// Trends: die letzten 4 Wochen je Kennzahl gegen den eigenen üblichen Bereich (mittlere Hälfte der 28 Tage davor).
import {MIN,HOUR,DAY,dayStart,addDays,dayKey,defaultZone} from './time.mjs';
import {merge,summary,episodes,RANGES} from './glucose.mjs';
import {median,quantile} from './stats.mjs';
const round=(v,d=0)=>v==null||!Number.isFinite(v)?null:Math.round(v*10**d)/10**d;
const within=(list,from,to,key='time')=>list.filter(x=>x[key]>=from&&x[key]<to);
// Mittelwerte je Zeitfenster (für Puls und Stress, damit die Ansicht leicht bleibt).
export function bucket(points,from,to,step,{sum=false}={}){
 const n=Math.ceil((to-from)/step),acc=Array.from({length:n},()=>[]);
 for(const p of points){const i=Math.floor((p.time-from)/step);if(i>=0&&i<n)acc[i].push(p.value??p.bpm);}
 return acc.map((v,i)=>({time:from+i*step,value:v.length?round(sum?v.reduce((a,b)=>a+b,0):v.reduce((a,b)=>a+b,0)/v.length,1):null})).filter(x=>x.value!=null);
}
const nightOf=(s,tz)=>s.night??dayKey(s.end,tz);
/** Tage mit Garmin-Daten (Schlaf oder Tageswerte), neueste zuerst. */
export function bodyDays({sleeps=[],daily=[]},tz=defaultZone()){return [...new Set([...sleeps.map(s=>nightOf(s,tz)),...daily.map(d=>d.date)])].sort().reverse();}
/** Ein Tag: die Nacht, die an diesem Morgen endet, und der Tag selbst. */
export function bodyDay({glucose=[],sleeps=[],daily=[],stages=[],series=[],hr=[]},{day,tz=defaultZone(),now=Date.now()}){
 const g=merge(glucose).map(e=>({time:e.time,value:e.value})),sleep=sleeps.find(s=>nightOf(s,tz)===day),d0=dayStart(day,tz),d1=Math.min(dayStart(addDays(day,1),tz),now);
 const kind=k=>series.filter(s=>s.kind===k);
 let night=null;
 if(sleep){
  const from=sleep.start-30*MIN,to=sleep.end+30*MIN,s=summary(g,sleep.start,sleep.end),inBed=within(g,sleep.start,sleep.end);
  night={night:day,start:sleep.start,end:sleep.end,from,to,hours:round((sleep.end-sleep.start)/HOUR,1),
   score:sleep.score??null,deep:sleep.deep??null,light:sleep.light??null,rem:sleep.rem??null,awake:sleep.awake??null,hrv:sleep.hrv??null,rhr:sleep.rhr??null,
   spo2:sleep.spo2??null,spo2Low:sleep.spo2Low??null,respiration:sleep.respiration??null,stress:sleep.stress??null,restless:sleep.restless??null,bbChange:sleep.bbChange??null,awakeCount:sleep.awakeCount??null,
   stages:stages.filter(x=>x.night===day||(x.end>sleep.start&&x.start<sleep.end)).map(x=>({start:x.start,end:x.end,stage:x.stage})),
   glucose:within(g,from,to),hr:bucket(within(hr,from,to),from,to,2*MIN),
   glucoseSummary:{tir:round(s.tir,1),mean:round(s.mean),min:inBed.length?Math.min(...inBed.map(e=>e.value)):null,lows:episodes(inBed,{below:RANGES.low}).length}};
 }
 const dayG=within(g,d0,d1);
 const today={from:d0,to:dayStart(addDays(day,1),tz),glucose:dayG,
  bodyBattery:within(kind('body_battery'),d0,d1).map(x=>({time:x.time,value:x.value})),
  stress:bucket(within(kind('stress'),d0,d1),d0,d1,15*MIN),steps:bucket(within(kind('steps'),d0,d1),d0,d1,HOUR,{sum:true}),
  hr:bucket(within(hr,d0,d1),d0,d1,5*MIN),daily:daily.find(x=>x.date===day)||null,
  glucoseSummary:dayG.length?{tir:round(summary(g,d0,d1).tir,1),mean:round(summary(g,d0,d1).mean)}:null};
 return {day,night,today};
}
// Kennzahlen für die 4-Wochen-Kacheln: Wert je Tag aus Schlaf oder Tageswerten.
export const TRENDS=[
 {key:'sleepScore',label:'Schlafwert',from:'sleep',get:s=>s.score,better:1},
 {key:'sleepHours',label:'Schlafdauer',unit:'h',d:1,from:'sleep',get:s=>(s.end-s.start)/HOUR,better:1},
 {key:'hrv',label:'HRV nachts',unit:'ms',from:'sleep',get:s=>s.hrv,better:1},
 {key:'rhr',label:'Ruhepuls',unit:'bpm',from:'daily',get:d=>d.rhr,better:-1},
 {key:'bbMax',label:'Body Battery (Höchstwert)',from:'daily',get:d=>d.bbMax,better:1},
 {key:'stressAvg',label:'Stress Ø',from:'daily',get:d=>d.stressAvg,better:-1},
 {key:'steps',label:'Schritte',from:'daily',get:d=>d.steps,better:1},
 {key:'readiness',label:'Trainingsbereitschaft',from:'daily',get:d=>d.readiness,better:1},
];
/** 4 Wochen je Kennzahl; „höher/niedriger als üblich“, wenn der Tag außerhalb der mittleren Hälfte der 28 Tage davor liegt.
 * @param {any} data @param {{day:string,tz?:string,days?:number}} options */
export function bodyTrends({sleeps=[],daily=[]},{day,tz=defaultZone(),days=28}){
 const bySleep=new Map(sleeps.map(s=>[nightOf(s,tz),s])),byDaily=new Map(daily.map(d=>[d.date,d]));
 return TRENDS.map(t=>{
  const val=k=>{const r=t.from==='sleep'?bySleep.get(k):byDaily.get(k);const v=r?t.get(r):null;return Number.isFinite(v)?v:null;};
  const series=Array.from({length:days},(_,i)=>{const k=addDays(day,i-days+1);return {date:k,value:round(val(k),t.d||0)};});
  const prev=Array.from({length:28},(_,i)=>val(addDays(day,-28+i))).filter(v=>v!=null),value=val(day);
  const usual=prev.length>=10?{median:round(median(prev),t.d||0),lo:round(quantile(prev,.25),t.d||0),hi:round(quantile(prev,.75),t.d||0)}:null;
  const status=value==null||!usual?null:value>usual.hi?'höher':value<usual.lo?'niedriger':'üblich';
  return {key:t.key,label:t.label,unit:t.unit||'',d:t.d||0,better:t.better,value:round(value,t.d||0),usual,status,series};
 });
}
// ── Durchschnitt über mehrere Tage ───────────────────────────────
// Nächte werden ab dem Einschlafen übereinandergelegt (10-Minuten-Fenster, bis 10 h): Anteil je Schlafphase und Glukose
// (Quartile). Tage nach Uhrzeit (15-Minuten-Fenster): Glukose, Body Battery, Stress (Quartile), Schritte (Mittel je Stunde).
// Dient als „Durchschnitt“-Ansicht und als „üblich“-Band hinter einem einzelnen Tag.
export const STAGE_KEYS=['awake','rem','light','deep'];
const qs=v=>v.length?{p25:round(quantile(v,.25)),p50:round(quantile(v,.5)),p75:round(quantile(v,.75)),n:v.length}:null;
const avg=v=>{const x=v.filter(Number.isFinite);return x.length?x.reduce((a,b)=>a+b,0)/x.length:null;};
/** @param {any} data @param {{days:string[],tz?:string}} options */
export function bodyAverage({glucose=[],sleeps=[],daily=[],stages=[],series=[]},{days,tz=defaultZone()}){
 const set=new Set(days),g=merge(glucose).map(e=>({time:e.time,value:e.value})),nights=sleeps.filter(s=>set.has(nightOf(s,tz)));
 const NB=60,NS=10*MIN,share=Array.from({length:NB},()=>({awake:0,rem:0,light:0,deep:0,n:0})),gn=Array.from({length:NB},()=>[]);
 for(const s of nights){
  const st=stages.filter(x=>x.end>s.start&&x.start<s.end);
  for(let i=0;i<NB;i++){const t=s.start+(i+.5)*NS;if(t>=s.end)break;const x=st.find(z=>t>=z.start&&t<z.end);if(x&&x.stage in share[i]){share[i][x.stage]++;share[i].n++;}}
  for(const e of within(g,s.start,Math.min(s.end,s.start+NB*NS)))gn[Math.floor((e.time-s.start)/NS)].push(e.value);
 }
 const minN=Math.max(2,Math.ceil(nights.length*.3));
 const stageShare=share.map((b,i)=>({offset:i*10,n:b.n,...Object.fromEntries(STAGE_KEYS.map(k=>[k,b.n?round(b[k]/b.n,3):0]))})).filter(b=>b.n>=minN);
 const night=nights.length?{n:nights.length,stageShare,glucose:gn.map((v,i)=>({offset:i*10,...qs(v)})).filter(b=>b.n>=Math.max(3,minN)),
  metrics:Object.fromEntries([['score',s=>s.score],['hours',s=>(s.end-s.start)/HOUR],['deep',s=>s.deep],['light',s=>s.light],['rem',s=>s.rem],['awake',s=>s.awake],['hrv',s=>s.hrv],['rhr',s=>s.rhr],['spo2',s=>s.spo2],['respiration',s=>s.respiration],['bbChange',s=>s.bbChange]]
   .map(([k,f])=>[k,round(avg(nights.map(f)),k==='hours'?1:0)]))}:null;
 // Tag nach Uhrzeit: Minute des Tages über die Zeitzone (Sommerzeit-fest), nur Werte aus den gewählten Tagen.
 const DB=96,bins=()=>Array.from({length:DB},()=>[]),gd=bins(),bb=bins(),sx=bins(),stepDay=new Map(),hourKey=new Map();
 const keyOf=t=>{const h=Math.floor(t/HOUR);let k=hourKey.get(h);if(k===undefined){k=dayKey(t,tz);hourKey.set(h,k);}return k;};
 const slot=t=>{const k=keyOf(t);if(!set.has(k))return -1;return Math.min(DB-1,Math.floor((t-dayStart(k,tz))/(15*MIN)));};
 for(const e of g){const i=slot(e.time);if(i>=0)gd[i].push(e.value);}
 for(const x of series){const i=slot(x.time);if(i<0)continue;
  if(x.kind==='body_battery')bb[i].push(x.value);else if(x.kind==='stress')sx[i].push(x.value);
  else if(x.kind==='steps'){const k=keyOf(x.time),h=Math.floor(i/4);if(!stepDay.has(k))stepDay.set(k,new Array(24).fill(0));stepDay.get(k)[h]+=x.value;}}
 const q15=a=>a.map((v,i)=>({minute:i*15,...qs(v)})).filter(b=>b.n>=3);
 const stepDays=[...stepDay.values()];
 const day={n:days.length,glucose:q15(gd),bodyBattery:q15(bb),stress:q15(sx),
  steps:stepDays.length?Array.from({length:24},(_,h)=>({hour:h,mean:round(avg(stepDays.map(d=>d[h])))})):[],
  metrics:Object.fromEntries([['steps',d=>d.steps],['stressAvg',d=>d.stressAvg],['bbMax',d=>d.bbMax],['bbMin',d=>d.bbMin],['readiness',d=>d.readiness]].map(([k,f])=>[k,round(avg(daily.filter(d=>set.has(d.date)).map(f)))]))};
 const gs=summary(g.filter(e=>set.has(keyOf(e.time))),-Infinity,Infinity);
 return {days:days.length,first:days.at(-1),last:days[0],night,day,glucoseSummary:{tir:round(gs.tir,1),mean:round(gs.mean)}};
}
