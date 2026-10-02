import React,{useEffect,useRef,useState} from 'react';
import {liveHeartRate} from '../shared/garmin.mjs';
import {GarminConnection} from '../shared/garmin-connection.mjs';
export function useGarminConnection(){
 const [status,setStatus]=useState({busy:false,message:''}),[now,setNow]=useState(Date.now());
 const connection=useRef<any>(null);
 if(!connection.current)connection.current=new GarminConnection({bluetooth:(navigator as any).bluetooth,send:p=>window.nebel?.garmin('update',p),choose:id=>window.nebel?.garmin('choose',{id}),changed:setStatus});
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{clearInterval(timer);connection.current.changed=()=>{};connection.current.disconnect();};},[]);
 return {...status,now,supported:!!window.nebel&&!!(navigator as any).bluetooth,connect:()=>connection.current.connect(),disconnect:()=>connection.current.disconnect()};
}
export function GarminPanel({state,connection}:any){
 const {busy,message,supported,connect,disconnect}=connection;
 // A measurement may arrive between timer ticks; compare against render time.
 const now=Date.now(),g=state.garmin||{},live=liveHeartRate(g,now);
 return <section className="garmin-card" aria-label="Garmin verbinden">
  <div className="card-top"><div><span className="eyebrow">GARMIN · DIREKTVERBINDUNG</span><h3>Deine Uhr, live am PC</h3></div><strong className="garmin-pulse">{live?g.reading.bpm:'—'} <small>bpm</small></strong></div>
  <p className="muted">Forerunner 265: UP halten → Gesundheit und Wellness → Herzfrequenz am Handgelenk → Herzfrequenz senden → START. Danach hier verbinden und deine Uhr auswählen.</p>
  <div className="toolbar-actions"><button className="button primary" disabled={!supported||busy||g.connected} onClick={connect}>{busy?'Suche / Verbindung …':'Uhr verbinden'}</button>{(g.connected||busy)&&<button className="button secondary" onClick={()=>{disconnect();}}>Trennen / Abbrechen</button>}</div>
  {g.scanning&&<div className="garmin-devices" aria-label="Gefundene Pulssensoren">{g.devices.length?g.devices.map((d:any)=><button className="button secondary" key={d.id} onClick={()=>window.nebel.garmin('choose',{id:d.id})}>{d.name} · {d.id.slice(-6)}</button>):<p>Noch keine Uhr gefunden. Suche endet nach 30 Sekunden.</p>}</div>}
  <p role="status">{!supported?'Zum Verbinden die installierte Haze-App öffnen.':live?`${g.name} · Live · letzte Messung vor ${Math.max(0,Math.floor((now-g.reading.at)/1000))} s`:g.connected?(g.reading?.contact===false?'Kein Hautkontakt erkannt.':g.reading?'Keine aktuellen Pulsdaten.':message):message||'Noch nicht verbunden.'}</p>
  {live&&<p className="fine">{g.reading.rrMs?.length?`Letzter Schlagabstand: ${Math.round(g.reading.rrMs.at(-1))} ms. `:''}{g.reading.energyKj!=null?`Vom Sensor gemeldete Energie: ${g.reading.energyKj} kJ.`:''}</p>}
  {g.battery&&<p className="fine">Uhrenakku: {g.battery.percent} % · beim Verbinden gelesen</p>}
  <p className="fine">Stress, Body Battery, Schlaf und Schritte werden über diese Verbindung nicht übertragen. Optionale Schlagabstände und Energie erscheinen nur, wenn die Uhr sie tatsächlich sendet. Kein Garmin-Passwort nötig. Nach einem Neustart erneut verbinden.</p>
 </section>;
}
