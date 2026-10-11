import React,{useState} from 'react';
// Einstellungen › Daten: Synchronisierung, Lücken, Clarity-Import, Garmin Connect, Rückblick.
const when=(t:any)=>t?new Date(t).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const day=(t:any)=>t?new Date(t).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'}):'—';
const dur=(m:number)=>m>=1440?`${(m/1440).toLocaleString('de-DE',{maximumFractionDigits:1})} Tage`:m>=60?`${Math.round(m/60)} h`:`${m} min`;
const PHASE:any={nightscout:'Nightscout',lücken:'Lücken prüfen',garmin:'Garmin',sicherung:'Sicherung'};
export function DataPanel({state,act}:any){
 const d=state.data||{},c=state.config,st=d.stats;
 const [imported,setImported]=useState<any>(null);
 if(d.error)return <div className="notice n-liquid panel" role="status">{d.error}</div>;
 const progress=d.progress?.total?Math.round(d.progress.done/d.progress.total*100):null;
 return <div className="data-panel">
  <section className="garmin-card"><div className="card-top"><div><span className="eyebrow">DATENBANK</span><h3>Historie auf diesem PC</h3></div>
   <button className="button primary compact-button" disabled={d.running} onClick={()=>act('sync-now')}>{d.running?'Läuft …':'Jetzt abgleichen'}</button></div>
   <p role="status" className="fine tight">{d.running?`${PHASE[d.phase]||d.phase||'Start'}${progress!=null?` · ${progress} %`:''}${d.progress?.day?` · ${d.progress.day}`:''}`:`Zuletzt: ${when(d.lastRun)}${d.reason?` (${d.reason})`:''} · stündlich und nach Standby`}</p>
   {st&&<dl className="data-stats">
    <dt>Glukose</dt><dd>{st.glucose.n.toLocaleString('de-DE')} Werte · {day(st.glucose.first)} – {day(st.glucose.last)}</dd>
    <dt>Quellen</dt><dd>{(st.sources||[]).map((s:any)=>`${({share:'Share',clarity:'Clarity'} as any)[s.source]||s.source} ${s.n.toLocaleString('de-DE')}`).join(' · ')||'—'}</dd>
    <dt>Ereignisse</dt><dd>{st.treatment.n.toLocaleString('de-DE')} (Nightscout, Clarity)</dd>
    <dt>Garmin</dt><dd>{st.daily.n} Tage · {st.sleep.n} Nächte · {st.activity.n} Trainings</dd>
    <dt>Sicherung</dt><dd>{d.lastBackup?when(d.lastBackup):'täglich, 7 Tage + 8 Wochen'}</dd>
   </dl>}
   {Object.entries(d.errors||{}).map(([k,e]:any)=><details key={k} className="notice warning n-liquid panel"><summary>{PHASE[k]||k}: {e.message}</summary>{e.log&&<pre className="data-log">{e.log}</pre>}</details>)}
   <Segmented label="Rückblick beim ersten Abgleich" value={c.backfillDays||180} options={[[30,'30 T.'],[90,'90 T.'],[180,'180 T.'],[365,'1 Jahr']]} onChange={(days:number)=>act('backfill-days',{days})}/>
  </section>
  <section className="garmin-card"><div className="card-top"><div><span className="eyebrow">LÜCKEN</span><h3>Fehlende Glukosewerte</h3></div><span className="chart-label">{(d.gaps||[]).length} offen</span></div>
   {(d.gaps||[]).length?<ul className="gap-list">{d.gaps.slice(0,8).map((g:any)=><li key={g.start}><span>{when(g.start)} – {when(g.end)}</span><span>{dur(g.minutes)}</span><span className="gap-status">{g.status}</span></li>)}</ul>:<p className="fine tight">Keine Lücken über 30 Minuten.</p>}
   <p className="fine">Dexcom Share liefert nur die letzten 24 Stunden. Ältere Lücken füllt ein Clarity-Export: clarity.dexcom.eu › Exportieren › CSV, dann hier importieren.</p>
   <button className="button secondary full" onClick={async()=>{const r=await act('import-clarity');if(r?.ok)setImported(r);}}>Clarity-Export importieren</button>
   {imported&&<p className="fine tight" role="status">{imported.glucose.toLocaleString('de-DE')} Werte, {imported.treatments} Ereignisse importiert ({day(imported.from)} – {day(imported.to)}).</p>}
  </section>
  <section className="garmin-card"><div className="card-top"><div><span className="eyebrow">GARMIN CONNECT</span><h3>Schlaf, Stress, Schritte, Training</h3></div><span className="chart-label">{d.garmin?.loggedIn?'angemeldet':d.garmin?.enabled?'Anmeldung nötig':'aus'}</span></div>
   <p className="fine tight">Anmeldung direkt auf der Garmin-Seite in einem Haze-Fenster (auch mit Zwei-Faktor-Code). Haze sieht dein Passwort nicht. Inoffizielle Schnittstelle: Garmin kann sie jederzeit ändern.</p>
   <div className="toolbar-actions"><button className="button primary" onClick={()=>act('garmin-login')}>{d.garmin?.loggedIn?'Garmin-Fenster öffnen':'Bei Garmin anmelden'}</button>{d.garmin?.enabled&&<button className="button secondary" onClick={()=>act('garmin-logout')}>Abmelden</button>}</div>
   {d.garmin?.error&&<p className="fine tight warning">{d.garmin.error}</p>}
  </section>
 </div>;
}
function Segmented({label,value,options,onChange}:any){return <div className="field" role="group" aria-label={label}>{label}<div className="segmented compact">{options.map(([v,text]:any)=><button key={v} type="button" aria-pressed={value===v} className={value===v?'active':''} onClick={()=>onChange(v)}>{text}</button>)}</div></div>;}
