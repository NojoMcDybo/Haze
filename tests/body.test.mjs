import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {bodyDay,bodyDays,bodyTrends,bucket,bodyAverage} from '../shared/analysis/body.mjs';
import {synthetic} from '../shared/analysis/synthetic.mjs';
import {openStore} from '../shared/store.mjs';
import {addDays,dayStart,HOUR,MIN} from '../shared/analysis/time.mjs';
const tz='Europe/Berlin',END=Date.UTC(2026,9,11,12);

test('Zeitfenster: Mittel je Fenster und Summe je Stunde',()=>{
 const pts=[{time:0,value:10},{time:60000,value:20},{time:HOUR+1,value:5}];
 assert.deepEqual(bucket(pts,0,2*HOUR,HOUR),[{time:0,value:15},{time:HOUR,value:5}]);
 assert.deepEqual(bucket(pts,0,2*HOUR,HOUR,{sum:true}).map(x=>x.value),[30,5]);
});
test('Schlaf und Tag aus künstlichen Daten: Nacht mit Phasen und Glukose, Tag mit Verläufen',()=>{
 const d=synthetic({days:30,end:END,tz,body:true}),days=bodyDays(d,tz);
 assert.equal(days[0],'2026-10-11');assert.ok(days.indexOf('2026-10-10')===1);
 const r=bodyDay(d,{day:'2026-10-10',tz,now:END}),n=r.night;
 assert.ok(n&&n.stages.length>8&&n.stages.every(s=>s.end>n.start&&s.start<n.end));
 assert.ok(n.glucose.every(e=>e.time>=n.from&&e.time<n.to)&&n.glucose.length>80);
 assert.ok(['deep','light','rem'].every(k=>n.stages.some(s=>s.stage===k)));
 assert.ok(n.glucoseSummary.tir!=null&&n.hr.length>100);
 const t=r.today;assert.equal(t.from,dayStart('2026-10-10',tz));
 assert.ok(t.bodyBattery.length>50&&t.stress.length>50&&t.steps.length<=24&&t.steps.length>5);
 assert.ok(t.stress.every(x=>x.value>=0&&x.value<=100));assert.ok(t.daily?.steps>0);
 // Ein Tag ohne Schlaf: keine Nacht, aber der Tag.
 const none=bodyDay({...d,sleeps:[]},{day:'2026-10-10',tz,now:END});assert.equal(none.night,null);assert.ok(none.today.glucose.length);
});
test('4 Wochen: höher, niedriger, üblich gegen die mittlere Hälfte der 28 Tage davor',()=>{
 const day='2026-10-10',daily=Array.from({length:40},(_,i)=>({date:addDays(day,i-39),steps:5000+(i%4)*100,rhr:50,stressAvg:30}));
 daily.at(-1).steps=9000;daily.at(-1).rhr=44;
 const t=bodyTrends({daily,sleeps:[]},{day,tz}),by=k=>t.find(x=>x.key===k);
 assert.equal(by('steps').status,'höher');assert.equal(by('rhr').status,'niedriger');assert.equal(by('stressAvg').status,'üblich');
 assert.equal(by('steps').series.length,28);assert.equal(by('sleepScore').status,null);
 assert.equal(bodyTrends({daily:daily.slice(-5),sleeps:[]},{day,tz}).find(x=>x.key==='steps').usual,null);// zu wenige Tage
});
test('Datenbank: Körperdaten ohne Trainingsdetails',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'haze-body-')),s=openStore(path.join(dir,'h.db'));
 s.upsert('series',[{kind:'stress',time:1000,source:'garmin',value:20},{kind:'activity_hr',time:1000,source:'garmin',value:150},{kind:'body_battery',time:2000,source:'garmin',value:60}]);
 s.upsert('sleep_stage',[{night:'2026-10-10',start:500,end:1500,stage:'deep'}]);s.upsert('hr',[{time:1000,source:'garmin',bpm:55}]);
 const b=s.body(0,5000);assert.deepEqual(b.series.map(x=>x.kind).sort(),['body_battery','stress']);assert.equal(b.stages.length,1);assert.equal(b.hr[0].bpm,55);
 s.close();fs.rmSync(dir,{recursive:true,force:true});
});
test('Durchschnitt: Nächte ab dem Einschlafen übereinander, Tage nach Uhrzeit',()=>{
 const d=synthetic({days:30,end:END,tz,body:true}),days=bodyDays(d,tz).slice(0,14),a=bodyAverage(d,{days,tz});
 assert.equal(a.days,14);assert.ok(a.night.n>=13);
 // Anteile je Fenster ergeben zusammen 100 %, der Anfang der Nacht ist leicht/tief, nicht wach.
 for(const b of a.night.stageShare)assert.ok(Math.abs(b.awake+b.rem+b.light+b.deep-1)<.01);
 const first=a.night.stageShare[0];assert.ok(first.light+first.deep>.8,JSON.stringify(first));
 assert.ok(a.night.glucose.every(b=>b.p25<=b.p50&&b.p50<=b.p75));assert.ok(a.night.metrics.hours>6);
 assert.equal(a.day.glucose.length,96);assert.ok(a.day.bodyBattery.length>60&&a.day.stress.length>60);
 assert.equal(a.day.steps.length,24);assert.equal(a.day.steps[3].mean,0);assert.ok(a.day.steps[12].mean>0);// nachts keine Schritte
 // Ein einzelner Tag bekommt die 14 Tage davor als „üblich“; der Tag selbst zählt nicht mit.
 const day=days[0],prev=bodyDays(d,tz).filter(k=>k<day).slice(0,14),u=bodyAverage(d,{days:prev,tz});assert.ok(!prev.includes(day)&&u.night.n>=13);
 assert.equal(bodyAverage(d,{days:[],tz}).night,null);
});
