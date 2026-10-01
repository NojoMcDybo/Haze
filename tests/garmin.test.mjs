import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {parseHeartRate,liveHeartRate} from '../shared/garmin.mjs';
import Garmin from '../desktop/garmin.cjs';
const packet=(...bytes)=>new DataView(Uint8Array.from(bytes).buffer);
test('8-bit pulse does not fabricate optional metrics',()=>{
 assert.deepEqual(parseHeartRate(packet(0,72)),{bpm:72,contact:null,energyKj:null,rrMs:[]});
});
test('16-bit pulse, contact, energy and multiple RR intervals',()=>{
 assert.deepEqual(parseHeartRate(packet(31,4,1,25,0,0,4,0,2)),{bpm:260,contact:true,energyKj:25,rrMs:[1000,500]});
 assert.equal(parseHeartRate(packet(4,70)).contact,false);
});
test('truncated and invalid readings rejected',()=>{
 for(const bytes of [[],[0],[1,80],[8,80,1],[16,80,0],[0,0],[1,255,255]])assert.throws(()=>parseHeartRate(packet(...bytes)));
});
test('old, future, disconnected and contact-lost values never labelled live',()=>{
 const g={connected:true,reading:{at:1000,contact:null,bpm:70}};
 assert.equal(liveHeartRate(g,1100),true);
 for(const now of [999,16000,999999])assert.equal(liveHeartRate(g,now),false);
 assert.equal(liveHeartRate({...g,connected:false},1100),false);
 assert.equal(liveHeartRate({...g,reading:{...g.reading,contact:false}},1100),false);
});
test('chooser requires explicit known selection and can cancel',()=>{
 const g=new Garmin(()=>{}),w=new EventEmitter();w.webContents=new EventEmitter();g.attach(w);
 let chosen;w.webContents.emit('select-bluetooth-device',{preventDefault(){}},[{deviceId:'one',deviceName:'Forerunner'}],id=>chosen=id);
 assert.equal(chosen,undefined);assert.throws(()=>g.choose('other'));
 g.choose('one');assert.equal(chosen,'one');assert.equal(g.state.scanning,false);
 w.webContents.emit('select-bluetooth-device',{preventDefault(){}},[],id=>chosen=id);g.reset();assert.equal(chosen,'');
});
test('disconnect and renderer loss clear readings',()=>{
 const g=new Garmin(()=>{});g.update({kind:'status',connected:true,name:'Watch'});
 g.update({kind:'reading',bpm:70,rrMs:[1000,NaN],energyKj:5});assert.equal(g.state.reading.bpm,70);
 g.reset();assert.equal(g.state.reading,null);assert.equal(g.state.connected,false);
 assert.throws(()=>g.update({kind:'reading',bpm:70}));
});
import {recordHeartRate,restoreHeartHistory,heartSegments,nearestHeartRate,publicHeartHistory,HEART_SPAN} from '../shared/garmin.mjs';
test('pulse history: one averaged value per minute, contact loss ignored, 24 h window',()=>{
 const h=[],t0=Date.UTC(2026,9,1,12,0,0);
 recordHeartRate(h,70,t0+1000);recordHeartRate(h,80,t0+30000);recordHeartRate(h,200,t0+40000,false);recordHeartRate(h,0,t0+41000);
 assert.deepEqual(publicHeartHistory(h),[{time:t0,bpm:75}]);
 recordHeartRate(h,90,t0+60000);recordHeartRate(h,60,t0-60000);
 assert.deepEqual(publicHeartHistory(h).map(x=>x.bpm),[75,90],'older minutes are not inserted backwards');
 recordHeartRate(h,100,t0+HEART_SPAN+120000);assert.deepEqual(publicHeartHistory(h).map(x=>x.bpm),[100],'older than 24 h dropped');
});
test('restored history is validated, sorted, de-duplicated and expired',()=>{
 const now=Date.UTC(2026,9,1,12,0,0);
 const r=restoreHeartHistory([{time:now-60000,bpm:80,n:3},{time:now-120000,bpm:70},{time:now-60000,bpm:99},{time:now-HEART_SPAN-60000,bpm:60},{time:now+60000,bpm:60},{time:now-30000,bpm:60},{time:now-180000,bpm:500},'x',null],now);
 assert.deepEqual(r.map(x=>[x.time,x.bpm,x.n]),[[now-120000,70,1],[now-60000,80,3]]);
 assert.deepEqual(restoreHeartHistory({nope:1},now),[]);
});
test('gaps longer than 2 minutes break the pulse line; nearest value stays within 90 s',()=>{
 const m=60000,h=[0,1,2,6,7].map(i=>({time:i*m,bpm:60+i}));
 assert.deepEqual(heartSegments(h,0,10*m).map(s=>s.map(x=>x.bpm)),[[60,61,62],[66,67]]);
 assert.deepEqual(heartSegments(h,2*m,6*m).map(s=>s.length),[1,1]);
 assert.equal(nearestHeartRate(h,6.4*m).bpm,66);assert.equal(nearestHeartRate(h,4*m),null);
});
test('Garmin keeps pulse history across reconnects and saves it to disk',async()=>{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'haze-hr-')),'heart-rate.json');
 const g=new Garmin(()=>{});await g.load(file);clearInterval(g.timer);
 g.update({kind:'status',connected:true,name:'Watch'});g.update({kind:'reading',bpm:72,contact:true});
 assert.equal(g.state.history.length,1);g.reset();assert.equal(g.state.history.length,1,'disconnect keeps history');
 g.save();const again=new Garmin(()=>{});await again.load(file);clearInterval(again.timer);assert.equal(again.state.history[0].bpm,72);
});
