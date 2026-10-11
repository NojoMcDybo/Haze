import {test} from 'node:test';import assert from 'node:assert/strict';
import {rng,theilSen,mannKendall,meanDifference,tQuantile975,changePoints,normalCdf} from '../shared/analysis/stats.mjs';
import {longterm,changeEvents,comparePeriods,weekOf,monthName} from '../shared/analysis/longterm.mjs';
import {synthetic} from '../shared/analysis/synthetic.mjs';
import {addDays} from '../shared/analysis/time.mjs';
const tz='Europe/Berlin',END=Date.UTC(2026,9,11,12),DAY=86400000;
const noise=(n,seed=3,s=5)=>{const r=rng(seed);return Array.from({length:n},()=>{let x=0;for(let i=0;i<6;i++)x+=r();return (x-3)*1.41*s;});};

test('Trendstatistik: Theil-Sen, Mann-Kendall, Normalverteilung',()=>{
 const x=[0,1,2,3,4,5,6,7,8,9],y=x.map(v=>2*v+1);y[4]=99;// ein Ausreißer ändert die Steigung nicht
 assert.equal(theilSen(x,y).slope,2);
 assert.ok(mannKendall(x.map(v=>v+(v%2)*.5)).p<.01);assert.equal(mannKendall([5,5,5,5,5]).p,1);
 assert.ok(Math.abs(normalCdf(1.96)-.975)<1e-4&&Math.abs(normalCdf(0)-.5)<1e-9);
});
test('Wendepunkte: Bruch wird gefunden, reines Rauschen bleibt ohne Bruch',()=>{
 const n=noise(120),shifted=n.map((v,i)=>v+(i>=70?-15:0));
 const c=changePoints(shifted);assert.equal(c.length,1);assert.ok(Math.abs(c[0]-70)<=3,`Bruch bei ${c[0]}`);
 for(const seed of [1,2,4,5,6])assert.deepEqual(changePoints(noise(120,seed)),[],`Scheinbruch bei Seed ${seed}`);
 // Zusammenhängende Tage (AR(1)) erzeugen ohne Bruch keine Scheinbrüche.
 const r=noise(150,9);for(let i=1;i<r.length;i++)r[i]+=.7*r[i-1];assert.deepEqual(changePoints(r),[]);
});
test('Unterschied zweier Zeiträume: kalibriert auch bei zusammenhängenden Tagen',()=>{
 const ar=(n,seed,phi)=>{const x=noise(n,seed);for(let i=1;i<n;i++)x[i]+=phi*x[i-1];return x;};
 // Gleiche Verteilung: Intervall ohne 0 höchstens in etwa 5–8 % der Fälle (28 Tage je Seite).
 for(const phi of [0,.4]){let fp=0;for(let s=1;s<=400;s+=2){const r=meanDifference(ar(28,s,phi),ar(28,s+1,phi));if(r.ci[0]>0||r.ci[1]<0)fp++;}assert.ok(fp<=18,`phi ${phi}: ${fp}/200`);}
 const a=noise(28,11),up=meanDifference(a,noise(28,12).map(v=>v+10));assert.ok(up.ci[0]>0&&up.p<.01);
 assert.ok(tQuantile975(1e6)-1.96<1e-3&&Math.abs(tQuantile975(10)-2.228)<.01);
});
test('Wochen und Monate: Montag als Wochenanfang, Monatsnamen',()=>{
 assert.equal(weekOf('2026-10-11'),'2026-10-05');assert.equal(weekOf('2026-10-05'),'2026-10-05');
 assert.equal(monthName('2026-03'),'März 2026');
});
test('Langzeit: Wendepunkt, Vergleich und Wochen-Zusammenhang in künstlichen Daten',()=>{
 const data=synthetic({days:240,end:END,tz,longterm:true,shiftDay:160}),r=longterm(data,{from:END-240*DAY,to:END,tz,permutations:299});
 const shiftDate=addDays(r.period.firstDay,160);
 const ev=r.changes.find(c=>c.shifts.some(s=>s.key==='mean'));assert.ok(ev,'Wendepunkt im Mittelwert fehlt');
 assert.ok(Math.abs(new Date(ev.date)-new Date(shiftDate))<=7*DAY,`${ev.date} statt ${shiftDate}`);
 assert.ok(ev.shifts.find(s=>s.key==='mean').diff<=-10);
 assert.ok(r.trends.find(t=>t.key==='mean').status==='fallend');
 const steps=r.correlations.found.find(f=>f.x==='steps'&&f.y==='mean');assert.ok(steps&&steps.rho<0,'Schritte ↔ Mittelwert fehlt');
 assert.equal(r.months.length,9);assert.ok(r.months[0].partial&&!r.months[1].partial);
 assert.ok(r.weeks.every(w=>w.validDays<=7));
 // Glukose-Hinweise ohne Pumpe/Garmin: keine Hypothesen über Insulin.
 assert.ok(!r.correlations.tested.some(t=>t.x==='tdd'||t.y==='tdd'));
});
test('Langzeit: Verschiebung in den letzten 4 Wochen wird als klar niedriger eingeordnet',()=>{
 const data=synthetic({days:120,end:END,tz,longterm:true,shiftDay:92,shiftDelta:-20}),r=longterm(data,{from:END-120*DAY,to:END,tz,permutations:299});
 const c=r.comparisons.find(c=>c.id==='4w'),mean=c.metrics.find(m=>m.key==='mean');
 assert.equal(mean.status,'niedriger');assert.ok(mean.diff<=-10&&mean.ci[1]<0);
 const tbr=c.metrics.find(m=>m.key==='tbr');if(tbr.status==='höher')assert.equal(tbr.towardTarget,false);
});
test('Langzeit: Mit wenigen Tagen keine Vergleiche, Trends oder Zusammenhänge',()=>{
 const data=synthetic({days:10,end:END,tz}),r=longterm(data,{from:END-180*DAY,to:END,tz,permutations:99});
 assert.equal(r.period.days,10);// führende Tage ohne Daten abgeschnitten
 assert.equal(r.comparisons.length,0);assert.ok(r.trends.every(t=>t.status==='zu wenige Daten'));
 assert.equal(r.correlations.found.length,0);assert.ok(r.caveats.some(c=>/Erst 10 Tage/.test(c)));
 const empty=longterm({glucose:[]},{from:END-30*DAY,to:END,tz});assert.equal(empty.weeks.length,0);
});
test('Gleichzeitige Veränderungen und zu kleine Zeiträume',()=>{
 const rows=Array.from({length:90},(_,i)=>{const date=addDays('2026-06-01',i),after=i>=50,n=noise(90,21,3)[i];
  return {date,valid:true,tir:80+(after?10:0)+n,mean:140+(after?-15:0)-n,tbr:2,steps:6000+(after?3000:0)+n*100,sleepHours:7+n/30};});
 const ev=changeEvents(rows);assert.equal(ev.length,1);assert.equal(ev[0].date,addDays('2026-06-01',50));
 assert.deepEqual(ev[0].shifts.map(s=>s.key).sort(),['mean','tir']);
 assert.deepEqual(ev[0].context.map(c=>c.key),['steps']);assert.ok(ev[0].context[0].diff>2000);
 const small=comparePeriods(rows.slice(0,5),rows.slice(5,30),['tir']);assert.equal(small[0].status,'zu wenige Daten');
});
