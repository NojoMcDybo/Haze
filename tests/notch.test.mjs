import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import * as model from '../shared/model.mjs';
const require=createRequire(import.meta.url),{NotchBridge,activity}=require('../desktop/notch-bridge.cjs');
const now=10_000_000,feed=(v,prev=v,age=3)=>({entries:[{time:now-(age+5)*60000,value:prev,trend:null},{time:now-age*60000,value:v,trend:'Flat'}],error:null});
const config={unit:'mg/dL',staleMinutes:10,source:'nightscout',notch:true};
function bridge(){const calls=[];const request=(opts,cb)=>{const call={method:opts.method,path:opts.path,body:''};calls.push(call);const listeners={};return {on(e,f){listeners[e]=f;return this},write(d){call.body+=d},end(){const res={statusCode:200,resume(){},on(e,f){if(e==='end')setImmediate(f);}};cb(res);}};};
 let interval=null;const b=new NotchBridge({model,request,setInterval:f=>{interval=f;return 1},clearInterval:()=>{interval=null}});return {b,calls,tick:()=>interval?.(),get interval(){return interval}};}
test('Notch-Aktivität: Wert, Trend, Änderung, Alter, Farben wie im Widget Lab',()=>{
 const a=activity(model,feed(112,115),config,now).activity;assert.equal(a.value,'112');assert.equal(a.subtitle,'→ −3 · vor 3 Min.');assert.equal(a.color,'#E8EFEF');assert.equal(a.ttl,180);assert.equal(a.id,'haze-bz');assert.equal(a.title,'Blutzucker');assert.ok(a.icon.startsWith('data:image/svg+xml;base64,'));assert.equal('open' in a,false);
 assert.equal(activity(model,feed(196,188),config,now).activity.color,'#EDBC56');assert.equal(activity(model,feed(64,70),config,now).activity.color,'#FF7971');
 const stale=activity(model,feed(112,115,18),config,now);assert.equal(stale.activity.subtitle,'Messung veraltet · vor 18 Min.');assert.equal(stale.activity.color,'#8E9A9B');assert.equal(stale.stale,true);
 assert.equal(activity(model,feed(118,100),{...config,unit:'mmol/L'},now).activity.value,'6,6');
 assert.equal(activity(model,{entries:[]},config,now),null);
 assert.equal(activity(model,feed(112,115),{...config,source:'demo'},now,'C:/Haze.exe').activity.open,'C:/Haze.exe');});
test('Notch-Bridge: dedupliziert, alarmiert einmal beim Bereichswechsel, hält TTL frisch, entfernt sich',async()=>{const n=bridge(),b=n.b;
 b.update(feed(112,115),config,now);b.update(feed(112,115),config,now);assert.equal(n.calls.length,1);assert.equal(JSON.parse(n.calls[0].body).alert,false);
 b.update(feed(196,188),config,now);assert.equal(JSON.parse(n.calls[1].body).alert,true);
 b.update(feed(200,196),config,now);assert.equal(JSON.parse(n.calls[2].body).alert,false);
 n.tick();assert.equal(n.calls[3].method,'POST');assert.equal(JSON.parse(n.calls[3].body).value,'200');
 b.update(feed(200,196),{...config,notch:false},now);assert.equal(n.calls[4].method,'DELETE');assert.equal(n.calls[4].path,'/activity/haze-bz');assert.equal(n.interval,null);assert.equal(b.active,false);
 assert.equal(await b.remove(),false);assert.equal(n.calls.length,5);});
test('Notch nicht erreichbar: kein Fehler, kein Absturz',async()=>{const b=new NotchBridge({model,request:()=>{throw Error('ECONNREFUSED')},setInterval:()=>1,clearInterval:()=>{}});b.update(feed(112,115),config,now);assert.equal(await b.send('POST','/activity',{}),false);});
