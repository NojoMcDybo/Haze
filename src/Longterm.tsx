import React,{useEffect,useRef,useState} from 'react';
import {format} from '../shared/model.mjs';
import {More} from './More';
// Langzeit (shared/analysis/longterm.mjs): Wochenverlauf mit Trend und Wendepunkten, Vergleiche, Wochen-Zusammenhänge, Monate.
const num=(v:any,d=0)=>v==null||!Number.isFinite(v)?'—':v.toLocaleString('de-DE',{maximumFractionDigits:d,minimumFractionDigits:d});
const dateKey=(k:string)=>{const [y,m,d]=k.split('-');return `${d}.${m}.${y.slice(2)}`;};
const short=(k:string)=>{const [,m,d]=k.split('-');return `${d}.${m}.`;};
// Werte je Kennzahl in der gewählten Einheit (Mittelwert in mmol/L umrechnen).
function val(key:string,v:any,unit:string,meta:any){if(v==null)return '—';if(key==='mean')return format(v,unit);return num(v,meta?.d||0);}
function diffText(key:string,v:any,unit:string,meta:any){if(v==null)return '—';const s=v>0?'+':v<0?'−':'±',a=Math.abs(v);return s+(key==='mean'?(unit==='mmol/L'?num(a/18,1):num(a)):num(a,meta?.d||0));}
const unitOf=(key:string,unit:string,meta:any)=>key==='mean'?unit:meta?.unit||'';
// Runde Achsenwerte (1, 2, 5 × 10^n), ohne die, die eine Referenzlinie überdecken würden.
function niceTicks(lo:number,hi:number,avoid:number[]){const raw=(hi-lo)/4,p=10**Math.floor(Math.log10(raw)),step=[1,2,5,10].map(f=>f*p).find(s=>s>=raw)!,out=[];for(let v=Math.ceil(lo/step)*step;v<=hi;v+=step)if(!avoid.some(a=>Math.abs(a-v)<(hi-lo)*.08))out.push(v);return out;}
const CHART=[['tir','Im Bereich'],['mean','Mittel'],['tbr','Unter 70'],['steps','Schritte'],['sleepScore','Schlaf']];
export function Longterm({load,unit,active,lastRun,source}:any){
 const [res,setRes]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!active)return;let live=true;setBusy(true);setError('');load().then((r:any)=>{if(!live)return;if(r?.error||!r?.period)setError(r?.error||'Langzeitauswertung nicht verfügbar.');else setRes(r);}).catch((e:any)=>live&&setError(e.message)).finally(()=>live&&setBusy(false));return()=>{live=false;};},[active,lastRun,source]);
 const p=res?.period;
 return <section className="longterm" aria-label="Langzeit">
  <div className="analysis-head"><div><span className="eyebrow">LANGZEIT</span><h2>Wochen und Monate</h2></div>
   {p?.firstDay&&<span className="chart-label">{p.validDays} Tage mit Glukosedaten seit {dateKey(p.firstDay)}</span>}</div>
  {error&&<div className="notice n-liquid panel" role="status">{error}</div>}
  {!res&&busy&&<p className="fine">Langzeit wird berechnet …</p>}
  {res&&<div className={busy?'analysis-body busy':'analysis-body'} aria-busy={busy}>
   {!res.weeks.length?<p className="fine">Noch keine Daten für die Langzeit. Sie füllt sich mit jeder Woche; Garmin und Pumpe holen bis zu 180 Tage nach.</p>:<>
   <WeekChart res={res} unit={unit}/>
   <Comparisons res={res} unit={unit}/>
   <div className="analysis-grid">
    <Changes res={res} unit={unit}/>
    <WeekLinks res={res}/>
   </div>
   <Months res={res} unit={unit}/>
   </>}
   <More label="Wie belastbar ist das?"><ul className="caveats">{res.caveats.map((c:string)=><li key={c}>{c}</li>)}</ul></More>
  </div>}
 </section>;
}
function trendText(t:any,meta:any,unit:string){
 if(!t||t.status==='zu wenige Daten')return `Für einen Trend braucht es mindestens 8 Wochen mit Daten (bisher ${t?.n??0}).`;
 if(t.status==='kein klarer Trend')return `Kein klarer Trend über ${t.n} Wochen.`;
 const perMonth=diffText(t.key,t.slopePerMonth,unit,{d:meta.d??1});
 return `${t.status==='steigend'?'Steigend':'Fallend'} über ${t.n} Wochen, etwa ${perMonth} ${unitOf(t.key,unit,meta)} pro Monat${t.towardTarget===true?' – in Richtung Konsensziel':t.towardTarget===false?' – weg vom Konsensziel':''}.`;
}
// Wochenverlauf: Punkte je Woche (blass bei wenig Tragezeit), Trendlinie nur bei klarem Trend, Wendepunkte als senkrechte Linien.
function WeekChart({res,unit}:any){
 const ref=useRef<SVGSVGElement>(null),[w,setW]=useState(900),[hover,setHover]=useState<number|null>(null);
 const options=CHART.filter(([k])=>res.weeks.filter((x:any)=>x[k]!=null).length>=2),[key,setKey]=useState(options[0]?.[0]||'tir');
 useEffect(()=>{if(!ref.current)return;const ro=new ResizeObserver(([e])=>setW(Math.max(280,e.contentRect.width)));ro.observe(ref.current);return()=>ro.disconnect();},[]);
 if(!options.length)return <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">VERLAUF</span><h3>Woche für Woche</h3></div></div>
  <p className="fine">Der Wochenverlauf beginnt, sobald zwei Wochen mit je mindestens 4 Tagen Glukosedaten vorliegen (bisher {res.weeks.filter((x:any)=>x.enough).length}).</p></article>;
 const meta=res.metrics[key],weeks=res.weeks.map((x:any,i:number)=>({...x,i})),pts=weeks.filter((x:any)=>x[key]!=null),t=res.trends.find((x:any)=>x.key===key);
 const H=220,L=8,R=52,T=14,B=26,n=Math.max(2,weeks.length);
 const vs=pts.map((x:any)=>x[key]),ref70=key==='tir'?[70]:key==='tbr'?[4]:[];
 let lo=Math.min(...vs,...ref70),hi=Math.max(...vs,...ref70);const pad=(hi-lo)*.15||Math.abs(hi)*.1||1;lo-=pad;hi+=pad;if(key==='tir'||key==='tbr')lo=Math.max(0,lo);if(key==='tir')hi=Math.min(100,hi);
 const x=(i:number)=>L+(i+.5)/n*(w-L-R),y=(v:number)=>T+(hi-v)/(hi-lo)*(H-T-B);
 // Linie mit Unterbrechung, wenn Wochen fehlen.
 let path='';pts.forEach((p:any,j:number)=>{path+=(j&&pts[j-1].i===p.i-1?'L':'M')+`${x(p.i).toFixed(1)} ${y(p[key]).toFixed(1)}`;});
 const trend=t&&(t.status==='steigend'||t.status==='fallend')?t.line:null;
 const changes=['tir','mean','tbr'].includes(key)?res.changes.filter((c:any)=>c.shifts.some((s:any)=>s.key===key)):[];
 const weekIndex=(date:string)=>weeks.findIndex((wk:any)=>wk.key<=date&&date<(weeks[weeks.indexOf(wk)+1]?.key??'9999'));
 const sel=hover==null?null:weeks[hover];
 const move=(e:React.PointerEvent)=>{const r=ref.current?.getBoundingClientRect();if(!r)return;const i=Math.floor((e.clientX-r.left-L)/(w-L-R)*n);setHover(i>=0&&i<weeks.length?i:null);};
 const ticks=weeks.filter((_:any,i:number)=>i%Math.max(1,Math.ceil(weeks.length/6))===0);
 return <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">VERLAUF</span><h3>Woche für Woche</h3></div>
   <div className="segmented small" role="group" aria-label="Kennzahl im Verlauf">{options.map(([k,l])=><button key={k} aria-pressed={key===k} className={key===k?'active':''} onClick={()=>setKey(k)}>{l}</button>)}</div></div>
  <div className="agp" onPointerMove={move} onPointerLeave={()=>setHover(null)}>
   <svg ref={ref} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={`${meta.label} je Woche. ${trendText(t,meta,unit)}`}>
    {ref70.map(v=><g key={v}><line x1={L} x2={w-R} y1={y(v)} y2={y(v)} className="lt-ref"/><text x={w-R+8} y={y(v)+4}>{v} %</text></g>)}
    {niceTicks(lo,hi,ref70).map(v=><text key={v} x={w-R+8} y={y(v)+4}>{val(key,v,unit,{d:key==='mean'&&unit==='mmol/L'?1:0})}</text>)}
    {changes.map((c:any)=>{const i=weekIndex(c.date);return i<0?null:<g key={c.date}><line x1={x(i)} x2={x(i)} y1={T} y2={H-B} className="lt-change"/><text x={x(i)+5} y={T+9} className="lt-change-label">ab {short(c.date)}</text></g>;})}
    {trend&&<line x1={x(pts[0].i)} x2={x(pts.at(-1).i)} y1={y(trend.intercept+trend.slope*pts[0].i)} y2={y(trend.intercept+trend.slope*pts.at(-1).i)} className="lt-trend"/>}
    <path d={path} className="lt-line"/>
    {pts.map((p:any)=><circle key={p.key} cx={x(p.i)} cy={y(p[key])} r={hover===p.i?5:3.5} className="lt-point" style={{opacity:.35+.65*Math.min(1,p.validDays/7)}}/>)}
    {ticks.map((k:any)=><text key={k.key} x={x(k.i)} y={H-6} textAnchor="middle">{short(k.key)}</text>)}
    {sel&&<line x1={x(hover!)} x2={x(hover!)} y1={T} y2={H-B} className="chart-cursor"/>}
   </svg>
   <div className={'chart-selection n-liquid'+(sel?' visible':'')} aria-live="polite">{sel?`Woche ab ${short(sel.key)} · ${meta.label} ${val(key,sel[key],unit,meta)} ${unitOf(key,unit,meta)} · ${sel.validDays} von ${sel.days} Tagen mit Glukose`:''}</div>
  </div>
  <p className="fine tight">{trendText(t,meta,unit)} Blasse Punkte: Wochen mit wenig Tragezeit.</p>
 </article>;
}
const STATUS:any={'höher':'klar höher','niedriger':'klar niedriger','stabil':'stabil','offen':'offen'};
function Comparisons({res,unit}:any){
 const list=res.comparisons,[id,setId]=useState(list[0]?.id);const c=list.find((x:any)=>x.id===id)||list[0];
 if(!c)return <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">VERGLEICH</span><h3>Zeiträume vergleichen</h3></div></div>
  <p className="fine">Für Vergleiche braucht es je Zeitraum mindestens 14 Tage mit Glukosedaten, also mindestens 8 Wochen Historie.</p></article>;
 const rows=c.metrics.filter((m:any)=>m.na>0&&m.nb>0);
 return <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">VERGLEICH</span><h3>{c.label}</h3></div>
   {list.length>1&&<div className="segmented small" role="group" aria-label="Vergleich">{list.map((x:any)=><button key={x.id} aria-pressed={x.id===c.id} className={x.id===c.id?'active':''} onClick={()=>setId(x.id)}>{x.id==='4w'?'4 : 4 Wo.':x.id==='4w12w'?'4 : 12 Wo.':'Monat'}</button>)}</div>}</div>
  <div className="table-scroll"><table className="analysis-table lt-compare"><thead><tr><th>Kennzahl</th><th>{c.a.label}</th><th>{c.b.label}</th><th title="Unterschied der Tagesmittel mit 95-%-Intervall">Unterschied</th><th>Einordnung</th></tr></thead>
   <tbody>{rows.map((m:any)=>{const meta=res.metrics[m.key],u=unitOf(m.key,unit,meta);return <tr key={m.key}><td>{meta.label}</td><td>{val(m.key,m.a,unit,meta)} <small className="muted">{u}</small></td><td>{val(m.key,m.b,unit,meta)} <small className="muted">{u}</small></td>
    <td>{m.status==='zu wenige Daten'?'—':<>{diffText(m.key,m.diff,unit,meta)}<small className="muted lt-ci"> ({diffText(m.key,m.ci[0],unit,meta)} bis {diffText(m.key,m.ci[1],unit,meta)})</small></>}</td>
    <td>{m.status==='zu wenige Daten'?<span className="muted">zu wenige Tage</span>:<span className={'lt-status '+(m.towardTarget===true?'toward':m.towardTarget===false?'away':m.status)}>{STATUS[m.status]}{m.towardTarget===true?' · Richtung Ziel':m.towardTarget===false?' · weg vom Ziel':''}</span>}</td></tr>;})}</tbody></table></div>
  <More label="Wie lese ich das?"><p className="fine tight">„Klar“ heißt spürbar (z. B. mindestens 5 Prozentpunkte im Bereich oder 10 mg/dL) und statistisch abgesichert. „Stabil“: Auch das ganze Unsicherheitsintervall liegt unter der spürbaren Grenze. „Offen“: Die Daten reichen für keine Aussage. Das Intervall berücksichtigt, dass aufeinanderfolgende Tage zusammenhängen.</p></More>
 </article>;
}
function Changes({res,unit}:any){
 const list=res.changes;
 return <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">WENDEPUNKTE</span><h3>Seit wann sich etwas verändert hat</h3></div></div>
  {list.length?<ul className="insights">{list.map((c:any)=><li key={c.date}><span className="strength deutlich">ab {dateKey(c.date)}</span>
   <p>{c.shifts.map((s:any)=>{const m=res.metrics[s.key];return `${m.label} ${val(s.key,s.before,unit,m)} → ${val(s.key,s.after,unit,m)} ${unitOf(s.key,unit,m)}`;}).join(' · ')}</p>
   {c.context.length>0?<small>Gleichzeitig (4 Wochen davor/danach): {c.context.map((s:any)=>{const m=res.metrics[s.key];return `${m.label} ${val(s.key,s.before,unit,m)} → ${val(s.key,s.after,unit,m)}${m.unit?' '+m.unit:''}`;}).join(' · ')}</small>
    :<small>Keine deutliche gleichzeitige Veränderung bei Bewegung, Schlaf oder Pumpe.</small>}</li>)}</ul>
  :<p className="fine">{res.period.validDays<28?'Für Wendepunkte braucht es je Abschnitt mindestens 14 Tage mit Daten.':'Keine klaren Wendepunkte: Zeit im Bereich, Mittelwert und Zeit unter 70 sind ohne deutlichen Bruch verlaufen.'}</p>}
 </article>;
}
function WeekLinks({res}:any){
 const {found,tested}=res.correlations,ok=tested.filter((t:any)=>t.status==='geprüft').length,missing=tested.length-ok;
 return <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">ZUSAMMENHÄNGE</span><h3>Zwischen Wochen</h3></div><span className="chart-label">{found.length} von {ok} geprüft</span></div>
  {found.length?<ul className="insights">{found.map((f:any)=><li key={f.id}><span className={'strength '+f.strength}>{f.strength==='deutlich'?'Deutlich':'Mäßig'}</span><p>{f.text}</p>
   <small title="Spearman nach Herausrechnen des Langzeittrends; q nach Benjamini-Hochberg">ρ = {num(f.rho,2)} · 95 %-Intervall {num(f.ci[0],2)} bis {num(f.ci[1],2)} · q = {num(f.q,3)}</small></li>)}</ul>
  :<p className="fine">{ok?'Kein belastbarer Zusammenhang zwischen Wochen.':'Es braucht mindestens 12 Wochen mit Glukose- und Garmin-Daten.'} Der Langzeittrend wird vorher herausgerechnet, damit zwei Größen, die zufällig beide steigen, nicht als Zusammenhang erscheinen.</p>}
  {missing>0&&ok>0&&<p className="fine tight">{missing} weitere Fragen warten auf mehr Wochen.</p>}
 </article>;
}
function Months({res,unit}:any){
 const m=res.months.filter((x:any)=>x.validDays>0||x.steps!=null).slice().reverse();if(!m.length)return null;
 return <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">MONATE</span><h3>Monat für Monat</h3></div><span className="chart-label">ab 10 Tagen mit Daten</span></div>
  <div className="table-scroll"><table className="analysis-table"><thead><tr><th>Monat</th><th>Tage</th><th>Im Bereich</th><th title="Gegenüber dem Vormonat">±</th><th>Unter 70</th><th>Mittel</th><th>GMI</th><th>CV</th><th>Schritte</th><th>Schlaf</th></tr></thead>
   <tbody>{m.map((x:any)=><tr key={x.key}><td>{x.label}{x.partial?<small className="muted"> (Teil)</small>:''}</td><td>{x.validDays}</td>
    <td>{x.tir!=null?<><span className="tir-meter" style={{['--p' as any]:x.tir/100}}/>{num(x.tir)} %</>:'—'}</td>
    <td className="muted">{x.change?.tir!=null?diffText('tir',x.change.tir,unit,{d:1}):''}</td>
    <td>{x.tbr!=null?`${num(x.tbr,1)} %`:'—'}</td><td>{format(x.mean,unit)}</td><td>{x.gmi!=null?`${num(x.gmi,1)} %`:'—'}</td><td>{x.cv!=null?`${num(x.cv)} %`:'—'}</td>
    <td>{num(x.steps)}</td><td>{num(x.sleepScore)}</td></tr>)}</tbody></table></div>
 </article>;
}
