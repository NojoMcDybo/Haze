import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import * as model from '../shared/model.mjs';
const require=createRequire(import.meta.url),{NotchBridge,activity,pulseActivity,trend}=require('../desktop/notch-bridge.cjs');
const now=10_000_000,feed=(v,prev=v,age=3)=>({entries:[{time:now-(age+5)*60000,value:prev,trend:null},{time:now-age*60000,value:v,trend:'Flat'}],error:null});
const config={unit:'mg/dL',staleMinutes:10,source:'nightscout',notch:true};
function bridge(events=[]){const calls=[];const request=(opts,cb)=>{const call={method:opts.method,path:opts.path,body:''};calls.push(call);const listeners={};return {on(e,f){listeners[e]=f;return this},write(d){call.body+=d},end(){
  const body=opts.method==='GET'?JSON.stringify(typeof events==='function'?events():events):'';
  const res={statusCode:200,resume(){},setEncoding(){},on(e,f){if(e==='data')setImmediate(()=>f(body));if(e==='end')setImmediate(()=>setImmediate(f));}};cb(res);}};};
 let interval=null,timeout=null;const b=new NotchBridge({model,request,setInterval:f=>{interval=f;return 1},clearInterval:()=>{interval=null},setTimeout:f=>{timeout=f;return 2},clearTimeout:()=>{timeout=null}});
 return {b,calls,tick:()=>interval?.(),poll:async()=>{const f=timeout;timeout=null;f?.();await new Promise(r=>setTimeout(r,20));},get interval(){return interval},get timeout(){return timeout}};}
const posts=calls=>calls.filter(c=>c.method==='POST');
test('Notch-Aktivität: Wert, Trend, Änderung, Verlauf, Farben',()=>{
 const a=activity(model,feed(112,115),config,now).activity;assert.equal(a.value,112);assert.equal(a.subtitle,'→ −3 · vor 3 Min.');assert.equal(a.color,'#E8EFEF');assert.equal(a.ttl,900);assert.equal(a.id,'haze:bg');assert.equal(a.title,'Blutzucker');assert.ok(a.icon.startsWith('data:image/svg+xml;base64,'));assert.equal('open' in a,false);
 assert.equal(a.trend,'flat');assert.equal(a.delta,-3);assert.equal(a.pid,process.pid);
 assert.deepEqual(a.chart,{low:70,high:180,points:[[now-8*60000,115],[now-3*60000,112]],ranges:[3,6,12,24],range:3});
 assert.equal(activity(model,feed(196,188),config,now).activity.color,'#EDBC56');assert.equal(activity(model,feed(64,70),config,now).activity.color,'#FF7971');
 const stale=activity(model,feed(112,115,18),config,now);assert.equal(stale.activity.subtitle,'Messung veraltet · vor 18 Min.');assert.equal(stale.activity.color,'#8E9A9B');assert.equal(stale.stale,true);
 assert.equal('trend' in stale.activity,false);assert.equal('delta' in stale.activity,false);assert.equal(stale.activity.chart.points.length,2);
 const mm=activity(model,feed(118,100),{...config,unit:'mmol/L'},now).activity;assert.equal(mm.value,'6,6');assert.equal(mm.chart.low,3.9);assert.equal(mm.chart.points[1][1],6.6);assert.equal(mm.delta,1);
 assert.equal(activity(model,{entries:[]},config,now),null);
 assert.equal(activity(model,feed(112,115),{...config,source:'demo'},now,'C:/Haze.exe').activity.open,'C:/Haze.exe');});
test('Verlauf: nur die letzten 24 h',()=>{
 const entries=Array.from({length:600},(_,i)=>({time:now-(599-i)*300000,value:100,trend:'Flat'}));
 const a=activity(model,{entries},config,now).activity;assert.equal(a.chart.points.length,289);assert.equal(a.chart.points[0][0],now-288*300000);});
test('Trend: Sensorwert zuerst, sonst Dexcom-Schwellen 1/2/3 mg/dL pro Minute',()=>{
 const pts=(...d)=>d.map((v,i)=>({time:now-(d.length-1-i)*300000,value:v,trend:null}));
 assert.equal(trend([{time:now,value:100,trend:'DoubleDown'}]),'down2');
 assert.equal(trend(pts(100,102,104,106)),'flat');      // 0,4/min
 assert.equal(trend(pts(100,107,114,121)),'up45');      // 1,4/min
 assert.equal(trend(pts(160,148,136,124)),'down');      // −2,4/min
 assert.equal(trend(pts(100,117,134,151)),'up2');       // 3,4/min
 assert.equal(trend(pts(100)),null);});
test('Notch-Bridge: dedupliziert, alarmiert einmal beim Bereichswechsel, hält TTL frisch, entfernt sich',async()=>{const n=bridge(),b=n.b;
 b.update(feed(112,115),config,now);b.update(feed(112,115),config,now);
 assert.equal(n.calls[0].method,'DELETE');assert.equal(n.calls[0].path,'/activity/haze-bz'); // alte id einmal weg
 assert.equal(posts(n.calls).length,1);assert.equal(JSON.parse(posts(n.calls)[0].body).alert,false);
 b.update(feed(196,188),config,now);assert.equal(JSON.parse(posts(n.calls)[1].body).alert,true);
 b.update(feed(200,196),config,now);assert.equal(JSON.parse(posts(n.calls)[2].body).alert,false);
 n.tick();assert.equal(JSON.parse(posts(n.calls)[3].body).value,200);
 b.update(feed(200,196),{...config,notch:false},now);const last=n.calls.at(-1);assert.equal(last.method,'DELETE');assert.equal(last.path,'/activity/haze:bg');assert.equal(n.interval,null);assert.equal(b.active,false);
 const count=n.calls.length;assert.equal(await b.remove(),false);assert.equal(n.calls.length,count);});
test('Doppelklick in der Notch: "open"-Ereignis ruft onOpen, alte Ereignisse und Neustart der Notch nicht',async()=>{
 let events=[{seq:4,activity:'haze:bg',action:'open',ts:1}];const n=bridge(()=>events);let opened=0;
 n.b.listen(()=>opened++);await n.poll();assert.equal(opened,0);                 // Altlast beim Start ignorieren
 events=[...events,{seq:5,activity:'folio-x',action:'open',ts:2},{seq:6,activity:'haze:bg',action:'open',ts:3}];await n.poll();assert.equal(opened,1);
 await n.poll();assert.equal(opened,1);                                            // nicht doppelt
 events=[{seq:1,activity:'haze:bg',action:'open',ts:4}];await n.poll();assert.equal(opened,1); // Notch neu gestartet: nur Basis zuruecksetzen
 events=[...events,{seq:2,activity:'haze:bg',action:'open',ts:5}];await n.poll();assert.equal(opened,2);
 n.b.stop();assert.equal(n.timeout,null);});
test('Notch nicht erreichbar: kein Fehler, kein Absturz',async()=>{const b=new NotchBridge({model,request:()=>{throw Error('ECONNREFUSED')},setInterval:()=>1,clearInterval:()=>{}});b.update(feed(112,115),config,now);assert.equal(await b.send('POST','/activity',{}),false);assert.equal(await b.get('/events'),null);});
test('Garmin-Puls an die Notch: nur live, mit pulse-Feld, Vorrang vor Helio',()=>{
 const g=(over={})=>({connected:true,name:'Forerunner 265',reading:{bpm:128,at:now-2000,contact:true},...over});
 const a=pulseActivity(g(),now);assert.equal(a.id,'haze:hr');assert.equal(a.app,'Haze');assert.equal(a.value,128);assert.equal(a.pulse,128);assert.equal(a.unit,'bpm');
 assert.equal(a.subtitle,'Forerunner 265 · live');assert.equal(a.ttl,15);assert.equal(a.priority,1);assert.ok(a.icon.startsWith('data:image/svg+xml;base64,'));
 assert.equal(pulseActivity(g({connected:false}),now),null);
 assert.equal(pulseActivity(g({reading:null}),now),null);
 assert.equal(pulseActivity(g({reading:{bpm:128,at:now-11000,contact:true}}),now),null);   // älter als 10 s
 assert.equal(pulseActivity(g({reading:{bpm:128,at:now-1000,contact:false}}),now),null);   // kein Hautkontakt
 assert.equal(pulseActivity(g({reading:{bpm:128,at:now-1000,contact:null}}),now).value,128); // Kontakt unbekannt: zeigen
 assert.equal(pulseActivity(g(),now,'C:/Haze.exe').open,'C:/Haze.exe');});
test('Notch-Bridge Puls: sendet bei neuem Wert, sonst höchstens alle 5 s, entfernt sich ohne Messung',()=>{const n=bridge(),b=n.b;
 const g=(bpm,at=now)=>({connected:true,name:'',reading:{bpm,at,contact:true}});
 b.pulse(g(120),config,now);b.pulse(g(120),config,now+1000);assert.equal(posts(n.calls).length,1);assert.equal(JSON.parse(posts(n.calls)[0].body).subtitle,'Garmin · live');
 b.pulse(g(121,now+2000),config,now+2000);assert.equal(posts(n.calls).length,2);
 b.pulse(g(121,now+6000),config,now+7100);assert.equal(posts(n.calls).length,3);                 // Wach halten
 assert.equal(b.pulseActive,true);
 b.pulse({connected:false,reading:null},config,now+8000);const del=n.calls.at(-1);assert.equal(del.method,'DELETE');assert.equal(del.path,'/activity/haze:hr');assert.equal(b.pulseActive,false);
 const count=n.calls.length;b.pulse({connected:false,reading:null},config,now+9000);assert.equal(n.calls.length,count); // nicht doppelt löschen
 b.pulse(g(130,now+10000),{...config,notch:false},now+10000);assert.equal(n.calls.length,count);});
