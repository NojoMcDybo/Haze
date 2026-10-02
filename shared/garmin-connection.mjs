import {parseHeartRate} from './garmin.mjs';
// One connection owner per dashboard. Stale async completions cannot publish readings.
export class GarminConnection {
 constructor({bluetooth,send,choose=(_id)=>{},changed=(_state)=>{},timeoutMs=20000}){Object.assign(this,{bluetooth,send,choose,changed,timeoutMs});this.state={busy:false,message:''};this.run=0;this.device=null;this.cleanup=null;}
 notify(p){Object.assign(this.state,p);this.changed({...this.state});}
 publish(p){return Promise.resolve(this.send(p)).catch(()=>{this.notify({message:'Haze konnte die Daten nicht übernehmen. Bitte erneut verbinden.'});});}
 release(){this.cleanup?.();this.cleanup=null;const d=this.device;this.device=null;try{d?.gatt?.disconnect();}catch{}}
 disconnect(message='Verbindung getrennt.'){
  this.run++;this.cancel?.();this.cancel=null;Promise.resolve(this.choose('')).catch(()=>{});this.release();
  this.publish({kind:'status',connected:false});this.notify({busy:false,message});
 }
 async connect(){
  if(this.state.busy)return;
  this.release();const run=++this.run;this.notify({busy:true,message:'An der Uhr „Herzfrequenz senden“ starten und die Uhr auswählen.'});
  let timer;const aborted=new Promise((_,reject)=>{this.cancel=()=>reject(Error('Abgebrochen'));});
  const current=()=>run===this.run;
  const wait=p=>Promise.race([p,aborted]);
  try{
   if(!this.bluetooth)throw Error('Bluetooth ist hier nicht verfügbar. Die installierte Haze-App verwenden.');
   if(this.bluetooth.getAvailability&&!await wait(this.bluetooth.getAvailability()))throw Error('Bluetooth am PC einschalten.');
   const d=await wait(this.bluetooth.requestDevice({filters:[{services:['heart_rate']}],optionalServices:['battery_service']}));
   if(!current())return;this.device=d;
   const lost=()=>{if(current())this.disconnect('Verbindung zur Uhr verloren. Senden an der Uhr prüfen und erneut verbinden.');};
   d.addEventListener('gattserverdisconnected',lost);
   this.cleanup=()=>d.removeEventListener('gattserverdisconnected',lost);
   timer=setTimeout(()=>{if(current())this.disconnect('Verbindung dauert zu lange. Senden an der Uhr aus- und wieder einschalten; dann erneut verbinden.');},this.timeoutMs);
   this.notify({message:'Uhr ausgewählt. Verbindung wird aufgebaut …'});
   const pending=d.gatt.connect();pending.then(()=>{if(!current()&&this.device!==d)d.gatt.disconnect();},()=>{});
   const server=await wait(pending),service=await wait(server.getPrimaryService('heart_rate'));
   const c=await wait(service.getCharacteristic('heart_rate_measurement'));
   if(!current())return;
   const reading=e=>{if(!current())return;try{const parsed=parseHeartRate(e.target.value);this.publish({kind:'reading',...parsed});this.notify({message:''});}catch{this.notify({message:'Ungültiges Pulspaket; warte auf eine gültige Messung.'});}};
   c.addEventListener('characteristicvaluechanged',reading);
   this.cleanup=()=>{d.removeEventListener('gattserverdisconnected',lost);c.removeEventListener('characteristicvaluechanged',reading);};
   await this.publish({kind:'status',connected:true,name:d.name||'Pulssensor'});if(!current())return;
   await wait(c.startNotifications());if(!current())return;
   clearTimeout(timer);this.notify({busy:false,message:'Verbunden. Warte auf Messwerte.'});
   // Optional standard battery service; its absence must never break heart-rate reception.
   server.getPrimaryService('battery_service').then(s=>s.getCharacteristic('battery_level')).then(c=>c.readValue()).then(v=>{
    if(current()&&v.byteLength&&v.getUint8(0)<=100)this.publish({kind:'battery',percent:v.getUint8(0)});
   }).catch(()=>{});
  }catch(e){if(current())this.disconnect(e.name==='NotFoundError'?'Keine Uhr ausgewählt. „Herzfrequenz senden“ starten und erneut suchen.':`Verbindung fehlgeschlagen: ${e.message||e.name}`);}
  finally{clearTimeout(timer);if(current()){this.cancel=null;this.notify({busy:false});}}
 }
}
