import {test} from 'node:test';import assert from 'node:assert/strict';
import {MIN,HOUR,DAY,dayKey,dayStart,minuteOfDay,addDays,days} from '../shared/analysis/time.mjs';
import {quantile,ranks,spearman,spearmanTest,fdr,medianDifference,rng} from '../shared/analysis/stats.mjs';
import {merge,weights,summary,episodes,agp,gaps} from '../shared/analysis/glucose.mjs';
import {compressionLows,exclude} from '../shared/analysis/artifacts.mjs';
import {activityContext,nightWindows,nightContext,dayContext} from '../shared/analysis/context.mjs';
import {insights,HYPOTHESES,VARIABLES} from '../shared/analysis/insights.mjs';
import {analyze} from '../shared/analysis/index.mjs';
import {synthetic} from '../shared/analysis/synthetic.mjs';
const tz='Europe/Berlin',T0=Date.UTC(2026,5,1,22);// 2026-06-02 00:00 Ortszeit (Sommerzeit)
const series=(values,start=T0,step=5*MIN,source='share')=>values.map((value,i)=>({time:start+i*step,value,source}));

test('Ortszeit: Tag, Minute und Mitternacht auch über die Zeitumstellung',()=>{
 assert.equal(dayKey(T0,tz),'2026-06-02');assert.equal(minuteOfDay(T0+90*MIN,tz),90);
 assert.equal(dayStart('2026-06-02',tz),T0);
 const march=dayStart('2026-03-29',tz),next=dayStart('2026-03-30',tz);assert.equal(next-march,23*HOUR);
 const oct=dayStart('2026-10-25',tz);assert.equal(dayStart('2026-10-26',tz)-oct,25*HOUR);
 assert.equal(dayKey(oct+24.5*HOUR,tz),'2026-10-25');assert.equal(addDays('2026-12-31',1),'2027-01-01');assert.equal(days('2026-02-27','2026-03-01').length,3);
});
test('Statistik: Quantile, Ränge mit Bindungen, Spearman, FDR, reproduzierbar',()=>{
 assert.equal(quantile([1,2,3,4],.5),2.5);assert.deepEqual(ranks([10,20,20,30]),[1,2.5,2.5,4]);
 assert.equal(spearman([1,2,3,4,5],[2,4,8,16,32]),1);assert.equal(spearman([1,2,3,4,5],[5,4,3,2,1]),-1);
 const q=fdr([.01,.04,.03,.5]);assert.ok(q.every((v,i)=>v>=[.01,.04,.03,.5][i]-1e-12));assert.ok(q[0]<=q[1]);
 const x=Array.from({length:30},(_,i)=>i),y=x.map(v=>v*2+(v%3));
 const a=spearmanTest(x,y),b=spearmanTest(x,y);assert.deepEqual(a,b);assert.ok(a.p<.01&&a.ci[0]>.8);
 assert.ok(medianDifference([10,11,12,13],[1,2,3,4]).ci[0]>0);
});
test('Quellen zusammenführen: Share gewinnt, Pumpe füllt nur Lücken',()=>{
 const m=merge([{time:0,value:100,source:'pump'},{time:60000,value:104,source:'share'},{time:600000,value:110,source:'pump'},{time:600000,value:999,source:'share'}]);
 assert.deepEqual(m.map(e=>[e.time,e.source]),[[60000,'share'],[600000,'pump']]);
});
test('Zeitgewichtung: Lücken zählen nicht, Konsens-Kennzahlen stimmen',()=>{
 const flat=series(Array(288).fill(100));const s=summary(flat,T0,T0+DAY);
 assert.equal(Math.round(s.tir),100);assert.ok(Math.abs(s.gmi-(3.31+2.392))<1e-9);assert.equal(s.cv,0);assert.equal(s.gri,0);assert.equal(s.sufficient,false);
 // 1 h Tief alle 5 min + danach 3 h Messlücke + 1 Wert: Gewicht der Lücke höchstens 5 min.
 const w=weights([{time:0,value:60},{time:3*HOUR,value:150}]);assert.deepEqual(w,[5*MIN,5*MIN]);
 const mixed=series([...Array(12).fill(50),...Array(12).fill(260)]);const m=summary(mixed,T0,T0+2*HOUR);
 assert.equal(Math.round(m.tbr54),50);assert.equal(Math.round(m.tar250),50);assert.equal(m.gri,100);
 assert.equal(gaps(series([100,100]),T0,T0+HOUR).length,1);
});
test('Episoden: 15 Minuten Beginn, 15 Minuten Erholung, Lücke beendet',()=>{
 assert.equal(episodes(series([100,65,65,100,100,100]),{below:70}).length,0);
 const e=episodes(series([100,65,62,60,100,72,100,100,100]),{below:70});assert.equal(e.length,1);assert.equal(e[0].extreme,60);assert.equal(e[0].complete,true);
 const twice=episodes(series([65,65,65,100,65,65,65]),{below:70});assert.equal(twice.length,1,'kurze Erholung beendet nicht');
 const cut=episodes([...series([65,65,65]),{time:T0+HOUR,value:65,source:'share'}],{below:70});assert.equal(cut[0].complete,false);
 assert.equal(episodes(series([260,270,280,200]),{above:250}).length,1);
});
test('AGP: 96 Viertelstunden mit geordneten Perzentilen',()=>{
 const d=synthetic({days:14,end:T0+14*DAY});const a=agp(d.glucose,tz);
 assert.equal(a.length,96);assert.ok(a.every(b=>b.n>0&&b.p5<=b.p25&&b.p25<=b.p50&&b.p50<=b.p75&&b.p75<=b.p95));
});
test('Kompressionstief erkannt, echtes langsames Tief und gegessenes Tief nicht',()=>{
 const night=T0+2*HOUR;
 const cl=series([120,118,85,60,58,95,118,120],night);
 const found=compressionLows(cl,{tz});assert.equal(found.length,1);assert.equal(found[0].nadir,58);
 assert.equal(exclude(cl,found).length,2);
 assert.equal(compressionLows(series([120,110,100,90,80,70,62,60,62,65,70,80],night),{tz}).length,0,'langsam');
 assert.equal(compressionLows(cl,{tz,treatments:[{time:night+20*MIN,type:'bolus',carbs:15}]}).length,0,'KH gegessen');
 assert.equal(compressionLows(series([120,118,85,60,58,95,118,120],T0+14*HOUR),{tz}).length,0,'tagsüber');
});
test('Aktivität: Startwert, Abfall, spätes Tief, Modus und Störfaktoren',()=>{
 const g=series([...Array(12).fill(150),...[140,130,120,110,100,95,95,100,110,120,130,140],...Array(60).fill(140),...Array(6).fill(60),...Array(30).fill(120)]);
 const a={id:'x',start:T0+HOUR,end:T0+2*HOUR,type:'running',avgHr:150};
 const [c]=activityContext(g,[a],{treatments:[{time:T0+30*MIN,type:'bolus',insulin:2,carbs:20},{time:T0+50*MIN,type:'exercise_mode',duration:90}]});
 assert.equal(c.startValue,140);assert.equal(c.drop,45);assert.equal(c.lateHypos,1);assert.equal(c.exerciseMode,true);assert.equal(c.carbsAround,20);assert.equal(c.bolusBefore,2);
});
test('Nächte ohne Garmin: Konsens-Nacht 0–6 Uhr; Tage: Basal aus Raten',()=>{
 const w=nightWindows([],['2026-06-02'],tz);assert.equal(w[0].start,T0);assert.equal(w[0].end,T0+6*HOUR);
 const n=nightContext(series(Array(72).fill(110)),w);assert.equal(n[0].tir,100);assert.equal(n[0].source,'clock');
 const d=dayContext(series(Array(288).fill(110)),['2026-06-02'],tz,{treatments:[{time:T0,type:'basal',rate:1,duration:120},{time:T0+3*HOUR,type:'bolus',insulin:3,carbs:30}]});
 assert.equal(d[0].basal,2);assert.equal(d[0].bolus,3);assert.equal(d[0].carbs,30);assert.equal(d[0].tir,100);
});
test('Jede Hypothese hat Textbausteine',()=>{for(const h of HYPOTHESES){assert.ok(VARIABLES[h.x]?.more,h.x);assert.ok(VARIABLES[h.y]?.subject,h.y);}});
test('Hinweise: eingebaute Zusammenhänge gefunden, Zufall nicht',()=>{
 const end=T0+90*DAY,a=analyze(synthetic({days:90,end}),{from:end-90*DAY,to:end,tz,permutations:499});
 const ids=a.insights.found.map(f=>f.id);
 assert.ok(ids.includes('nights:cv:score:0'),ids.join());assert.ok(ids.includes('days:activityMinutes:nightTbr:1'),ids.join());
 assert.ok(a.insights.found.find(f=>f.id==='nights:cv:score:0').rho<0);
 assert.ok(a.insights.found.every(f=>!/insulin|bolus|kohlenhydrat|dosis/i.test(f.text)),'keine Therapiehinweise');
 const r=rng(123),rows=Array.from({length:60},()=>({steps:r()*1e4,tir:r()*100,mean:100+r()*80,tbr:r()*5,stressAvg:r()*60,cv:20+r()*20}));
 assert.equal(insights({days:rows,nights:[],activities:[]},{permutations:499}).found.length,0,'reines Rauschen ergibt keinen Hinweis');
});
test('Gesamtanalyse: Lücken, Artefakte, Hinweise zur Belastbarkeit, deterministisch',()=>{
 const end=T0+30*DAY,data=synthetic({days:30,end,gapDays:[10,11]});
 const a=analyze(data,{from:end-30*DAY,to:end,tz,permutations:199}),b=analyze(data,{from:end-30*DAY,to:end,tz,permutations:199});
 assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
 assert.ok(a.quality.gaps.some(g=>g.minutes>=2*1440-10));assert.ok(a.summary.coverage<.95);
 assert.equal(a.days.length,30);assert.ok(a.nights.every(n=>n.source==='garmin'));
 assert.ok(a.caveats.some(c=>/Control-IQ/.test(c)));assert.ok(a.caveats[0].includes('keine Therapieempfehlung'));
 const empty=analyze({glucose:[]},{from:T0,to:T0+DAY,tz});assert.equal(empty.summary.mean,null);assert.equal(empty.insights.found.length,0);
});
