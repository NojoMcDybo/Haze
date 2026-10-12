// Muster: Tagestypen (ähnliche 24-h-Verläufe), wiederkehrende Regeln mit Bestätigung in neueren Daten, ungewöhnliche Tage.
// Erklärbar statt Blackbox: k-Medoids mit Silhouette, Fisher-Test mit FDR, robuster Normalbereich (Median ± MAD).
// Feste Fragen statt freier Suche, beschreibend, keine Hypothesen über Insulin- oder KH-Mengen.
import {DAY,HOUR,MIN,dayStart,addDays,minuteOfDay} from './time.mjs';
import {mean,median,quantile,fdr,rng} from './stats.mjs';
import {slice} from './context.mjs';
const round=(v,d=0)=>v==null||!Number.isFinite(v)?null:Math.round(v*10**d)/10**d;
// ── Fisher-Test (2×2) ────────────────────────────────────────────
const LF=[0];const lf=n=>{for(let i=LF.length;i<=n;i++)LF[i]=LF[i-1]+Math.log(i);return LF[n];};
// a: Bedingung & Ergebnis, b: Bedingung & kein Ergebnis, c: sonst & Ergebnis, d: sonst & kein Ergebnis.
export function fisher(a,b,c,d,side='two'){
 const r1=a+b,r2=c+d,c1=a+c,n=r1+r2,p=x=>Math.exp(lf(r1)+lf(r2)+lf(c1)+lf(n-c1)-lf(n)-lf(x)-lf(r1-x)-lf(c1-x)-lf(r2-c1+x));
 const lo=Math.max(0,c1-r2),hi=Math.min(r1,c1),obs=p(a);let s=0;
 for(let x=lo;x<=hi;x++){const q=p(x);if(side==='greater'?x>=a:side==='less'?x<=a:q<=obs*(1+1e-7))s+=q;}
 return Math.min(1,s);
}
// ── Tagestypen ───────────────────────────────────────────────────
// Stundenmittel je Tag (24 Werte); bis zu 4 fehlende Stunden werden aus den Nachbarn ergänzt.
export function dayProfiles(clean,dayTable,tz,{minCoverage=.7}={}){
 const out=[];
 for(const d of dayTable){
  if(!(d.coverage>=minCoverage))continue;const from=dayStart(d.date,tz),list=slice(clean,from,dayStart(addDays(d.date,1),tz)),h=Array.from({length:24},()=>[]);
  for(const e of list)h[Math.min(23,Math.floor(minuteOfDay(e.time,tz)/60))].push(e.value);
  const v=h.map(x=>x.length?mean(x):null);if(v.filter(x=>x==null).length>4)continue;
  for(let i=0;i<24;i++)if(v[i]==null){let l=i,r=i;while(v[(l+23)%24]==null&&l>i-24)l--;while(v[(r+1)%24]==null&&r<i+24)r++;v[i]=(v[(l+23)%24]+v[(r+1)%24])/2;}
  out.push({date:d.date,v});
 }
 return out;
}
const dist=(a,b)=>{let s=0;for(let i=0;i<a.length;i++)s+=(a[i]-b[i])**2;return Math.sqrt(s);};
// k-Medoids (Voronoi-Iteration, k-means++-Start, mehrere Starts, deterministisch über seed).
export function kMedoids(points,k,{seed=7,restarts=6,iterations=30}={}){
 const n=points.length,D=points.map(a=>points.map(b=>dist(a,b))),r=rng(seed);let best=null;
 for(let s=0;s<restarts;s++){
  const med=[Math.floor(r()*n)];
  while(med.length<k){const w=points.map((_,i)=>Math.min(...med.map(m=>D[i][m]))**2),tot=w.reduce((x,y)=>x+y,0);let t=r()*tot,i=0;while(i<n-1&&(t-=w[i])>0)i++;med.push(i);}
  let assign=[];
  for(let it=0;it<iterations;it++){
   assign=points.map((_,i)=>{let bi=0;for(let j=1;j<k;j++)if(D[i][med[j]]<D[i][med[bi]])bi=j;return bi;});
   let changed=false;
   for(let j=0;j<k;j++){const mem=assign.map((a,i)=>a===j?i:-1).filter(i=>i>=0);if(!mem.length)continue;
    let bm=med[j],bc=Infinity;for(const c of mem){const cost=mem.reduce((x,i)=>x+D[i][c],0);if(cost<bc){bc=cost;bm=c;}}if(bm!==med[j]){med[j]=bm;changed=true;}}
   if(!changed)break;
  }
  const cost=assign.reduce((x,a,i)=>x+D[i][med[a]],0);if(!best||cost<best.cost)best={cost,medoids:[...med],assign};
 }
 // Silhouette: wie klar gehört jeder Tag zu seinem Typ (−1 … 1).
 const sil=points.map((_,i)=>{const own=best.assign[i],same=best.assign.map((a,j)=>a===own&&j!==i?D[i][j]:null).filter(x=>x!=null);if(!same.length)return 0;
  const a=mean(same),b=Math.min(...Array.from({length:k},(_,j)=>j).filter(j=>j!==own).map(j=>{const o=best.assign.map((x,m)=>x===j?D[i][m]:null).filter(x=>x!=null);return o.length?mean(o):Infinity;}));return (b-a)/Math.max(a,b);});
 return {...best,silhouette:mean(sil)};
}
const WINDOWS=[[0,6,'nachts'],[6,11,'morgens'],[11,15,'mittags'],[15,19,'nachmittags'],[19,24,'abends']];
const windowOf=h=>WINDOWS.find(([a,b])=>h>=a&&h<b)[2];
// Merkmale je Tag für „Was haben diese Tage gemeinsam?“ (nur vorhandene Daten zählen).
const DAY_FEATURES={
 weekend:{label:'Wochenende',get:(d,w)=>w>=5},
 training:{label:'Trainingstag',get:d=>d.steps!=null?d.activityMinutes>0:null},
 shortSleep:{label:'kurze Nacht davor (unter 6,5 h)',get:d=>d.sleepHours!=null?d.sleepHours<6.5:null},
 siteOld:{label:'Katheter ab Tag 2',get:d=>d.siteAge!=null?d.siteAge>=2:null},
 nightLow:{label:'Tief in der Nacht davor',get:d=>d.nightHypos!=null?d.nightHypos>0:null},
};
const weekdayOf=k=>{const [y,m,d]=k.split('-').map(Number);return (new Date(Date.UTC(y,m-1,d)).getUTCDay()+6)%7;};
export function dayTypes(profiles,dayTable,{seed=7,minDays=28,maxK=4}={}){
 if(profiles.length<minDays)return {status:'zu wenige Daten',n:profiles.length,types:[]};
 const pts=profiles.map(p=>p.v);let pick=null;
 for(let k=2;k<=Math.min(maxK,Math.floor(profiles.length/8));k++){const m=kMedoids(pts,k,{seed});if(!pick||m.silhouette>pick.silhouette+.02)pick={...m,k};}
 // Unter 0,25 sind die Gruppen kaum voneinander zu trennen: dann keine Typen behaupten.
 if(!pick||pick.silhouette<.25)return {status:'keine klaren Typen',n:profiles.length,silhouette:round(pick?.silhouette,2),types:[]};
 const byDate=new Map(dayTable.map(d=>[d.date,d])),overall=Array.from({length:24},(_,h)=>mean(pts.map(v=>v[h])));
 const types=Array.from({length:pick.k},(_,j)=>{
  const mem=profiles.filter((_,i)=>pick.assign[i]===j),prof=Array.from({length:24},(_,h)=>mean(mem.map(m=>m.v[h])));
  const peak=prof.indexOf(Math.max(...prof)),low=prof.indexOf(Math.min(...prof)),rows=mem.map(m=>byDate.get(m.date));
  return {id:j,n:mem.length,share:round(mem.length/profiles.length,2),profile:prof.map(v=>round(v)),dates:mem.map(m=>m.date),
   mean:round(mean(prof)),tir:round(median(rows.map(r=>r.tir).filter(Number.isFinite)),1),peak:{hour:peak,value:round(prof[peak]),window:windowOf(peak)},low:{hour:low,value:round(prof[low]),window:windowOf(low)},
   diff:round(mean(prof)-mean(overall))};
 }).sort((a,b)=>b.n-a.n);
 // Namen aus dem Verlauf: ruhigster Typ, sonst nach dem auffälligsten Abschnitt im Vergleich zum Durchschnittstag.
 const spread=t=>Math.max(...t.profile)-Math.min(...t.profile),calm=types.reduce((a,b)=>spread(a)<=spread(b)?a:b);
 types.forEach((t,i)=>{t.letter=String.fromCharCode(65+i);
  if(t===calm)t.name='Ruhiger Tag';
  else{const dev=t.profile.map((v,h)=>v-overall[h]),hi=dev.indexOf(Math.max(...dev)),lo=dev.indexOf(Math.min(...dev));
   t.name=Math.abs(dev[hi])>=Math.abs(dev[lo])?`Höher ${windowOf(hi)}`:`Niedriger ${windowOf(lo)}`;}});
 // Was haben die Tage eines Typs gemeinsam? Fisher-Test je Merkmal, FDR über alle Typen.
 const tests=[];
 for(const t of types)for(const [key,f] of Object.entries(DAY_FEATURES)){
  let a=0,b=0,c=0,d=0;
  for(const p of profiles){const row=byDate.get(p.date),v=f.get(row,weekdayOf(p.date));if(v==null)continue;const inT=t.dates.includes(p.date);if(inT)v?a++:b++;else v?c++:d++;}
  if(a+b<8||c+d<8||a+c<4)continue;
  tests.push({type:t.letter,key,label:f.label,a,b,c,d,shareIn:a/(a+b),shareOut:c/(c+d),p:fisher(a,b,c,d)});
 }
 const q=fdr(tests.map(t=>t.p));tests.forEach((t,i)=>{t.q=q[i];});
 for(const t of types)t.traits=tests.filter(x=>x.type===t.letter&&x.q<=.1&&Math.abs(x.shareIn-x.shareOut)>=.2)
  .map(x=>({key:x.key,label:x.label,more:x.shareIn>x.shareOut,shareIn:round(x.shareIn,2),shareOut:round(x.shareOut,2),q:x.q}));
 for(const t of types)delete t.dates;
 return {status:'gefunden',n:profiles.length,k:pick.k,silhouette:round(pick.silhouette,2),overall:overall.map(v=>round(v)),types};
}
// ── Wiederkehrende Regeln ───────────────────────────────────────
// Feste Fragen: Bedingung gegen Vergleichsgruppe, Ergebnis ja/nein. case(): {cond:true|false|null, outcome:true|false|null}.
const medianOf=(rows,k)=>median(rows.map(r=>r[k]).filter(Number.isFinite));
export const RULES=[
 {id:'training-night',scope:'days',cond:'an Trainingstagen',other:'an Tagen ohne Training',outcome:'einem Tief in der Nacht danach',
  case:(r,i,rows)=>({cond:r.steps!=null?r.activityMinutes>0:null,outcome:rows[i+1]?.nightHypos!=null?rows[i+1].nightHypos>0:null})},
 {id:'late-training',scope:'activities',cond:'nach Trainings ab 16 Uhr',other:'nach früheren Trainings',outcome:'einem späten Tief (2–24 h danach)',
  case:(a,_,__,tz)=>({cond:minuteOfDay(a.start,tz)>=16*60,outcome:a.lateHypos!=null?a.lateHypos>0:null})},
 {id:'exercise-mode',scope:'activities',cond:'bei Trainings ohne Sportmodus',other:'mit Sportmodus',outcome:'einem Tief während oder bis 2 h danach',needsPump:true,
  case:a=>({cond:!a.exerciseMode,outcome:!!a.hypoDuring})},
 {id:'site-age',scope:'days',cond:'mit Katheter ab Tag 2',other:'an Tag 0 und 1',outcome:'mehr als 25 % über 180',
  case:r=>({cond:r.siteAge!=null?r.siteAge>=2:null,outcome:r.tar!=null?r.tar>25:null})},
 {id:'short-sleep',scope:'days',cond:'nach Nächten unter 6,5 h',other:'nach längeren Nächten',outcome:'einem Mittelwert über deinem üblichen',
  case:(r,_,__,___,ctx)=>({cond:r.sleepHours!=null?r.sleepHours<6.5:null,outcome:r.mean!=null?r.mean>ctx.medianMean:null})},
 {id:'night-low-rebound',scope:'days',cond:'nach einem nächtlichen Tief',other:'nach Nächten ohne Tief',outcome:'mehr als 25 % über 180 am Tag',
  case:r=>({cond:r.nightHypos!=null?r.nightHypos>0:null,outcome:r.tar!=null?r.tar>25:null})},
 {id:'weekend',scope:'days',cond:'am Wochenende',other:'unter der Woche',outcome:'weniger als 70 % im Bereich',
  case:r=>({cond:weekdayOf(r.date)>=5,outcome:r.tir!=null?r.tir<70:null})},
 {id:'stress',scope:'days',cond:'an Tagen mit viel Stress (oberes Viertel)',other:'an anderen Tagen',outcome:'einem Mittelwert über deinem üblichen',
  case:(r,_,__,___,ctx)=>({cond:r.stressAvg!=null&&ctx.stress75!=null?r.stressAvg>=ctx.stress75:null,outcome:r.mean!=null?r.mean>ctx.medianMean:null})},
];
function table(rule,list,tz,ctx){
 let a=0,b=0,c=0,d=0;
 list.forEach((x,i)=>{const r=rule.case(x,i,list,tz,ctx);if(r.cond==null||r.outcome==null)return;if(r.cond)r.outcome?a++:b++;else r.outcome?c++:d++;});
 return {a,b,c,d};
}
const enough=t=>t.a+t.b>=5&&t.c+t.d>=5&&t.a+t.c>=3;
const rate=(x,y)=>x+y?x/(x+y):null;
// Entdeckt im Gesamtzeitraum; bestätigt, wenn es sich in den letzten confirmDays in dieselbe Richtung zeigt (einseitig p ≤ 0,1),
// nachdem es vorher schon zu sehen war. So lernt Haze nur, was sich wiederholt.
export function rules(rows,acts,{tz,confirmDays=42,hasPump=false}={}){
 const lastDay=rows.at(-1)?.date,cut=lastDay?addDays(lastDay,-(confirmDays-1)):null;
 const ctx=list=>({medianMean:medianOf(list,'mean'),stress75:(v=>v.length?quantile(v,.75):null)(list.map(r=>r.stressAvg).filter(Number.isFinite))});
 const split=(rule,list)=>rule.scope==='days'?[list.filter(r=>r.date<cut),list.filter(r=>r.date>=cut)]:[list.filter(a=>a.start<dayStart(cut,tz)),list.filter(a=>a.start>=dayStart(cut,tz))];
 const tested=RULES.filter(r=>!r.needsPump||hasPump).map(rule=>{
  const list=rule.scope==='days'?rows:acts,all=table(rule,list,tz,ctx(rows));
  if(!enough(all))return {id:rule.id,status:'zu wenige Daten',n:all.a+all.b};
  const [early,late]=cut?split(rule,list):[[],[]],te=table(rule,early,tz,ctx(rows)),tl=table(rule,late,tz,ctx(rows));
  return {id:rule.id,rule,...all,p:fisher(all.a,all.b,all.c,all.d),early:te,late:tl,status:'geprüft'};
 });
 const run=tested.filter(t=>t.status==='geprüft'),q=fdr(run.map(t=>t.p));run.forEach((t,i)=>{t.q=q[i];});
 const found=run.filter(t=>{const p1=rate(t.a,t.b),p0=rate(t.c,t.d);return t.q<=.1&&Math.abs(p1-p0)>=.15&&(p0===0?p1>0:p1/p0>=1.5||p1/p0<=1/1.5);}).map(t=>{
  const p1=rate(t.a,t.b),p0=rate(t.c,t.d),up=p1>p0,side=up?'greater':'less';
  // Bestätigung: vorher schon in dieselbe Richtung (p ≤ 0,1) und in den letzten Wochen wieder (p ≤ 0,1, mind. 3 Fälle).
  const pe=enough(t.early)?fisher(t.early.a,t.early.b,t.early.c,t.early.d,side):1,pl=t.late.a+t.late.b>=3&&t.late.c+t.late.d>=3?fisher(t.late.a,t.late.b,t.late.c,t.late.d,side):null;
  const lateDir=rate(t.late.a,t.late.b)!=null&&rate(t.late.c,t.late.d)!=null?(rate(t.late.a,t.late.b)>rate(t.late.c,t.late.d))===up:null;
  const confirmation=pe<=.1&&pl!=null&&pl<=.1?'bestätigt':pe<=.1&&lateDir===false?'nicht bestätigt':'noch offen';
  return {id:t.id,n:t.a+t.b,a:t.a,b:t.b,c:t.c,d:t.d,rate:round(p1,2),baseline:round(p0,2),q:t.q,direction:up?'häufiger':'seltener',confirmation,
   text:`${cap(t.rule.cond)} kam es in ${t.a} von ${t.a+t.b} Fällen zu ${t.rule.outcome}, ${t.rule.other} in ${t.c} von ${t.c+t.d}.`};
 });
 return {found,tested:tested.map(({rule,early,late,...t})=>t),confirmDays,cut};
}
const cap=s=>s[0].toUpperCase()+s.slice(1);
// ── Ungewöhnliche Tage ──────────────────────────────────────────
// Gegen den eigenen Normalbereich der 28 Tage davor (mind. 14 gültige): robuste z-Werte (Median, MAD mit Mindeststreuung,
// sonst wäre bei „unter 70“ mit meist 0 % jeder Tag mit Tief extrem), spürbarer Abstand und außerhalb von allem in diesen 28 Tagen.
const UNUSUAL={tir:{label:'Zeit im Bereich',unit:'%',min:15,floor:5,d:0},tbr:{label:'Zeit unter 70',unit:'%',min:4,floor:2,d:1},mean:{label:'Mittelwert',unit:'mg/dL',min:25,floor:8,d:0},cv:{label:'Schwankung',unit:'%',min:8,floor:3,d:0}};
export function unusualDays(rows,{z=3.5,window=28,limit=8}={}){
 const out=[];
 rows.forEach((r,i)=>{
  if(!r.valid)return;const prev=rows.slice(Math.max(0,i-window),i).filter(x=>x.valid);if(prev.length<14)return;
  const hits=Object.entries(UNUSUAL).map(([k,m])=>{const v=prev.map(x=>x[k]).filter(Number.isFinite),med=median(v),mad=Math.max(m.floor,1.4826*median(v.map(x=>Math.abs(x-med)))),zz=(r[k]-med)/mad;
   return Math.abs(zz)>=z&&Math.abs(r[k]-med)>=m.min&&(r[k]>Math.max(...v)||r[k]<Math.min(...v))?{key:k,label:m.label,unit:m.unit,value:round(r[k],m.d),usual:round(med,m.d),z:round(zz,1)}:null;}).filter(Boolean);
  if(hits.length)out.push({date:r.date,hits,score:Math.max(...hits.map(h=>Math.abs(h.z)))});
 });
 return out.sort((a,b)=>a.date<b.date?1:-1).slice(0,limit);
}
/** Alle Muster aus der Langzeit-Vorbereitung (P aus prepare, days: Tagestabelle ab dem ersten Tag mit Daten). */
export function patterns({P,days,tz,seed=7}){
 // Glukose nur an Tagen mit mindestens 12 h Tragezeit.
 const rows=days.map(d=>{const ok=d.coverage>=.5;return {...d,valid:ok,tir:ok?d.tir:null,tbr:ok?d.tbr:null,tar:ok?d.tar:null,mean:ok?d.mean:null,cv:ok?d.cv:null};});
 const hasPump=P.treatments.some(t=>t.type==='exercise_mode'||t.type==='basal');
 return {dayTypes:dayTypes(dayProfiles(P.clean,days,tz),days,{seed}),rules:rules(rows,P.acts,{tz,hasPump}),unusual:unusualDays(rows)};
}
// Gedächtnis: wann eine Regel zuerst und zuletzt gefunden wurde; früher gefundene, jetzt fehlende bleiben sichtbar.
export function remember(memory={},found,today){
 const next={...memory};
 for(const f of found){const m=next[f.id]||{first:today};next[f.id]={...m,last:today,text:f.text,confirmation:f.confirmation};}
 const gone=Object.entries(next).filter(([id])=>!found.some(f=>f.id===id)).map(([id,m])=>({id,...m}));
 return {memory:next,gone};
}
