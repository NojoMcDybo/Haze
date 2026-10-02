import test from 'node:test';import assert from 'node:assert/strict';
import {GarminConnection} from '../shared/garmin-connection.mjs';
const tick=()=>new Promise(r=>setTimeout(r,0));
function fixture(connect){
 const updates=[],d=new EventTarget(),c=new EventTarget();let disconnects=0;
 d.name='Test Watch';d.gatt={connect:connect||(async()=>({getPrimaryService:async name=>{if(name==='battery_service')throw Error('unsupported');return {getCharacteristic:async()=>c};}})),disconnect:()=>{disconnects++;d.dispatchEvent(new Event('gattserverdisconnected'));}};
 c.startNotifications=async()=>{};
 const client=new GarminConnection({bluetooth:{getAvailability:async()=>true,requestDevice:async()=>d},send:p=>updates.push(p),timeoutMs:15});
 const pulse=bpm=>{c.value=new DataView(Uint8Array.from([0,bpm]).buffer);c.dispatchEvent(new Event('characteristicvaluechanged'));};
 return {client,d,c,updates,pulse,get disconnects(){return disconnects;}};
}

test('pulse is copied exactly, never accumulated; listeners are removed on reconnect',async()=>{
 const f=fixture();await f.client.connect();[72,75,68].forEach(f.pulse);
 assert.deepEqual(f.updates.filter(p=>p.kind==='reading').map(p=>p.bpm),[72,75,68]);
 f.client.disconnect();f.pulse(90);assert.equal(f.updates.filter(p=>p.kind==='reading').length,3);
 await f.client.connect();f.pulse(70);assert.equal(f.updates.filter(p=>p.kind==='reading').length,4);f.client.disconnect();
});
test('hung GATT connection times out and permits another attempt',async()=>{
 const f=fixture(()=>new Promise(()=>{}));await f.client.connect();assert.equal(f.client.state.busy,false);assert.match(f.client.state.message,/zu lange/);assert.ok(f.disconnects);f.client.disconnect();
});
test('cancelled connection cannot publish a later result',async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>resolve=r));const pending=f.client.connect();await tick();f.client.disconnect();resolve({getPrimaryService:async()=>{throw Error('must not use old server');}});await pending;
 assert.equal(f.updates.some(p=>p.connected),false);assert.equal(f.client.state.busy,false);
});
test('unavailable adapter fails clearly without leaving a busy UI',async()=>{
 const f=fixture();f.client.bluetooth.getAvailability=async()=>false;await f.client.connect();assert.match(f.client.state.message,/Bluetooth am PC einschalten/);assert.equal(f.client.state.busy,false);
});

