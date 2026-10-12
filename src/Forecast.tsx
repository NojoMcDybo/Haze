import React,{useEffect,useState} from 'react';
import {format} from '../shared/model.mjs';
import {More} from './More';
// Prognose-Experiment (shared/analysis/forecast.mjs). Standardmäßig aus; nur im Verlauf auf „Jetzt“, nie im Widget, keine Alarme.
const num=(v:any,d=0)=>v==null||!Number.isFinite(v)?'—':v.toLocaleString('de-DE',{maximumFractionDigits:d,minimumFractionDigits:d});
const MIN=[15,30,45,60],H=[3,6,9,12];
// Modell laden (Rückwärtsprüfung im Analyse-Thread), stündlich und nach jedem Abgleich neu.
export function useForecastModel(enabled:boolean,load:()=>Promise<any>,lastRun:any){
 const [model,setModel]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{if(!enabled)return;let live=true;const go=()=>load().then(r=>{if(!live)return;if(r?.error)setError(r.error);else{setModel(r);setError('');}}).catch(e=>live&&setError(e.message));
  go();const t=setInterval(go,3600000);return()=>{live=false;clearInterval(t);};},[enabled,lastRun]);
 return {model:enabled?model:null,error};
}
export function ForecastCard({state,act,load,active}:any){
 const c=state.config,on=!!c.forecastExperiment,[confirm,setConfirm]=useState(false),{model,error}=useForecastModel(active||on,load,state.data?.lastRun);
 const m=model?.metrics,best=model?.best,n30=m?.naive?.[6],b30=m?.[best]?.[6];
 return <article className="analysis-card forecast-card"><div className="card-top"><div><span className="eyebrow">EXPERIMENT</span><h3>Kurzzeit-Prognose</h3></div><span className="experiment-tag">nicht belastbar</span></div>
  <p className="fine tight">Eine Linie mit Band zeigt im Verlauf auf „Jetzt“, wohin die Glukose in den nächsten 60 Minuten laufen <i>könnte</i>. Sie kennt weder Insulin noch Kohlenhydrate, Bewegung oder Control-IQ. <b>Keine Grundlage für Entscheidungen</b>: Für Behandlung zählen Sensor, Dexcom-Warnungen und Pumpe.</p>
  {!model&&!error&&<p className="fine tight">Rückwärtsprüfung wird berechnet …</p>}
  {error&&<p className="fine tight warning">{error}</p>}
  {model&&(!model.enough?<p className="fine tight">Für eine Prüfung fehlen noch Daten: Es braucht etwa eine Woche mit fast lückenlosen Werten, für das gelernte Modell zusätzlich mehrere Wochen davor.</p>:<>
   <p className="verdict">{best==='naive'?<>Bisher schlägt kein Modell die einfache Fortschreibung. Bei 30 Minuten liegt sie im Mittel <b>{format(n30.rmse,'mg/dL')} mg/dL</b> daneben; Haze zeigt deshalb nur sie mit ihrem Band.</>
    :<>Das Modell „{({ar:'gelernt aus deinen Daten',trend:'gedämpfter Trend'} as any)[best]}“ liegt bei 30 Minuten im Mittel <b>{num(b30.rmse)} mg/dL</b> daneben, die einfache Fortschreibung {num(n30.rmse)} mg/dL ({num(model.gain*100)} % besser).</>}</p>
   <div className="table-scroll"><table className="analysis-table forecast-table"><thead><tr><th>Modell</th>{MIN.map(x=><th key={x}>{x} min</th>)}</tr></thead>
    <tbody>{Object.entries(m).map(([k,v]:any)=><tr key={k} className={k===best?'best':''}><td>{({naive:'Fortschreibung',trend:'Gedämpfter Trend',ar:'Gelernt (AR)'} as any)[k]}{k===best?' ·  gezeigt':''}</td>{H.map(h=><td key={h}>{v[h]?`± ${num(v[h].rmse)}`:'—'}</td>)}</tr>)}</tbody></table></div>
   <p className="fine tight">Typischer Fehler (RMSE, mg/dL), geprüft an {num(model.origins)} Startpunkten der letzten {model.testDays} Tage, die das gelernte Modell nicht gesehen hat. Das Band im Verlauf enthält in diesen Tagen 80 % der echten Werte.</p></>)}
  <div className="toolbar-actions forecast-actions">
   {on?<button className="button secondary" onClick={()=>act('settings',{forecastExperiment:false})}>Prognose ausblenden</button>
   :confirm?<><span className="fine tight">Verstanden, dass die Prognose nicht belastbar ist?</span><button className="button primary" onClick={()=>{act('settings',{forecastExperiment:true});setConfirm(false);}}>Ja, im Verlauf zeigen</button><button className="button secondary" onClick={()=>setConfirm(false)}>Abbrechen</button></>
   :<button className="button secondary" onClick={()=>setConfirm(true)}>Im Verlauf zeigen …</button>}
  </div>
  <More label="Wie funktioniert das?"><p className="fine tight">Drei Modelle treten gegeneinander an: einfache Fortschreibung (der letzte Wert bleibt), gedämpfter Trend (die Richtung der letzten 15 Minuten läuft langsam aus) und ein Modell, das aus 28 Tagen deiner Werte lernt, wie sich Veränderungen fortsetzen (AR auf 5-Minuten-Schritten). Geprüft wird auf den 7 Tagen danach; gezeigt wird ein Modell nur, wenn es die Fortschreibung um mindestens 5 % schlägt. Zeitreihen-Grundmodelle (IBM TTM, Amazon Chronos) sind als nächster Schritt geplant und müssen dieselbe Prüfung bestehen.</p></More>
 </article>;
}
