import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import crypto from 'node:crypto';
import {openStore} from '../shared/store.mjs';
import {startSink,route,mask,docId} from '../shared/sync/tandem-sink.mjs';
import {planTandem,childEnv,FEATURES} from '../shared/sync/tandem.mjs';
import {addDays} from '../shared/analysis/time.mjs';
const tmp=()=>path.join(fs.mkdtempSync(path.join(os.tmpdir(),'haze-tandem-')),'haze.db');
const sha1=s=>crypto.createHash('sha1').update(s).digest('hex');
const BY='Pump (tconnectsync)';
// Anfragen wie tconnectsync (nightscout.py): Header api-secret = SHA1, bei Schreibzugriffen zusätzlich ?api_secret=.
function client(sink,secret=sink.secret){
 const h={'api-secret':sha1(secret)};
 return {
  get:p=>fetch(sink.url+p,{headers:h}).then(async r=>({status:r.status,body:r.status===200?await r.json():null})),
  post:(entity,body)=>fetch(`${sink.url}api/v1/${entity}?api_secret=${secret}`,{method:'POST',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify(body)}),
  put:(entity,body)=>fetch(`${sink.url}api/v1/${entity}?api_secret=${secret}`,{method:'PUT',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify(body)}),
  del:entity=>fetch(`${sink.url}api/v1/${entity}?api_secret=${secret}`,{method:'DELETE',headers:{...h,'Content-Type':'application/json'},body:'{}'}),
 };
}
test('Empfänger: nur bekannte Pfade',()=>{
 assert.deepEqual(route('GET','/api/v1/status.json'),{collection:'status'});
 assert.equal(route('POST','/api/v1/treatments').collection,'treatments');assert.equal(route('GET','/api/v1/entries.json').collection,'entries');
 assert.equal(route('GET','/api/v1/profile/current').sub,'current');assert.equal(route('DELETE','/api/v1/treatments/tandem:Sleep:1').sub,'tandem:Sleep:1');
 for(const [m,p] of [['GET','/api/v1/food'],['DELETE','/api/v1/entries/1'],['POST','/api/v2/treatments'],['GET','/../settings.json'],['PUT','/api/v1/treatments'],['GET','/api/v1/treatments/../../x']])assert.equal(route(m,p),null,`${m} ${p}`);
});
test('Empfänger: Geheimnis, Loopback-Host, Größe und JSON werden geprüft',async()=>{
 const store=openStore(tmp()),sink=await startSink({store});
 try{
  assert.equal((await client(sink).get('api/v1/status.json')).status,200);
  assert.equal((await client(sink,'falsch').get('api/v1/status.json')).status,401);
  assert.equal((await fetch(sink.url+'api/v1/status.json')).status,401,'ohne Geheimnis');
  assert.equal((await fetch(sink.url+'api/v1/food',{headers:{'api-secret':sha1(sink.secret)}})).status,404);
  const wrongHost=await new Promise(r=>http.get({host:'127.0.0.1',port:sink.port,path:'/api/v1/status.json',headers:{Host:'evil.example','api-secret':sha1(sink.secret)}},res=>{res.resume();r(res.statusCode);}));
  assert.equal(wrongHost,403);
  assert.equal((await fetch(`${sink.url}api/v1/treatments?api_secret=${sink.secret}`,{method:'POST',headers:{'Content-Type':'text/plain'},body:'x'})).status,415);
  const big=await fetch(`${sink.url}api/v1/treatments?api_secret=${sink.secret}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'['+'0,'.repeat(6e6)+'0]'}).catch(()=>({status:413}));
  assert.equal(big.status,413);
  assert.ok(sink.stats.rejected>=6);
 }finally{await sink.close();store.close();}
 const s2=openStore(tmp()),a=await startSink({store:s2}),b=await startSink({store:s2});
 assert.notEqual(a.secret,b.secret,'Einmal-Geheimnis pro Lauf');assert.notEqual(a.port,b.port);await a.close();await b.close();s2.close();
});
test('Empfänger: Behandlungen, CGM, Gerätestatus, Profil landen in haze.db; „letzter Upload“ und Löschen wie Nightscout',async()=>{
 const store=openStore(tmp()),sink=await startSink({store}),c=client(sink);
 try{
  const t0=Date.UTC(2026,9,5,8);
  const iso=t=>new Date(t).toISOString();
  assert.equal((await c.post('treatments',{eventType:'Combo Bolus',created_at:iso(t0),carbs:45,insulin:4.2,notes:'Standard',enteredBy:BY,pump_event_id:'101'})).status,200);
  await c.post('treatments',[{eventType:'Temp Basal',created_at:iso(t0+3600e3),absolute:.8,rate:.8,duration:30,enteredBy:BY,pump_event_id:'102'},{eventType:'Sleep',created_at:iso(t0-8*3600e3),duration:420,enteredBy:BY,pump_event_id:'103'},{eventType:'CGM Alert',created_at:iso(t0-2*3600e3),notes:'Niedrig',enteredBy:BY,pump_event_id:'104'},{eventType:'Site Change',created_at:iso(t0+7200e3),enteredBy:BY,pump_event_id:'105'}]);
  await c.post('entries',[{type:'sgv',sgv:112,date:t0,dateString:iso(t0),device:BY},{type:'sgv',sgv:118,date:t0+300e3,dateString:iso(t0+300e3),device:BY}]);
  await c.post('devicestatus',{created_at:iso(t0),pump:{battery:{voltage:3.9,percent:76}},device:BY,pump_event_id:'106'});
  await c.put('profile',{defaultProfile:'A',store:{A:{dia:'5'}},created_at:iso(t0),enteredBy:BY});
  const d=store.load(t0-86400e3,t0+86400e3);
  assert.deepEqual(d.glucose.map(g=>[g.value,g.source]),[[112,'pump'],[118,'pump']]);
  const types=d.treatments.map(t=>t.type).sort();assert.deepEqual(types,['basal','bolus','sleep_mode']);
  const bolus=d.treatments.find(t=>t.type==='bolus');assert.equal(bolus.carbs,45);assert.equal(bolus.insulin,4.2);assert.equal(bolus.source,'pump');
  assert.equal(d.treatments.find(t=>t.type==='basal').rate,.8);
  assert.deepEqual(d.deviceEvents.map(e=>e.type).sort(),['alarm','site']);
  assert.equal(store.get("select value from series where kind='pump_battery'").value,76);
  // letzter Upload je eventType und Zeitraum (wie last_uploaded_entry)
  const r=await c.get(`api/v1/treatments?count=1&find[enteredBy]=${encodeURIComponent(BY)}&find[eventType]=Combo%20Bolus&find[created_at][$gte]=${encodeURIComponent(iso(t0-3600e3))}&find[created_at][$lte]=${encodeURIComponent(iso(t0+3600e3))}`);
  assert.equal(r.body.length,1);assert.equal(r.body[0].created_at,iso(t0));assert.equal(r.body[0]._id,docId('treatments',{eventType:'Combo Bolus',pump_event_id:'101'}));
  assert.deepEqual((await c.get(`api/v1/treatments?count=1&find[eventType]=Combo%20Bolus&find[created_at][$gte]=${encodeURIComponent(iso(t0+60e3))}`)).body,[]);
  assert.equal((await c.get('api/v1/entries.json?count=1&find[device]=x')).body[0].sgv,118);
  assert.equal((await c.get('api/v1/profile/current')).body.defaultProfile,'A');
  // Schlafmodus wird von tconnectsync ersetzt: alten Eintrag löschen
  const sleep=(await c.get('api/v1/treatments?count=1&find[eventType]=Sleep')).body[0];
  assert.equal((await c.del(`treatments/${sleep._id}`)).status,200);
  assert.equal(store.load(t0-86400e3,t0+86400e3).treatments.some(t=>t.type==='sleep_mode'),false);
  // erneut gesendete Dokumente überschreiben statt zu verdoppeln
  await c.post('treatments',{eventType:'Combo Bolus',created_at:iso(t0),carbs:45,insulin:4.2,enteredBy:BY,pump_event_id:'101'});
  assert.equal(store.load(t0-86400e3,t0+86400e3).treatments.filter(t=>t.type==='bolus').length,1);
  // Nightscout-Treatments aus anderer Quelle bleiben unberührt
  assert.equal(store.get("select count(*) n from treatment where source<>'pump'").n,0);
 }finally{await sink.close();store.close();}
});
test('Protokolle: geheime Werte und api_secret werden entfernt',()=>{
 const s='Login als nojo@example.com mit Passwort Gehe1m!# · GET /api/v1/treatments?api_secret=abc123def&x=1 · api-secret: '+'a'.repeat(40);
 const m=mask(s,['nojo@example.com','Gehe1m!#']);
 assert.ok(!m.includes('nojo@example.com')&&!m.includes('Gehe1m!#')&&!m.includes('abc123def')&&!m.includes('a'.repeat(40)),m);
 assert.ok(mask('pw=Gehe1m%21%23',['Gehe1m!#']).includes('***'),'auch URL-kodiert');
});
test('Kindprozess: nur nötige Umgebung, keine .env, kein Token-Cache',()=>{
 const env=childEnv({PATH:'C:\\x',SystemRoot:'C:\\Windows',GITHUB_TOKEN:'geheim',API_SECRET:'ns',NODE_OPTIONS:'--x'},{email:'e',password:'p',url:'http://127.0.0.1:1/',secret:'s'});
 assert.equal(env.GITHUB_TOKEN,undefined);assert.equal(env.API_SECRET,undefined);assert.equal(env.NODE_OPTIONS,undefined);
 assert.equal(env.CACHE_CREDENTIALS,'false');assert.equal(env.TCONNECT_REGION,'EU');assert.equal(env.NS_SECRET,'s');assert.equal(env.PATH,'C:\\x');
 assert.ok(FEATURES.includes('CGM')&&FEATURES.includes('CGM_ALERTS')&&!FEATURES.includes('IOB'));
});
test('tconnectsync-Plan: erst ab Rückblick, dann ab Cursor mit einem Tag Überlappung',()=>{
 const first=planTandem({today:'2026-10-07',backfillDays:180,addDays});
 assert.deepEqual(first[0],{start:'2026-04-11',end:'2026-04-17'});assert.equal(first.length,3);
 assert.deepEqual(planTandem({cursor:'2026-10-06',today:'2026-10-07',addDays}),[{start:'2026-10-05',end:'2026-10-07'}]);
 assert.equal(planTandem({cursor:'2020-01-01',today:'2026-10-07',backfillDays:30,addDays})[0].start,'2026-09-08');
});
