import React,{useState} from 'react';
import {TandemCard} from './Data';
// Datenquellen oben auf der Auswertung: Was ist verbunden, was fehlt, und die nächste Handlung direkt hier
// (anmelden, einrichten, importieren). Details und seltene Einstellungen bleiben unter Einstellungen › Daten.
const day=(t:any)=>t?new Date(t).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}):'—';
const time=(t:any)=>t?new Date(t).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}):'—';
const PHASE:any={nightscout:'Nightscout',lücken:'Lücken',tandem:'Tandem',garmin:'Garmin',sicherung:'Sicherung'};
export function Sources({state,act,openSettings}:any){
 const d=state.data||{},c=state.config,st=d.stats,t=d.tandem||{},g=d.garmin||{},[open,setOpen]=useState<string|null>(null),[note,setNote]=useState('');
 const ns=c.source==='nightscout'&&!!c.url,gaps=(d.gaps||[]).length;
 const tandemOn=t.installed&&c.hasTandemAuth&&t.enabled,garminOn=!!g.loggedIn;
 const tiles=[
  {id:'dexcom',name:'Dexcom G7',ok:ns,detail:ns?(st?.glucose?.n?`seit ${day(st.glucose.first)} · ${st.glucose.n.toLocaleString('de-DE')} Werte`:'über Nightscout'):'Nightscout fehlt',
   action:ns?null:['Verbinden',()=>openSettings('connection')]},
  {id:'garmin',name:'Garmin',ok:garminOn,detail:garminOn?`${st?.sleep?.n??0} Nächte · ${st?.activity?.n??0} Trainings`:g.error||'Schlaf, Stress, Training',
   action:garminOn?null:['Anmelden',()=>act('garmin-login')]},
  {id:'tandem',name:'Tandem t:slim X2',ok:tandemOn,detail:tandemOn?(t.cursor?`bis ${t.cursor.split('-').reverse().slice(0,2).join('.')}.`:'aktiv'):!t.installed?'Insulin, Modi, Alarme':!c.hasTandemAuth?'Zugang fehlt':'Abgleich aus',
   action:tandemOn?null:[open==='tandem'?'Schließen':'Einrichten',()=>setOpen(open==='tandem'?null:'tandem')]},
  {id:'clarity',name:'Clarity-Export',ok:gaps===0&&!!st?.glucose?.n,optional:true,detail:gaps?`${gaps} Lücken füllbar`:'füllt Lücken bei Bedarf',
   action:['Importieren',async()=>{const r=await act('import-clarity');if(r?.ok)setNote(`${r.glucose.toLocaleString('de-DE')} Werte aus Clarity importiert.`);}]},
 ];
 return <section className="sources" aria-label="Datenquellen">
  <div className="sources-head"><span className="eyebrow">DATENQUELLEN</span>
   <span className="chart-label" role="status">{d.running?`Abgleich läuft · ${PHASE[d.phase]||d.phase||'Start'}`:d.lastRun?`abgeglichen ${time(d.lastRun)}`:''}</span>
   <button className="link-button" disabled={d.running} onClick={()=>act('sync-now')}>Jetzt abgleichen</button></div>
  <div className="source-tiles">{tiles.map(s=><article key={s.id} className={'source-tile'+(s.ok?' ok':'')+(open===s.id?' open':'')}>
   <i className="source-dot" aria-hidden="true"/><div><b>{s.name}</b><small>{s.detail}</small></div>
   {s.action&&<button className={'button compact-button '+(s.ok||s.optional?'secondary':'primary')} onClick={s.action[1] as any} aria-expanded={s.id==='tandem'?open==='tandem':undefined}>{s.action[0] as string}</button>}
   <span className="sr-only">{s.ok?'verbunden':'nicht verbunden'}</span></article>)}</div>
  <div className={'source-panel'+(open==='tandem'?' open':'')}><div>{open==='tandem'&&<TandemCard state={state} act={act}/>}</div></div>
  {note&&<p className="fine tight" role="status">{note}</p>}
 </section>;
}
