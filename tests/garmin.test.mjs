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
