import React,{useEffect,useRef,useState} from 'react';
import {format} from '../shared/model.mjs';
import './analysis.css';
import {Longterm} from './Longterm';
import {Sources} from './Sources';
import {More} from './More';
import {ForecastCard} from './Forecast';
// Auswertung aus haze.db (Analyse-Engine shared/analysis). Beschreibend, keine Therapiehinweise.
const pct=(v:any,d=0)=>v==null?'—':v.toLocaleString('de-DE',{maximumFractionDigits:d,minimumFractionDigits:d});
const dateKey=(k:string)=>{const [y,m,d]=k.split('-');return `${d}.${m}.`;};
const hhmm=(min:number)=>`${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`;
const SPORT:any={running:'Laufen',cycling:'Radfahren',road_biking:'Rennrad',mountain_biking:'Mountainbike',indoor_cycling:'Indoor-Rad',walking:'Gehen',hiking:'Wandern',strength_training:'Krafttraining',lap_swimming:'Schwimmen',open_water_swimming:'Freiwasser',yoga:'Yoga',cardio:'Cardio',hiit:'HIIT',treadmill_running:'Laufband',soccer:'Fußball',tennis:'Tennis',sonstige:'Sonstige'};
const BANDS=[['veryLow','unter 54'],['low','54–69'],['target','70–180'],['high','181–250'],['veryHigh','über 250']];
// Fehlergrenze: Ein Fehler in der Auswertung darf nie das Dashboard mit dem aktuellen Wert leeren.
class Guard extends React.Component<{children:React.ReactNode},{error:string}>{
 state={error:''};static getDerivedStateFromError(e:any){return {error:String(e?.message||e)};}
 render(){return this.state.error?<div className="notice n-liquid panel" role="status">Dieser Teil der Auswertung konnte nicht angezeigt werden ({this.state.error}).</div>:this.props.children;}
}
// active: Seite sichtbar. Geladen wird erst beim ersten Öffnen der Seite, danach bei neuen Daten.
export function Analysis({state,load,loadLong,loadForecast,unit,act,openSettings,active=true}:any){
 const [days,setDays]=useState(14),[res,setRes]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lastRun=state.data?.lastRun,source=state.config.source;
 const opened=useRef(false);if(active)opened.current=true;
 useEffect(()=>{if(!opened.current)return;let live=true;setBusy(true);setError('');load(days).then((r:any)=>{if(!live)return;if(r?.error||!r?.summary)setError(r?.error||'Auswertung nicht verfügbar.');else setRes(r);}).catch((e:any)=>live&&setError(e.message)).finally(()=>live&&setBusy(false));return()=>{live=false;};},[days,lastRun,source,active&&!res]);
 const s=res?.summary;
 return <section className="analysis" aria-label="Auswertung">
  {act&&<Sources state={state} act={act} openSettings={openSettings}/>}
  <div className="analysis-head"><div><span className="eyebrow">AUSWERTUNG</span><h2>Deine letzten {days} Tage</h2></div>
   <div className="segmented" role="group" aria-label="Zeitraum der Auswertung">{[14,30,90].map(d=><button key={d} aria-pressed={days===d} className={days===d?'active':''} onClick={()=>setDays(d)}>{d} T.</button>)}</div></div>
  {error&&<div className="notice n-liquid panel" role="status">{error}</div>}
  {!res&&busy&&<p className="fine">Auswertung wird berechnet …</p>}
  {res&&<Guard><div className={busy?'analysis-body busy':'analysis-body'} aria-busy={busy}>
   <Quality res={res}/>
   {s?.mean==null?<p className="fine">Für diesen Zeitraum liegen noch keine Glukosewerte in der Datenbank. Die Synchronisierung läuft im Hintergrund; Lücken lassen sich unter Einstellungen › Daten nachholen.</p>:<>
   <div className="kpis">
    <Kpi label="ZEIT IM BEREICH" value={pct(s.tir)} unit="%" note="Konsens-Ziel über 70 %" />
    <Kpi label="UNTER 70" value={pct(s.tbr,1)} unit="%" note={`davon unter 54: ${pct(s.tbr54,1)} % · Ziel unter 4 %`}/>
    <Kpi label="MITTELWERT" value={format(s.mean,unit)} unit={unit} note={`GMI ${pct(s.gmi,1)} %`}/>
    <Kpi label="SCHWANKUNG (CV)" value={pct(s.cv)} unit="%" note="stabil bis 36 %"/>
    <Kpi label="GRI" value={pct(s.gri)} unit="" note="Risikoindex 0–100, niedriger ist besser"/>
   </div>
   <RangeBar bands={s.bands}/>
   <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">TAGESPROFIL (AGP)</span><h3>Typischer Tag</h3></div><span className="chart-label">{unit}</span></div><Agp agp={res.agp} unit={unit}/>
    <More label="Wie lese ich das?"><p className="fine tight">Linie: Median · dunkles Band: mittlere 50 % · helles Band: 5–95 %. Kompressionstiefs und Sensor-Aufwärmphasen sind herausgenommen.</p></More></article>
   <Insights insights={res.insights}/>
   <div className="analysis-grid">
    <Activities res={res}/>
    <Nights res={res}/>
    <Sites res={res} unit={unit}/>
   </div>
   </>}
   <More label="Wie belastbar ist das?"><ul className="caveats">{res.caveats.map((c:string)=><li key={c}>{c}</li>)}</ul></More>
  </div></Guard>}
  {loadLong&&<Guard><Longterm load={loadLong} unit={unit} active={opened.current} lastRun={lastRun} source={source}/></Guard>}
  {loadForecast&&act&&<Guard><ForecastCard state={state} act={act} load={loadForecast} active={opened.current}/></Guard>}
 </section>;
}
function Quality({res}:any){
 const q=res.quality,s=res.summary,src=Object.entries(q.sources||{}).map(([k,v]:any)=>`${({share:'Share',clarity:'Clarity',pump:'Pumpe',nightscout:'Nightscout'} as any)[k]||k} ${v}`).join(' · ');
 return <div className="quality" role="status">
  <span className={s.sufficient?'':'warn'}>{Math.round((s.coverage||0)*100)} % Tragezeit</span>
  <span>{q.gaps.length?`${q.gaps.length} Lücken ≥ 1 h`:'keine größeren Lücken'}</span>
  {q.compression.length>0&&<span title="Steiler nächtlicher Abfall mit schneller Erholung, wahrscheinlich Druck auf den Sensor">{q.compression.length===1?'1 mögliches Kompressionstief':`${q.compression.length} mögliche Kompressionstiefs`} ausgeklammert</span>}
  <span>{q.garmin.sleeps} Nächte · {q.garmin.activities} Trainings (Garmin)</span>
  <span>{q.pump.hasPump?'Pumpendaten vorhanden':'keine Pumpendaten'}</span>
  {src&&<span className="muted-src">{src}</span>}
 </div>;
}
function Kpi({label,value,unit,note}:any){return <article className="kpi"><div className="eyebrow">{label}</div><strong>{value}<small>{unit?' '+unit:''}</small></strong><span>{note}</span></article>;}
function RangeBar({bands}:any){
 if(!bands)return null;
 return <article className="analysis-card range-card"><div className="card-top"><div><span className="eyebrow">ZEIT IN BEREICHEN</span></div><span className="chart-label">mg/dL</span></div>
  <div className="range-bar" role="img" aria-label={BANDS.map(([k,l])=>`${l}: ${pct(bands[k],1)} %`).join(', ')}>{BANDS.map(([k,l])=>bands[k]>0&&<i key={k} className={'band-'+k} style={{flexGrow:bands[k]}} title={`${l} mg/dL: ${pct(bands[k],1)} %`}/>)}</div>
  <ul className="range-legend">{BANDS.map(([k,l])=><li key={k}><i className={'band-'+k}/><span>{l}</span><b>{pct(bands[k],1)} %</b></li>)}</ul>
 </article>;
}
function Agp({agp,unit}:any){
 const ref=useRef<SVGSVGElement>(null),[w,setW]=useState(900),[hover,setHover]=useState<number|null>(null);
 useEffect(()=>{if(!ref.current)return;const ro=new ResizeObserver(([e])=>setW(Math.max(280,e.contentRect.width)));ro.observe(ref.current);return()=>ro.disconnect();},[]);
 const H=240,L=8,R=46,T=12,B=26,vals=agp.flatMap((b:any)=>[b.p5,b.p95]).filter((v:any)=>v!=null);
 const max=Math.max(200,...vals)+10,min=Math.max(30,Math.min(60,...vals)-10);
 const x=(m:number)=>L+m/1440*(w-L-R),y=(v:number)=>T+(max-v)/(max-min)*(H-T-B);
 const ok=agp.filter((b:any)=>b.n>=3&&b.p50!=null);
 const area=(a:string,b:string)=>ok.length?`M${ok.map((p:any)=>`${x(p.minute+7.5).toFixed(1)} ${y(p[a]).toFixed(1)}`).join('L')}L${[...ok].reverse().map((p:any)=>`${x(p.minute+7.5).toFixed(1)} ${y(p[b]).toFixed(1)}`).join('L')}Z`:'';
 const line=ok.length?'M'+ok.map((p:any)=>`${x(p.minute+7.5).toFixed(1)} ${y(p.p50).toFixed(1)}`).join('L'):'';
 const bin=hover==null?null:agp[Math.min(agp.length-1,Math.max(0,Math.floor(hover/15)))];
 const move=(e:React.PointerEvent)=>{const r=ref.current?.getBoundingClientRect();if(!r)return;const px=e.clientX-r.left;if(px<L||px>w-R){setHover(null);return;}setHover((px-L)/(w-L-R)*1440);};
 return <div className="agp" onPointerMove={move} onPointerLeave={()=>setHover(null)}>
  <svg ref={ref} viewBox={`0 0 ${w} ${H}`} role="img" aria-label="Tagesprofil: Median und Streuung der Glukose je Viertelstunde">
   <rect x={L} y={y(180)} width={w-L-R} height={y(70)-y(180)} className="agp-range"/>
   {[70,180].map(v=><g key={v}><line x1={L} x2={w-R} y1={y(v)} y2={y(v)} className={v===70?'agp-low':'agp-high'}/><text x={w-R+8} y={y(v)+4}>{format(v,unit)}</text></g>)}
   <path d={area('p5','p95')} className="agp-outer"/><path d={area('p25','p75')} className="agp-inner"/><path d={line} className="agp-median"/>
   {[0,180,360,540,720,900,1080,1260,1440].map(m=><text key={m} x={x(m)} y={H-6} textAnchor={m===0?'start':m===1440?'end':'middle'}>{m===1440?'24:00':hhmm(m)}</text>)}
   {bin&&<line x1={x(hover!)} x2={x(hover!)} y1={T} y2={H-B} className="chart-cursor"/>}
  </svg>
  <div className={'chart-selection n-liquid'+(bin?' visible':'')} aria-live="polite">{bin&&bin.n?`${hhmm(bin.minute)}–${hhmm(bin.minute+15)} · Median ${format(bin.p50,unit)} · 25–75 %: ${format(bin.p25,unit)}–${format(bin.p75,unit)} · 5–95 %: ${format(bin.p5,unit)}–${format(bin.p95,unit)} ${unit}`:bin?'keine Werte':''}</div>
 </div>;
}
function Insights({insights}:any){
 const found=insights.found,tested=insights.tested.filter((t:any)=>t.status==='geprüft').length,missing=insights.tested.filter((t:any)=>t.status!=='geprüft').length;
 return <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">ZUSAMMENHÄNGE</span><h3>Was in deinen Daten auffällt</h3></div><span className="chart-label">{found.length} von {tested} geprüft</span></div>
  {found.length?<ul className="insights">{found.map((f:any)=><li key={f.id}><span className={'strength '+f.strength}>{f.strength==='deutlich'?'Deutlich':'Mäßig'}</span><p>{f.text}</p>
   <small title="Spearman-Rangkorrelation; Intervall per Bootstrap; q-Wert nach Benjamini-Hochberg">ρ = {pct(f.rho,2)} · 95 %-Intervall {pct(f.ci[0],2)} bis {pct(f.ci[1],2)} · q = {pct(f.q,3)}</small></li>)}</ul>
  :<p className="fine">Noch keine belastbaren Zusammenhänge. Es braucht mindestens 14 Tage bzw. Nächte (10 Trainings) mit Garmin- und Glukosedaten; schwache oder zufällige Muster werden bewusst nicht angezeigt.</p>}
  {missing>0&&<p className="fine tight">{missing} weitere Fragen warten auf mehr Daten.</p>}
 </article>;
}
function Activities({res}:any){
 const t=res.activityTypes;
 return <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">TRAINING</span><h3>Glukose rund ums Training</h3></div></div>
  {t.length?<table className="analysis-table"><thead><tr><th>Sportart</th><th>n</th><th title="Median beim Start">Start</th><th title="Median Abfall bis 2 h nach dem Ende">Abfall</th><th title="Trainings mit Wert unter 70 währenddessen oder bis 2 h danach">Tief</th><th title="Trainings mit Tief 2–24 h danach">später</th></tr></thead>
   <tbody>{t.map((a:any)=><tr key={a.type}><td>{SPORT[a.type]||a.type}</td><td>{a.n}</td><td>{a.startValue??'—'}</td><td>{a.drop!=null?`−${a.drop}`:'—'}</td><td>{a.hypoDuring}</td><td>{a.withLateHypo}</td></tr>)}</tbody></table>
  :<p className="fine">Trainings kommen nach der Garmin-Anmeldung (Einstellungen › Daten).</p>}
  <Modes m={res.activityModes}/>
 </article>;
}
// Mit und ohne Sportmodus (Control-IQ) – nur, wenn es beide Gruppen gibt. Beschreibend, keine Empfehlung.
function Modes({m}:any){
 if(!m||!m.with.n||!m.without.n)return null;
 const row=(label:string,g:any)=><tr><td>{label}</td><td>{g.n}</td><td>{g.drop!=null?`−${g.drop}`:'—'}</td><td>{g.hypoShare!=null?`${Math.round(g.hypoShare*100)} %`:'—'}</td><td>{g.lateShare!=null?`${Math.round(g.lateShare*100)} %`:'—'}</td></tr>;
 return <><p className="fine tight">Sportmodus der Pumpe beim Training:</p>
  <table className="analysis-table"><thead><tr><th></th><th>n</th><th title="Median Abfall bis 2 h nach dem Ende">Abfall</th><th title="Anteil mit Wert unter 70 währenddessen oder bis 2 h danach">Tief</th><th title="Anteil mit Tief 2–24 h danach">später</th></tr></thead>
   <tbody>{row('mit Sportmodus',m.with)}{row('ohne',m.without)}</tbody></table></>;
}
// Glukose nach Katheter-Alter (aus Katheterwechseln der Pumpe).
function Sites({res,unit}:any){
 const g=(res.siteAges||[]).filter((x:any)=>x.n>0);if(!g.length)return null;
 return <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">KATHETER</span><h3>Glukose nach Katheter-Tag</h3></div><span className="chart-label">Median je Tag</span></div>
  <table className="analysis-table"><thead><tr><th>Katheter-Tag</th><th>Tage</th><th>Mittel</th><th>Im Bereich</th><th>Über 180</th></tr></thead>
   <tbody>{g.map((x:any)=><tr key={x.age}><td>{x.age===0?'Wechseltag':x.age===3?'Tag 3+':`Tag ${x.age}`}</td><td>{x.n}</td><td>{format(x.mean,unit)}</td><td>{pct(x.tir)} %</td><td>{pct(x.tar)} %</td></tr>)}</tbody></table>
 </article>;
}
function Nights({res}:any){
 const n=res.nights.filter((x:any)=>x.source==='garmin').slice(-7).reverse(),all=res.nights;
 const withLow=all.filter((x:any)=>x.hypos>0).length;
 return <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">NÄCHTE</span><h3>{n.length?'Schlaf und Glukose':'Nächte (0–6 Uhr)'}</h3></div><span className="chart-label">{withLow} von {all.length} mit Tief</span></div>
  {n.length?<table className="analysis-table"><thead><tr><th>Nacht</th><th>Schlaf</th><th>Dauer</th><th>Im Bereich</th><th>Min.</th><th>Tiefs</th><th title="CGM- und Pumpenalarme in der Nacht">Alarme</th><th title="SpO2 im Schlaf: Mittel / Tiefstwert (Garmin)">SpO2</th></tr></thead>
   <tbody>{n.map((x:any)=><tr key={x.night}><td>{dateKey(x.night)}</td><td>{x.score??'—'}</td><td>{pct(x.hours,1)} h</td><td>{pct(x.tir)} %</td><td>{x.min??'—'}</td><td>{x.hypos}{x.compression?<span className="muted" title="mögliches Kompressionstief erkannt und ausgeklammert"> (K)</span>:''}</td><td>{x.alarms}</td><td>{x.spo2!=null?`${x.spo2}/${x.spo2Low??'—'}`:'—'}</td></tr>)}</tbody></table>
  :<p className="fine">Ohne Schlafdaten zählt die Konsens-Nacht von 0 bis 6 Uhr. Mit Garmin kommen Schlafwert, Phasen und HRV dazu.</p>}
 </article>;
}
