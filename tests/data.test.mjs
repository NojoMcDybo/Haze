import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openStore,backupsToDelete} from '../shared/store.mjs';
import {syncNightscout,mapTreatment,mapEntry} from '../shared/sync/nightscout.mjs';
import {parseClarity,parseCsv} from '../shared/sync/clarity.mjs';
import {normalizeDay,activities,planDays,gmt} from '../shared/sync/garmin-connect.mjs';
import {detectGaps} from '../shared/sync/gaps.mjs';
import {addDays} from '../shared/analysis/time.mjs';
const tz='Europe/Berlin',T0=Date.UTC(2026,5,1,22),MIN=60000,HOUR=3600000,DAY=86400000;
const tmp=()=>path.join(fs.mkdtempSync(path.join(os.tmpdir(),'haze-')),'haze.db');

test('Datenbank: Schema, Upsert ohne Duplikate, Laden für die Analyse, Sicherung',()=>{
 const file=tmp(),s=openStore(file);
 assert.equal(s.get('pragma user_version').user_version,1);
 s.upsert('glucose',[{time:T0,value:100,source:'share'},{time:T0,value:101,source:'share'},{time:T0+60000,value:99,source:'pump'}]);
 s.upsert('activity',[{id:'a',start:T0,end:T0+HOUR,type:'running',avgHr:140}]);
 s.upsert('daily',[{date:'2026-06-02',steps:1000,intensityMinutes:30}]);
 const d=s.load(T0,T0+DAY);assert.equal(d.glucose.length,2);assert.equal(d.glucose[0].value,101);assert.equal(d.activities[0].avgHr,140);assert.equal(d.daily[0].intensityMinutes,30);
 s.setState('x',{cursor:5});s.setState('x',{last_error:'kaputt'});assert.equal(s.state('x').cursor,5);assert.equal(s.state('x').last_error,'kaputt');
 s.putRaw('garmin','sleep','2026-06-02',{a:1});assert.deepEqual(s.getRaw('garmin','sleep','2026-06-02').json,{a:1});
 const b=path.join(path.dirname(file),'b.db');s.backup(b);assert.ok(fs.statSync(b).size>0);
 s.close();const again=openStore(file);assert.equal(again.stats().glucose.n,2);again.close();
});
test('Sicherungen: 7 Tage täglich, dann eine pro Woche bis 8 Wochen',()=>{
 const names=Array.from({length:80},(_,i)=>`haze-${addDays('2026-10-07',-i)}.db`);
 const del=new Set(backupsToDelete(names,'2026-10-07'));const kept=names.filter(n=>!del.has(n));
 assert.ok(kept.includes('haze-2026-10-07.db')&&kept.includes('haze-2026-10-01.db'));assert.ok(kept.length<=7+9);assert.ok(del.has(names.at(-1)));
});
test('Nightscout-Behandlungen: Pumpe, Modi, Geräteereignisse',()=>{
 const m=x=>mapTreatment({_id:'1',created_at:'2026-06-01T22:00:00Z',...x});
 assert.equal(m({eventType:'Combo Bolus',insulin:2.5,carbs:30,enteredBy:'tconnectsync'}).type,'bolus');
 assert.equal(m({eventType:'Combo Bolus',insulin:2.5,enteredBy:'tconnectsync'}).source,'pump');
 assert.equal(m({eventType:'Temp Basal',absolute:.85,duration:30}).rate,.85);assert.equal(m({eventType:'Temp Basal',absolute:.85}).type,'basal');
 assert.equal(m({eventType:'Sleep',duration:480}).type,'sleep_mode');assert.equal(m({eventType:'Exercise',duration:60}).type,'exercise_mode');
 assert.equal(m({eventType:'Basal Suspension'}).type,'suspend');assert.equal(m({eventType:'Site Change'}).type,'site');assert.equal(m({eventType:'Sensor Start'}).type,'sensor_start');
 assert.equal(m({eventType:'Carb Correction',carbs:15}).type,'carbs');assert.equal(m({eventType:'Note',notes:'x'}).type,'note');
 assert.equal(m({eventType:'Bolus'}).time,T0);
 assert.equal(m({eventType:'Sensor Stop',enteredBy:'Pump (tconnectsync)'}).type,'sensor_stop');assert.equal(m({eventType:'CGM Alert',enteredBy:'Pump (tconnectsync)'}).type,'alarm');
 assert.equal(m({eventType:'Combo Bolus',insulin:1,enteredBy:'Pump (tconnectsync)'}).source,'pump');assert.equal(mapEntry({date:T0,sgv:99,type:'sgv',device:'Pump (tconnectsync)'}).source,'pump');
 assert.equal(mapEntry({date:T0,sgv:120,device:'tconnectsync'}).source,'pump');assert.equal(mapEntry({date:T0,sgv:120,type:'mbg'}),null);
});
test('Nightscout-Sync: Fenster, Cursor, nur GET, Pumpe getrennt',async()=>{
 const s=openStore(tmp()),calls=[];
 const fetcher=async(u,o)=>{calls.push(String(u));assert.equal(o.method,undefined);const q=u.searchParams;
  if(u.pathname.endsWith('/entries/sgv.json')){const a=+q.get('find[date][$gte]'),b=+q.get('find[date][$lt]');const out=[];for(let t=Math.ceil(a/(5*MIN))*5*MIN;t<b;t+=5*MIN)out.push({date:t,sgv:110,type:'sgv',device:t%(10*MIN)?'nightscout-connect':'tconnectsync'});return {ok:true,status:200,json:async()=>out};}
  if(u.pathname.endsWith('/treatments.json'))return {ok:true,status:200,json:async()=>[{_id:'b1',eventType:'Combo Bolus',insulin:3,carbs:40,created_at:new Date(T0+DAY).toISOString(),enteredBy:'tconnectsync'}]};
  return {ok:true,status:200,json:async()=>[]};};
 const now=T0+3*DAY,r=await syncNightscout({url:'http://127.0.0.1:1337',store:s,fetcher,now,backfillDays:3});
 assert.ok(r.entries>=800);assert.equal(s.load(T0,now).treatments.length,1);
 const src=s.stats().sources.map(x=>x.source).sort();assert.deepEqual(src,['pump','share']);
 calls.length=0;await syncNightscout({url:'http://127.0.0.1:1337',store:s,fetcher,now:now+HOUR,backfillDays:3});
 assert.ok(calls.filter(c=>c.includes('entries')).length<=2,'zweiter Lauf nur ab Cursor');
 await assert.rejects(syncNightscout({url:'http://evil.example',store:s,fetcher}),/HTTPS/);
});
const CSV_EN=`Index,Timestamp (YYYY-MM-DDThh:mm:ss),Event Type,Event Subtype,Patient Info,Device Info,Source Device ID,Glucose Value (mg/dL),Insulin Value (u),Carb Value (grams),Duration (hh:mm:ss),Glucose Rate of Change (mg/dL/min),Transmitter Time (Long Integer),Transmitter ID
1,,FirstName,,Max,,,,,,,,,
2,,Device,,,"G7 Mobile App",iOS,,,,,,,
10,2026-06-02T00:00:00,EGV,,,,iOS,105,,,,,,
11,2026-06-02T00:05:00,EGV,,,,iOS,Low,,,,,,
12,2026-06-02T00:10:00,EGV,,,,iOS,High,,,,,,
13,2026-06-02T07:30:00,Carbs,,,,iOS,,,45,,,,
14,2026-06-02T07:31:00,Insulin,Fast-Acting,,,iOS,,4.5,,,,,
15,2026-06-02T03:00:00,Alert,Urgent Low,,,iOS,,,,,,,
16,2026-06-02T18:00:00,Exercise,Heavy,,,iOS,,,,00:45:00,,,`;
const CSV_DE=`Index;Zeitstempel (JJJJ-MM-TTThh:mm:ss);Ereignistyp;Ereignisuntertyp;Patienteninfo;Geräteinfo;Quellgeräte-ID;Glukosewert (mmol/l);Insulinwert (IE);Kohlenhydratwert (Gramm);Dauer (hh:mm:ss)
10;2026-06-02T00:00:00;EGW;;;;iOS;5,8;;;
11;2026-06-02T00:05:00;EGW;;;;iOS;Niedrig;;;`;
test('Clarity-Import: englisch und deutsch, Ortszeit, Low/High, Ereignisse',()=>{
 assert.deepEqual(parseCsv('a,"b,c",d\n1,"x""y",2'),[['a','b,c','d'],['1','x"y','2']]);
 const en=parseClarity(CSV_EN,tz);
 assert.equal(en.glucose.length,3);assert.equal(en.glucose[0].time,T0);assert.equal(en.glucose[1].value,39);assert.equal(en.glucose[2].value,401);
 assert.equal(en.treatments.find(t=>t.type==='carbs').carbs,45);assert.equal(en.treatments.find(t=>t.type==='bolus').insulin,4.5);
 assert.equal(en.treatments.find(t=>t.type==='exercise').duration,45);assert.equal(en.deviceEvents[0].type,'alarm');
 const de=parseClarity(CSV_DE,tz);assert.equal(de.glucose.length,2);assert.ok(Math.abs(de.glucose[0].value-104.4)<.01);assert.equal(de.glucose[1].value,39);
 assert.throws(()=>parseClarity('a,b\n1,2',tz),/Clarity/);
});
test('Garmin: Tagesdaten, Schlaf mit Phasen, Stress, Body Battery, Aktivitäten (angenommene Formate)',()=>{
 const raw={
  daily:{calendarDate:'2026-06-02',totalSteps:12345,moderateIntensityMinutes:20,vigorousIntensityMinutes:10,restingHeartRate:52,averageStressLevel:-1,bodyBatteryHighestValue:88,bodyBatteryLowestValue:12},
  sleep:{dailySleepDTO:{calendarDate:'2026-06-02',sleepStartTimestampGMT:T0-HOUR,sleepEndTimestampGMT:T0+6*HOUR,deepSleepSeconds:3600,lightSleepSeconds:14400,remSleepSeconds:5400,awakeSleepSeconds:1800,sleepScores:{overall:{value:81}}},
   sleepLevels:[{startGMT:'2026-06-01T21:00:00.0',endGMT:'2026-06-01T22:00:00.0',activityLevel:1},{startGMT:'2026-06-01T22:00:00.0',endGMT:'2026-06-01T23:00:00.0',activityLevel:0}],restingHeartRate:50},
  stress:{stressValuesArray:[[T0,25],[T0+180000,-1]],bodyBatteryValuesArray:[[T0,'MEASURED',60,2.0]]},
  heartRate:{heartRateValues:[[T0,58],[T0+120000,null]]},
  steps:[{startGMT:'2026-06-01T22:00:00.0',endGMT:'2026-06-01T22:15:00.0',steps:120}],
  hrv:{hrvSummary:{lastNightAvg:47,status:'BALANCED'}},
 };
 const d=normalizeDay('2026-06-02',raw);
 assert.deepEqual([d.daily[0].steps,d.daily[0].intensityMinutes,d.daily[0].stressAvg],[12345,40,null]);
 assert.equal(d.sleep[0].score,81);assert.equal(d.sleep[0].deep,60);assert.equal(d.sleep[0].hrv,47);assert.deepEqual(d.stages.map(s=>s.stage),['light','deep']);
 assert.equal(d.series.filter(s=>s.kind==='stress').length,1);assert.equal(d.series.find(s=>s.kind==='body_battery').value,60);assert.equal(d.series.find(s=>s.kind==='steps').time,T0);
 assert.equal(d.hr.length,1);
 const a=activities([{activityId:9,startTimeGMT:'2026-06-02 15:00:00',duration:2700,activityType:{typeKey:'running'},averageHR:150,activityTrainingLoad:80,aerobicTrainingEffect:3.1}]);
 assert.equal(a[0].start,gmt('2026-06-02 15:00:00'));assert.equal(a[0].end-a[0].start,45*MIN);assert.equal(a[0].id,'garmin:9');
 assert.deepEqual(normalizeDay('x',{}),{daily:[],sleep:[],stages:[],series:[],hr:[]});
});
test('Garmin-Tagesplan: letzte 3 Tage immer, dann Fehlendes rückwärts, mit Budget',()=>{
 const done=new Set(['2026-10-03','2026-10-02']);
 const p=planDays({today:'2026-10-07',done,backfillDays:10,budget:5,addDays});
 assert.deepEqual(p,['2026-10-07','2026-10-06','2026-10-05','2026-10-04','2026-10-01']);
});
test('Lücken: erkennen, kurze Aussetzer ignorieren, offenes Ende bis jetzt',()=>{
 const times=[];for(let t=T0;t<T0+DAY;t+=5*MIN)times.push(t);for(let t=T0+3*DAY;t<T0+4*DAY;t+=5*MIN)times.push(t);
 const g=detectGaps(times,{from:T0,to:T0+4*DAY,now:T0+10*DAY});
 assert.equal(g.length,1);assert.equal(g[0].status,'offen');assert.equal(g[0].end,T0+3*DAY);assert.equal(g[0].minutes,Math.round((2*DAY+5*MIN)/MIN));
 assert.equal(detectGaps([T0,T0+20*MIN,T0+40*MIN],{from:T0,to:T0+45*MIN,now:T0+45*MIN}).length,0,'20 min Aussetzer < 30 min');
 const open=detectGaps(times,{from:T0,to:T0+10*DAY,now:T0+5*DAY});assert.equal(open.at(-1).end,T0+5*DAY);
});
