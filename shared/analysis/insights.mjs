// Hinweise mit Leitplanken: nur beschreibend, Mindestanzahl, Permutationstest, Bootstrap-Intervall, FDR-Korrektur.
// Bewusst keine Hypothesen über Insulin oder Kohlenhydrate: Haze gibt keine Therapiehinweise.
import {spearmanTest,fdr,median,medianDifference} from './stats.mjs';
const de=(v,d=0)=>v==null?'—':v.toLocaleString('de-DE',{maximumFractionDigits:d,minimumFractionDigits:d});
// more: „An Tagen mit …“ (Dativ), subject: Satzsubjekt für die Zielgröße.
export const VARIABLES={
 steps:{more:'mehr Schritten',fmt:v=>de(Math.round(v/100)*100)},
 intensityMinutes:{more:'mehr Intensitätsminuten',fmt:v=>de(v)+' min'},
 activityMinutes:{more:'längerem Training',fmt:v=>de(v)+' min'},
 activityLoad:{more:'höherer Trainingsbelastung',fmt:v=>de(v)},
 stressAvg:{more:'höherem Stress (Garmin)',fmt:v=>de(v)},
 bbMax:{more:'höherer Body Battery',fmt:v=>de(v)},
 rhr:{more:'höherem Ruhepuls',fmt:v=>de(v)+' bpm'},
 sleepScore:{more:'höherem Schlafwert in der Nacht davor',fmt:v=>de(v)},
 sleepHours:{more:'längerem Schlaf in der Nacht davor',fmt:v=>de(v,1)+' h'},
 hrv:{more:'höherer nächtlicher HRV',subject:'die HRV',fmt:v=>de(v)+' ms'},
 score:{subject:'der Schlafwert',fmt:v=>de(v)},
 deep:{subject:'der Tiefschlaf',fmt:v=>de(v)+' min'},
 alarms:{more:'mehr CGM-Alarmen',fmt:v=>de(v)},
 hypos:{more:'mehr Tiefs',fmt:v=>de(v)},
 tir:{more:'mehr Zeit im Bereich',subject:'die Zeit im Bereich',fmt:v=>de(v)+' %'},
 tbr:{subject:'die Zeit unter 70',event:'zu Werten unter 70',fmt:v=>de(v,1)+' %'},
 mean:{more:'höherem Glukosemittel',subject:'der Glukosemittelwert',fmt:v=>de(v)+' mg/dL'},
 cv:{more:'stärkerer Glukoseschwankung',subject:'die Schwankung (CV)',fmt:v=>de(v)+' %'},
 nightTbr:{subject:'die Zeit unter 70 in der Nacht danach',event:'in der Nacht danach zu Werten unter 70',fmt:v=>de(v,1)+' %'},
 minutes:{more:'längerer Dauer',fmt:v=>de(v)+' min'},
 avgHr:{more:'höherem Durchschnittspuls',fmt:v=>de(v)+' bpm'},
 trainingEffect:{more:'höherem Trainingseffekt',fmt:v=>de(v,1)},
 drop:{subject:'der Abfall bis 2 h danach',fmt:v=>de(v)+' mg/dL'},
 lateHypos:{subject:'die Zahl später Tiefs (2–24 h danach)',event:'zu einem späten Tief (2–24 h danach)',fmt:v=>de(v,1)},
};
// scope: Tabelle; lag: y aus dem Folgeeintrag (Tag d+lag).
export const HYPOTHESES=[
 {scope:'days',x:'steps',y:'tir'},{scope:'days',x:'steps',y:'mean'},{scope:'days',x:'steps',y:'tbr'},
 {scope:'days',x:'intensityMinutes',y:'tbr'},{scope:'days',x:'intensityMinutes',y:'nightTbr',lag:1},
 {scope:'days',x:'activityMinutes',y:'nightTbr',lag:1},{scope:'days',x:'activityLoad',y:'tir',lag:1},
 {scope:'days',x:'stressAvg',y:'mean'},{scope:'days',x:'stressAvg',y:'cv'},{scope:'days',x:'bbMax',y:'tir'},
 {scope:'days',x:'sleepScore',y:'tir'},{scope:'days',x:'sleepHours',y:'mean'},{scope:'days',x:'hrv',y:'tir'},{scope:'days',x:'rhr',y:'mean'},
 {scope:'nights',x:'cv',y:'score'},{scope:'nights',x:'hypos',y:'score'},{scope:'nights',x:'alarms',y:'score'},
 {scope:'nights',x:'tir',y:'hrv'},{scope:'nights',x:'mean',y:'deep'},
 {scope:'activities',x:'minutes',y:'drop'},{scope:'activities',x:'avgHr',y:'drop'},{scope:'activities',x:'trainingEffect',y:'lateHypos'},
];
const MIN_N={days:14,nights:14,activities:10};
function pairs(rows,{x,y,lag=0}){
 const out=[];for(let i=0;i+lag<rows.length;i++){const a=rows[i][x],b=rows[i+lag][y];if(Number.isFinite(a)&&Number.isFinite(b))out.push([a,b]);}
 return out;
}
const lead={days:'An Tagen',nights:'In Nächten',activities:'Bei Trainings'};
const pct=v=>Math.round(v*100)+' %',cases={days:'der Tage',nights:'der Nächte',activities:'der Trainings'};
const share=a=>a.length?a.filter(v=>v>0).length/a.length:0;
function describe(h,res,groups){
 const X=VARIABLES[h.x],Y=VARIABLES[h.y],later=h.lag&&!/Nacht danach/.test(Y.subject)?' am Folgetag':'';
 const strength=Math.abs(res.rho)>=.5?'Deutlicher':'Mäßiger';
 const top=`${lead[h.scope]} mit ${X.more} (oberes Drittel, ab ${X.fmt(groups.high.min)})`,tail=`${strength} Zusammenhang, n = ${res.n}.`;
 // Seltene Ereignisse (Tiefs): Median ist meist 0, darum Häufigkeit statt Median.
 if(Y.event)return `${top} kam es in ${pct(groups.high.share)} ${cases[h.scope]} ${Y.event}${later}, im unteren Drittel (bis ${X.fmt(groups.low.max)}) in ${pct(groups.low.share)}. ${tail}`;
 return `${top} lag ${Y.subject}${later} im Median bei ${Y.fmt(groups.high.median)}, im unteren Drittel (bis ${X.fmt(groups.low.max)}) bei ${Y.fmt(groups.low.median)}. ${tail}`;
}
export function insights(tables,{seed=7,permutations=999,bootstrap=999,alpha=.1,minRho=.3}={}){
 const tested=[];
 for(const h of HYPOTHESES){
  const rows=tables[h.scope]||[],p=pairs(rows,h),min=MIN_N[h.scope];
  if(p.length<min||new Set(p.map(v=>v[0])).size<4||new Set(p.map(v=>v[1])).size<3){tested.push({...h,n:p.length,status:'zu wenige Daten'});continue;}
  const res=spearmanTest(p.map(v=>v[0]),p.map(v=>v[1]),{permutations,bootstrap,seed});
  const sorted=[...p].sort((a,b)=>a[0]-b[0]),k=Math.floor(sorted.length/3),lo=sorted.slice(0,k),hi=sorted.slice(-k);
  const groups={low:{n:lo.length,max:lo.at(-1)[0],median:median(lo.map(v=>v[1])),share:share(lo.map(v=>v[1]))},high:{n:hi.length,min:hi[0][0],median:median(hi.map(v=>v[1])),share:share(hi.map(v=>v[1]))}};
  tested.push({...h,...res,groups,difference:medianDifference(hi.map(v=>v[1]),lo.map(v=>v[1]),{bootstrap,seed}),status:'geprüft'});
 }
 const run=tested.filter(t=>t.status==='geprüft'),q=fdr(run.map(t=>t.p));run.forEach((t,i)=>{t.q=q[i];});
 const found=run.filter(t=>t.rho!=null&&Math.abs(t.rho)>=minRho&&t.q<=alpha&&t.ci&&(t.ci[0]>0||t.ci[1]<0))
  .map(t=>({id:`${t.scope}:${t.x}:${t.y}:${t.lag||0}`,scope:t.scope,x:t.x,y:t.y,lag:t.lag||0,n:t.n,rho:t.rho,ci:t.ci,p:t.p,q:t.q,
   strength:Math.abs(t.rho)>=.5?'deutlich':'mäßig',direction:t.rho>0?'gleichläufig':'gegenläufig',groups:t.groups,difference:t.difference,text:describe(t,t,t.groups)}))
  .sort((a,b)=>Math.abs(b.rho)-Math.abs(a.rho));
 return {found,tested:tested.map(({groups,difference,...t})=>t)};
}
