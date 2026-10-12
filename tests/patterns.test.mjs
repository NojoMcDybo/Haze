import {test} from 'node:test';import assert from 'node:assert/strict';
import {fisher,kMedoids,dayTypes,unusualDays,remember,rules} from '../shared/analysis/patterns.mjs';
import {longterm} from '../shared/analysis/longterm.mjs';
import {synthetic} from '../shared/analysis/synthetic.mjs';
import {rng} from '../shared/analysis/stats.mjs';
import {addDays} from '../shared/analysis/time.mjs';
const tz='Europe/Berlin',END=Date.UTC(2026,9,11,12),DAY=86400000;
const gauss=r=>{let s=0;for(let i=0;i<6;i++)s+=r();return (s-3)*1.41;};

test('Fisher-Test: bekannte Werte (Lady Tasting Tea)',()=>{
 assert.ok(Math.abs(fisher(3,1,1,3)-.4857)<1e-3);assert.ok(Math.abs(fisher(3,1,1,3,'greater')-.2429)<1e-3);
 assert.ok(fisher(10,0,0,10)<1e-4);assert.equal(fisher(0,5,0,5),1);
});
test('Tagestypen: zwei klar verschiedene Verläufe werden getrennt, benannt und beschrieben',()=>{
 const r=rng(5),profiles=[],table=[];
 for(let i=0;i<60;i++){const date=addDays('2026-06-01',i),peak=i%2===0;
  profiles.push({date,v:Array.from({length:24},(_,h)=>120+gauss(r)*6+(peak&&h>=18&&h<23?85:0))});
  table.push({date,coverage:1,tir:peak?70:98,steps:8000,activityMinutes:peak?(i%6===0?0:45):0});}
 const t=dayTypes(profiles,table);assert.equal(t.status,'gefunden');assert.equal(t.k,2);assert.ok(t.silhouette>.5);
 const names=t.types.map(x=>x.name).sort();assert.deepEqual(names,['Höher abends','Ruhiger Tag']);
 const high=t.types.find(x=>x.name==='Höher abends');assert.equal(high.n,30);assert.equal(high.peak.window,'abends');
 assert.ok(high.traits.some(x=>x.key==='training'&&x.more),'Trainingstag als gemeinsames Merkmal fehlt');
 // Reines Rauschen: keine Typen behaupten.
 const noise=Array.from({length:60},(_,i)=>({date:addDays('2026-06-01',i),v:Array.from({length:24},()=>130+gauss(r)*10)}));
 assert.equal(dayTypes(noise,table).status,'keine klaren Typen');
 assert.equal(dayTypes(noise.slice(0,20),table).status,'zu wenige Daten');
});
test('k-Medoids ist reproduzierbar',()=>{
 const r=rng(9),pts=Array.from({length:40},(_,i)=>[i<20?0:10,gauss(r)]);
 assert.deepEqual(kMedoids(pts,2,{seed:3}).assign,kMedoids(pts,2,{seed:3}).assign);
});
test('Regeln und ungewöhnliche Tage in künstlichen Daten; Bestätigung in neueren Wochen',()=>{
 const r=longterm(synthetic({days:240,end:END,tz,longterm:true,shiftDay:160,unusual:[228,200]}),{from:END-240*DAY,to:END,tz,permutations:99}),p=r.patterns;
 const night=p.rules.found.find(f=>f.id==='training-night');assert.ok(night,'Training → Tief in der Nacht fehlt');
 assert.equal(night.confirmation,'bestätigt');assert.match(night.text,/zu einem Tief in der Nacht danach/);assert.equal(night.direction,'häufiger');
 assert.ok(p.rules.found.some(f=>f.id==='exercise-mode'&&f.direction==='häufiger'));
 // Die zwei eingebauten Infekt-Tage (12 und 40 Tage vor Schluss) sind ungewöhnlich, aber nicht jeder Tag mit einem Tief.
 const first=r.period.firstDay,sick=[addDays(first,240-12),addDays(first,240-40)];
 for(const d of sick)assert.ok(p.unusual.some(u=>u.date===d&&u.hits.some(h=>h.key==='mean')),`ungewöhnlicher Tag ${d} fehlt`);
 assert.ok(p.unusual.length<=6);
});
test('Ohne Pumpendaten keine Sportmodus-Regel; mit wenigen Fällen keine Aussage',()=>{
 const rows=Array.from({length:30},(_,i)=>({date:addDays('2026-06-01',i),valid:true,tir:80,mean:130,tar:10,steps:5000,activityMinutes:i%2?30:0,nightHypos:0}));
 const res=rules(rows,[],{tz,hasPump:false});assert.ok(!res.tested.some(t=>t.id==='exercise-mode'));assert.equal(res.found.length,0);
});
test('Ungewöhnlich: Mindeststreuung verhindert Fehlalarme bei meist 0 % unter 70',()=>{
 const rows=Array.from({length:40},(_,i)=>({date:addDays('2026-06-01',i),valid:true,tir:90,mean:130,cv:25,tbr:i%7===3?2.5:0}));
 assert.equal(unusualDays(rows).length,0);
 rows[39]={...rows[39],tbr:12,tir:70};const u=unusualDays(rows);assert.equal(u.length,1);assert.ok(u[0].hits.some(h=>h.key==='tbr'&&h.value===12));
});
test('Gedächtnis: zuerst gesehen bleibt, verschwundene Regeln bleiben sichtbar',()=>{
 let m=remember({},[{id:'a',text:'A',confirmation:'noch offen'}],'2026-08-01').memory;
 m=remember(m,[{id:'a',text:'A',confirmation:'bestätigt'},{id:'b',text:'B',confirmation:'noch offen'}],'2026-09-01').memory;
 assert.equal(m.a.first,'2026-08-01');assert.equal(m.a.last,'2026-09-01');assert.equal(m.a.confirmation,'bestätigt');
 const r=remember(m,[{id:'b',text:'B',confirmation:'bestätigt'}],'2026-10-01');
 assert.deepEqual(r.gone.map(g=>[g.id,g.last]),[['a','2026-09-01']]);assert.equal(r.memory.b.first,'2026-09-01');
});
