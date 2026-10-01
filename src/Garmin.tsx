import React,{useEffect,useRef,useState} from 'react';
import {parseHeartRate,liveHeartRate} from '../shared/garmin.mjs';

export function GarminPanel({state}:any){
 const device=useRef<any>(null),characteristic=useRef<any>(null),generation=useRef(0);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[now,setNow]=useState(Date.now());
 const send=(payload:any)=>window.nebel?.garmin('update',payload);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{clearInterval(timer);generation.current++;device.current?.gatt?.disconnect();};},[]);
 const g=state.garmin||{},live=liveHeartRate(g,now),supported=!!window.nebel&&!!(navigator as any).bluetooth;
 const disconnect=()=>{generation.current++;device.current?.gatt?.disconnect();device.current=null;characteristic.current=null;setBusy(false);send({kind:'status',connected:false});setMessage('Verbindung getrennt.');};
 async function connect(){
  const run=++generation.current;setBusy(true);setMessage('An der Uhr „Herzfrequenz senden“ starten. Suche läuft …');
  try{
   const d=await (navigator as any).bluetooth.requestDevice({filters:[{services:['heart_rate']}]});
   if(run!==generation.current)return;
   device.current=d;
   d.addEventListener('gattserverdisconnected',()=>{if(device.current===d){generation.current++;setBusy(false);send({kind:'status',connected:false});setMessage('Uhr getrennt. Senden an der Uhr prüfen und erneut verbinden.');}});
   setMessage('Verbindung zur Uhr wird aufgebaut …');
   const server=await d.gatt.connect();
   const service=await server.getPrimaryService('heart_rate');
   const c=await service.getCharacteristic('heart_rate_measurement');
   if(run!==generation.current){d.gatt.disconnect();return;}
   characteristic.current=c;
   await send({kind:'status',connected:true,name:d.name||'Pulssensor'});
   c.addEventListener('characteristicvaluechanged',(e:any)=>{
    if(run!==generation.current)return;
    try{send({kind:'reading',...parseHeartRate(e.target.value)});setMessage('');}catch{setMessage('Ungültige Messung empfangen; warte auf ein neues Paket.');}
   });
   await c.startNotifications();
   if(run!==generation.current){d.gatt.disconnect();return;}
   setMessage('Verbunden. Warte auf den ersten Pulswert.');
  }catch(e:any){
   if(run!==generation.current)return;
   device.current?.gatt?.disconnect();send({kind:'status',connected:false});
   setMessage(e.name==='NotFoundError'?'Kein Gerät ausgewählt. Bluetooth am PC und „Herzfrequenz senden“ an der Uhr prüfen.':`Verbindung fehlgeschlagen: ${e.message||e.name}`);
  }finally{if(run===generation.current)setBusy(false);}
 }
 return <section className="garmin-card" aria-label="Garmin verbinden">
  <div className="card-top"><div><span className="eyebrow">GARMIN · DIREKTVERBINDUNG</span><h3>Deine Uhr, live am PC</h3></div><strong className="garmin-pulse">{live?g.reading.bpm:'—'} <small>bpm</small></strong></div>
  <p className="muted">Forerunner 265: UP halten → Gesundheit und Wellness → Herzfrequenz am Handgelenk → Herzfrequenz senden → START. Danach hier verbinden und deine Uhr auswählen.</p>
  <div className="toolbar-actions"><button className="button primary" disabled={!supported||busy||g.connected} onClick={connect}>{busy?'Suche / Verbindung …':'Uhr verbinden'}</button>{(g.connected||busy)&&<button className="button secondary" onClick={()=>{window.nebel?.garmin('choose',{id:''});disconnect();}}>Trennen / Abbrechen</button>}</div>
  {g.scanning&&<div className="garmin-devices" aria-label="Gefundene Pulssensoren">{g.devices.length?g.devices.map((d:any)=><button className="button secondary" key={d.id} onClick={()=>window.nebel.garmin('choose',{id:d.id})}>{d.name} · {d.id.slice(-6)}</button>):<p>Noch keine Uhr gefunden. Suche endet nach 30 Sekunden.</p>}</div>}
  <p role="status">{!supported?'Zum Verbinden die installierte Haze-App öffnen.':live?`${g.name} · Live · letzte Messung vor ${Math.max(0,Math.floor((now-g.reading.at)/1000))} s`:g.connected?(g.reading?.contact===false?'Kein Hautkontakt erkannt.':g.reading?'Keine aktuellen Pulsdaten.':message):message||'Noch nicht verbunden.'}</p>
  {live&&<p className="fine">{g.reading.rrMs?.length?`Letzter Schlagabstand: ${Math.round(g.reading.rrMs.at(-1))} ms. `:''}{g.reading.energyKj!=null?`Vom Sensor gemeldete Energie: ${g.reading.energyKj} kJ.`:''}</p>}
  <p className="fine">Stress, Body Battery, Schlaf und Schritte werden über diese Verbindung nicht übertragen. Optionale Schlagabstände und Energie erscheinen nur, wenn die Uhr sie tatsächlich sendet. Kein Garmin-Passwort nötig. Nach einem Neustart erneut verbinden.</p>
 </section>;
}
