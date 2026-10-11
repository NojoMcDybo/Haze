// Langzeit: Wochen und Monate, Vergleiche zwischen Zeiträumen, Trends, Wendepunkte und Wochen-Zusammenhänge.
// Gleiche Leitplanken wie die Hinweise: beschreibend, Mindestmengen, Unsicherheit per Bootstrap, FDR über alle Tests.
// Zusätzlich: Ein Unterschied zählt nur, wenn er spürbar ist (Konsens: etwa 5 Prozentpunkte Zeit im Bereich),
// und Wochenreihen werden vor Zusammenhängen vom Langzeittrend befreit (sonst hängen zwei steigende Reihen scheinbar zusammen).
import {DAY,defaultZone,dayStart,addDays} from './time.mjs';
import {summary,hypos,inRange} from './glucose.mjs';
import {mean,sd,median,fdr,spearmanTest,theilSen,mannKendall,meanDifference,changePoints} from './stats.mjs';
import {prepare} from './index.mjs';
const round=(v,d=0)=>v==null||!Number.isFinite(v)?null:Math.round(v*10**d)/10**d;
// better: Richtung des Konsensziels (+1 höher besser, −1 niedriger besser); meaningful: kleinster spürbarer Unterschied.
export const METRICS={
 tir:{label:'Zeit im Bereich',unit:'%',meaningful:5,better:1,d:1},
 tbr:{label:'Zeit unter 70',unit:'%',meaningful:1,better:-1,d:1},
 tar:{label:'Zeit über 180',unit:'%',meaningful:5,better:-1,d:1},
 mean:{label:'Mittelwert',unit:'mg/dL',meaningful:10,glucose:true},
 cv:{label:'Schwankung im Tag (CV)',unit:'%',meaningful:3,better:-1,d:1},
 steps:{label:'Schritte pro Tag',unit:'',meaningful:1000},
 activityMinutes:{label:'Training pro Tag',unit:'min',meaningful:10},
 sleepHours:{label:'Schlafdauer',unit:'h',meaningful:.5,d:1},
 sleepScore:{label:'Schlafwert',unit:'',meaningful:5},
 hrv:{label:'HRV nachts',unit:'ms',meaningful:5},
 rhr:{label:'Ruhepuls',unit:'bpm',meaningful:2},
 stressAvg:{label:'Stress (Garmin)',unit:'',meaningful:5},
 readiness:{label:'Trainingsbereitschaft',unit:'',meaningful:8},
 tdd:{label:'Insulin gesamt (Pumpe)',unit:'IE',meaningful:3,d:1},
};
const GLUCOSE=['tir','tbr','tar','mean','cv'],CONTEXT=['steps','activityMinutes','sleepHours','sleepScore','hrv','rhr','stressAvg','readiness','tdd'];
// Tag gilt für Glukose ab 12 h Tragezeit; Woche ab 4 solchen Tagen, Monat ab 10.
const VALID_DAY=.5,VALID_WEEK=4,VALID_MONTH=10,MIN_SIDE=14,MIN_WEEKS_TREND=8,MIN_WEEKS_CORR=12;
const weekday=k=>{const [y,m,d]=k.split('-').map(Number);return (new Date(Date.UTC(y,m-1,d)).getUTCDay()+6)%7;};
export const weekOf=k=>addDays(k,-weekday(k));
const MONTHS=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
export const monthName=m=>`${MONTHS[+m.slice(5,7)-1]} ${m.slice(0,4)}`;
// Tageszeile für die Langzeit: Glukose nur an gültigen Tagen, Training nur an Tagen mit Garmin-Tagesdaten, Insulin nur mit Basal von der Pumpe.
export function dayRows(dayTable){
 return dayTable.map(d=>{const ok=d.coverage>=VALID_DAY;return {date:d.date,coverage:d.coverage,valid:ok,
  tir:ok?d.tir:null,tbr:ok?d.tbr:null,tar:ok?d.tar:null,mean:ok?d.mean:null,cv:ok?d.cv:null,
  steps:d.steps,activityMinutes:d.steps!=null?d.activityMinutes:null,sleepHours:d.sleepHours,sleepScore:d.sleepScore,hrv:d.hrv,rhr:d.rhr,stressAvg:d.stressAvg,readiness:d.readiness,
  tdd:d.basal>0?round((d.basal||0)+(d.bolus||0),1):null};});
}
const avgOf=(rows,k)=>{const v=rows.map(r=>r[k]).filter(Number.isFinite);return v.length?mean(v):null;};
function aggregate(clean,rows,from,to,validMin){
 const s=summary(clean,from,to),valid=rows.filter(r=>r.valid).length,ok=valid>=validMin;
 const out={from,to,days:rows.length,validDays:valid,coverage:round(s.coverage,2),enough:ok,
  tir:ok?round(s.tir,1):null,tbr:ok?round(s.tbr,1):null,tbr54:ok?round(s.tbr54,1):null,tar:ok?round(s.tar,1):null,mean:ok?round(s.mean):null,cv:ok?round(s.cv,1):null,gmi:ok?round(s.gmi,1):null,gri:ok?round(s.gri):null,
  hypos:ok?hypos(inRange(clean,from,to)).level1.length:null};
 for(const k of CONTEXT)out[k]=round(avgOf(rows,k),METRICS[k].d||0);
 return out;
}
// Vergleich zweier Zeiträume über die Tageswerte (Mittel der Tage), Unsicherheit mit AR(1)-korrigiertem t-Intervall.
export function comparePeriods(a,b,keys=[...GLUCOSE,...CONTEXT]){
 return keys.map(k=>{
  const va=a.map(r=>r[k]).filter(Number.isFinite),vb=b.map(r=>r[k]).filter(Number.isFinite),m=METRICS[k];
  if(va.length<MIN_SIDE||vb.length<MIN_SIDE)return {key:k,a:round(mean(va),m.d||0),b:round(mean(vb),m.d||0),na:va.length,nb:vb.length,status:'zu wenige Daten'};
  const r=meanDifference(va,vb);
  return {key:k,a:round(mean(va),m.d||0),b:round(mean(vb),m.d||0),na:va.length,nb:vb.length,diff:round(r.difference,m.d??0),ci:[round(r.ci[0],1),round(r.ci[1],1)],p:r.p,status:'geprüft'};
 });
}
// Einordnung nach FDR (strenger als bei Hinweisen): klar höher/niedriger, stabil (ganzes Intervall innerhalb des spürbaren Bereichs) oder offen.
function classify(t,alpha=.05){
 const m=METRICS[t.key].meaningful;
 if(t.q<=alpha&&Math.abs(t.diff)>=m&&(t.ci[0]>0||t.ci[1]<0))t.status=t.diff>0?'höher':'niedriger';
 else if(t.ci[0]>-m&&t.ci[1]<m)t.status='stabil';else t.status='offen';
 const better=METRICS[t.key].better;if(better&&(t.status==='höher'||t.status==='niedriger'))t.towardTarget=(t.diff>0)===(better>0);
 return t;
}
// Wochen-Zusammenhänge (nach Herausrechnen des Trends; i = Wochennummer, Lücken bleiben erhalten): Woche mit mehr X als im eigenen Trend üblich ↔ Y.
export const WEEK_HYPOTHESES=[
 {x:'steps',y:'tir'},{x:'steps',y:'mean'},{x:'activityMinutes',y:'tbr'},{x:'activityMinutes',y:'tir'},
 {x:'sleepHours',y:'mean'},{x:'sleepScore',y:'tir'},{x:'hrv',y:'tir'},{x:'rhr',y:'mean'},
 {x:'stressAvg',y:'mean'},{x:'stressAvg',y:'cv'},{x:'readiness',y:'tir'},
];
const MORE={steps:'mehr Schritten',activityMinutes:'mehr Training',sleepHours:'mehr Schlaf',sleepScore:'besserem Schlafwert',hrv:'höherer HRV',rhr:'höherem Ruhepuls',stressAvg:'mehr Stress',readiness:'höherer Trainingsbereitschaft'};
const SUBJECT={tir:'die Zeit im Bereich',mean:'der Mittelwert',tbr:'die Zeit unter 70',cv:'die Schwankung'};
const detrend=(x,y)=>{const t=theilSen(x,y);return t?y.map((v,i)=>v-(t.intercept+t.slope*x[i])):y;};
function weekCorrelations(weeks,{seed,permutations}){
 const tested=WEEK_HYPOTHESES.map(h=>{
  const rows=weeks.map(w=>({i:w.i,x:w[h.x],y:w[h.y]})).filter(r=>Number.isFinite(r.x)&&Number.isFinite(r.y));
  if(rows.length<MIN_WEEKS_CORR||new Set(rows.map(r=>r.x)).size<4)return {...h,n:rows.length,status:'zu wenige Daten'};
  const idx=rows.map(r=>r.i),rx=detrend(idx,rows.map(r=>r.x)),ry=detrend(idx,rows.map(r=>r.y));
  return {...h,...spearmanTest(rx,ry,{permutations,bootstrap:permutations,seed}),status:'geprüft'};
 });
 const run=tested.filter(t=>t.status==='geprüft'),q=fdr(run.map(t=>t.p));run.forEach((t,i)=>{t.q=q[i];});
 const found=run.filter(t=>t.rho!=null&&Math.abs(t.rho)>=.4&&t.q<=.1&&t.ci&&(t.ci[0]>0||t.ci[1]<0)).map(t=>({id:`${t.x}:${t.y}`,x:t.x,y:t.y,n:t.n,rho:t.rho,ci:t.ci,q:t.q,
  strength:Math.abs(t.rho)>=.6?'deutlich':'mäßig',
  text:`In Wochen mit ${MORE[t.x]} als im eigenen Trend üblich war ${SUBJECT[t.y]} eher ${t.rho>0?'höher':'niedriger'}. ${Math.abs(t.rho)>=.6?'Deutlicher':'Mäßiger'} Zusammenhang, n = ${t.n} Wochen.`}))
  .sort((a,b)=>Math.abs(b.rho)-Math.abs(a.rho));
 return {found,tested:tested.map(({ci,...t})=>t)};
}
// Wendepunkte in Zeit im Bereich und Mittelwert; nahe beieinander liegende (≤ 7 Tage) werden zu einem Ereignis zusammengefasst.
export function changeEvents(rows,{minSize=14}={}){
 const events=[];
 for(const k of ['tir','mean','tbr']){
  const days=rows.filter(r=>Number.isFinite(r[k])),v=days.map(r=>r[k]),cuts=changePoints(v,{minSize}),bounds=[0,...cuts,v.length];
  cuts.forEach((c,i)=>{
   const before=median(v.slice(bounds[i],c)),after=median(v.slice(c,bounds[i+2])),diff=after-before;
   if(Math.abs(diff)<METRICS[k].meaningful)return;
   events.push({date:days[c].date,key:k,before:round(before,METRICS[k].d||0),after:round(after,METRICS[k].d||0),diff:round(diff,METRICS[k].d||0)});
  });
 }
 events.sort((a,b)=>a.date<b.date?-1:1);
 const merged=[];for(const e of events){const last=merged.at(-1);if(last&&addDays(last.date,7)>=e.date&&!last.shifts.some(s=>s.key===e.key))last.shifts.push(e);else merged.push({date:e.date,shifts:[e]});}
 // Gleichzeitige Veränderungen: 28 Tage davor gegen 28 Tage danach, nur deutliche (Effektstärke ≥ 0,5 und spürbar).
 for(const m of merged){
  const pre=rows.filter(r=>r.date<m.date&&r.date>=addDays(m.date,-28)),post=rows.filter(r=>r.date>=m.date&&r.date<addDays(m.date,28));
  m.context=CONTEXT.map(k=>{const a=pre.map(r=>r[k]).filter(Number.isFinite),b=post.map(r=>r[k]).filter(Number.isFinite);if(a.length<7||b.length<7)return null;
   const diff=mean(b)-mean(a),s=Math.sqrt(((sd(a)||0)**2+(sd(b)||0)**2)/2),dz=s?Math.abs(diff)/s:0;
   return dz>=.5&&Math.abs(diff)>=METRICS[k].meaningful?{key:k,before:round(mean(a),METRICS[k].d||0),after:round(mean(b),METRICS[k].d||0),diff:round(diff,METRICS[k].d||0)}:null;}).filter(Boolean);
 }
 return merged;
}
/** Langzeitauswertung über den ganzen geladenen Zeitraum. @param {any} data @param {{from?:number,to?:number,tz?:string,seed?:number,permutations?:number}} [options] */
export function longterm(data,{from,to,tz=defaultZone(),seed=7,permutations=999}={}){
 const P=prepare(data,{from,to,tz}),{clean}=P,all=dayRows(P.dayTable);
 // Führende Tage ohne Daten abschneiden (Rückblick ist länger als die vorhandene Historie).
 const firstData=all.findIndex(r=>r.valid||r.steps!=null||r.sleepScore!=null),rows=firstData<0?[]:all.slice(firstData);
 const validDays=rows.filter(r=>r.valid).length,caveats=['Beobachtungen in deinen eigenen Daten, kein Nachweis von Ursachen und keine Therapieempfehlung.'];
 const base={period:{from:P.from,to:P.to,firstDay:rows[0]?.date??null,lastDay:P.lastDay,days:rows.length,validDays},caveats};
 if(!rows.length)return {...base,weeks:[],months:[],comparisons:[],trends:[],changes:[],correlations:{found:[],tested:[]}};
 // Wochen (Montag bis Sonntag) und Kalendermonate.
 const group=(keyOf,validMin)=>{const map=new Map();for(const r of rows){const k=keyOf(r.date);if(!map.has(k))map.set(k,[]);map.get(k).push(r);}
  return [...map].map(([k,list])=>{const s=Math.max(P.from,dayStart(list[0].date,tz)),e=Math.min(P.to,dayStart(addDays(list.at(-1).date,1),tz));return {key:k,...aggregate(clean,list,s,e,validMin)};});};
 const weeks=group(weekOf,VALID_WEEK),months=group(d=>d.slice(0,7),VALID_MONTH).map((m,i,a)=>({...m,label:monthName(m.key),partial:m.days<new Date(Date.UTC(+m.key.slice(0,4),+m.key.slice(5,7),0)).getUTCDate()}));
 months.forEach((m,i)=>{const p=months[i-1];m.change=p&&m.tir!=null&&p.tir!=null?{tir:round(m.tir-p.tir,1),mean:m.mean!=null&&p.mean!=null?round(m.mean-p.mean):null}:null;});
 // Vergleiche: letzte 4 Wochen gegen die 4 davor und gegen die 12 davor; letzter voller Monat gegen den davor.
 const last=P.lastDay,span=(fromKey,toKey)=>rows.filter(r=>r.date>=fromKey&&r.date<toKey);
 const cmp=[];
 const add=(id,label,aLabel,bLabel,a,b)=>{if(a.filter(r=>r.valid).length>=MIN_SIDE&&b.filter(r=>r.valid).length>=MIN_SIDE)cmp.push({id,label,a:{label:aLabel,first:a[0].date,last:a.at(-1).date},b:{label:bLabel,first:b[0].date,last:b.at(-1).date},metrics:comparePeriods(a,b)});};
 const end=addDays(last,1),l4=addDays(end,-28);
 add('4w','Letzte 4 Wochen gegenüber den 4 Wochen davor','4 Wochen davor','letzte 4 Wochen',span(addDays(l4,-28),l4),span(l4,end));
 add('4w12w','Letzte 4 Wochen gegenüber den 12 Wochen davor','12 Wochen davor','letzte 4 Wochen',span(addDays(l4,-84),l4),span(l4,end));
 const full=months.filter(m=>!m.partial);
 if(full.length>=2){const [a,b]=full.slice(-2);add('month',`${monthName(b.key)} gegenüber ${monthName(a.key)}`,monthName(a.key),monthName(b.key),rows.filter(r=>r.date.startsWith(a.key)),rows.filter(r=>r.date.startsWith(b.key)));}
 // Trends über die gültigen Wochen (Theil-Sen-Steigung, Mann-Kendall).
 const wk=weeks.map((w,i)=>({...w,i})),trends=[...GLUCOSE,...CONTEXT].map(k=>{
  const list=wk.filter(w=>Number.isFinite(w[k])&&(GLUCOSE.includes(k)?w.enough:true));
  if(list.length<MIN_WEEKS_TREND)return {key:k,n:list.length,status:'zu wenige Daten'};
  const x=list.map(w=>w.i),y=list.map(w=>w[k]),t=theilSen(x,y),mk=mannKendall(y);
  return {key:k,n:list.length,slopePerMonth:round(t.slope*30.44/7,2),change:round(t.slope*(x.at(-1)-x[0]),1),p:mk.p,line:{intercept:t.intercept,slope:t.slope},status:'geprüft'};
 });
 // Eine FDR-Korrektur über alle Vergleiche und Trends.
 const tests=[...cmp.flatMap(c=>c.metrics.filter(t=>t.status==='geprüft')),...trends.filter(t=>t.status==='geprüft')],q=fdr(tests.map(t=>t.p));tests.forEach((t,i)=>{t.q=q[i];});
 cmp.forEach(c=>c.metrics.forEach(t=>{if(t.status==='geprüft')classify(t);}));
 trends.forEach(t=>{if(t.status!=='geprüft')return;const m=METRICS[t.key];t.status=t.q<=.1&&Math.abs(t.change)>=m.meaningful?(t.change>0?'steigend':'fallend'):'kein klarer Trend';
  if(m.better&&t.status!=='kein klarer Trend')t.towardTarget=(t.change>0)===(m.better>0);});
 if(validDays<28)caveats.push(`Erst ${validDays} Tage mit ausreichend Glukosewerten: Für Vergleiche braucht es je Zeitraum mindestens ${MIN_SIDE} Tage, für Trends ${MIN_WEEKS_TREND} Wochen.`);
 caveats.push('Wendepunkte und gleichzeitige Veränderungen zeigen, was zusammenfällt, nicht was die Ursache ist. Auch Sensor- oder Pumpenwechsel können Wendepunkte erzeugen.');
 return {...base,weeks,months,comparisons:cmp,trends,changes:changeEvents(rows),correlations:weekCorrelations(wk.filter(w=>w.enough),{seed,permutations}),metrics:METRICS};
}
