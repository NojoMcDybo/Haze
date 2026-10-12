import React from 'react';
import {format} from '../shared/model.mjs';
import {More} from './More';
// Muster (shared/analysis/patterns.mjs): Tagestypen, wiederkehrende Regeln mit Bestätigung, ungewöhnliche Tage.
const num=(v:any,d=0)=>v==null||!Number.isFinite(v)?'—':v.toLocaleString('de-DE',{maximumFractionDigits:d,minimumFractionDigits:d});
const dateKey=(k:string)=>{const [y,m,d]=k.split('-');return `${d}.${m}.${y.slice(2)}`;};
const pct=(v:number)=>`${Math.round(v*100)} %`;
const CONF:any={'bestätigt':'bestätigt','noch offen':'neu, noch nicht bestätigt','nicht bestätigt':'zuletzt nicht bestätigt'};
export function Patterns({p,unit}:any){
 if(!p)return null;
 return <section className="patterns" aria-label="Muster">
  <div className="analysis-head"><div><span className="eyebrow">MUSTER</span><h2>Was sich wiederholt</h2></div></div>
  <DayTypes t={p.dayTypes} unit={unit}/>
  <div className="analysis-grid">
   <Rules r={p.rules} memory={p.memory}/>
   <Unusual list={p.unusual} unit={unit}/>
  </div>
 </section>;
}
// Kleiner 24-h-Verlauf mit Zielbereich, wie das Tagesprofil.
function Spark({profile}:{profile:number[]}){
 const W=160,H=54,lo=40,hi=Math.max(220,...profile)+10,x=(h:number)=>h/23*W,y=(v:number)=>H-(v-lo)/(hi-lo)*H;
 return <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Typischer Verlauf dieses Tagestyps">
  <rect x={0} y={y(180)} width={W} height={y(70)-y(180)} className="agp-range"/>
  <path d={'M'+profile.map((v,h)=>`${x(h).toFixed(1)} ${y(v).toFixed(1)}`).join('L')} className="spark-line"/></svg>;
}
function DayTypes({t,unit}:any){
 return <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">TAGESTYPEN</span><h3>Wie deine Tage typischerweise verlaufen</h3></div>
   {t.status==='gefunden'&&<span className="chart-label">{t.n} Tage</span>}</div>
  {t.status==='gefunden'?<div className="day-types">{t.types.map((x:any)=><div key={x.letter} className="day-type">
    <Spark profile={x.profile}/>
    <b>{x.name}</b><small>{pct(x.share)} der Tage · {num(x.tir)} % im Bereich</small>
    <small>{x.peak.value-x.mean>=30?`Spitze ${x.peak.window} (gegen ${x.peak.hour} Uhr, ${format(x.peak.value,unit)})`:'kaum Ausschläge'}</small>
    {x.traits.length>0&&<ul>{x.traits.map((f:any)=><li key={f.key}>{f.more?'häufiger':'seltener'}: {f.label} <span className="muted">({pct(f.shareIn)} statt {pct(f.shareOut)})</span></li>)}</ul>}
   </div>)}</div>
  :<p className="fine">{t.status==='zu wenige Daten'?`Tagestypen brauchen mindestens 28 Tage mit fast vollständigen Werten (bisher ${t.n}).`:'Deine Tage verlaufen ähnlich genug, dass sich keine klar getrennten Typen zeigen. Das ist eher ein gutes Zeichen.'}</p>}
  <More label="Wie entstehen Tagestypen?"><p className="fine tight">Jeder Tag wird zu 24 Stundenmitteln. Ähnliche Tage werden gruppiert (k-Medoids); Typen gibt es nur, wenn die Gruppen klar getrennt sind (Silhouette ab 0,25{t.silhouette!=null?`, hier ${num(t.silhouette,2)}`:''}). „Häufiger“ heißt: Das Merkmal kommt bei diesem Typ deutlich öfter vor, geprüft mit Fisher-Test und FDR. Das ist eine Beschreibung, keine Ursache.</p></More>
 </article>;
}
function Rules({r,memory}:any){
 const ok=r.tested.filter((x:any)=>x.status==='geprüft').length,wait=r.tested.length-ok,since=memory?.since||{};
 return <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">WIEDERKEHREND</span><h3>Was immer wieder passiert</h3></div><span className="chart-label">{r.found.length} von {ok} geprüft</span></div>
  {r.found.length?<ul className="insights">{r.found.map((f:any)=><li key={f.id}><span className={'strength '+(f.confirmation==='bestätigt'?'deutlich':'')}>{CONF[f.confirmation]}</span><p>{f.text}</p>
   <small>{since[f.id]?`beobachtet seit ${dateKey(since[f.id])} · `:''}q = {num(f.q,3)}</small></li>)}</ul>
  :<p className="fine">{ok?'Bisher wiederholt sich keine der geprüften Situationen deutlich.':'Noch zu wenige Fälle für wiederkehrende Muster.'}</p>}
  {wait>0&&<p className="fine tight">{wait} weitere Fragen warten auf mehr Fälle.</p>}
  {memory?.gone?.length>0&&<More label="Früher beobachtet"><ul className="gone">{memory.gone.map((g:any)=><li key={g.id}><span className="muted">bis {dateKey(g.last)}:</span> {g.text}</li>)}</ul></More>}
  <More label="Wie lernt Haze?"><p className="fine tight">Geprüft werden feste Fragen, etwa „Training → Tief in der Nacht danach“, immer gegen eine Vergleichsgruppe (Fisher-Test, FDR, mindestens 5 Fälle). „Bestätigt“ heißt: Das Muster war vorher schon zu sehen und zeigt sich in den letzten {r.confirmDays/7} Wochen erneut. Haze merkt sich, seit wann ein Muster besteht, und zeigt auch, wenn eines verschwindet.</p></More>
 </article>;
}
function Unusual({list,unit}:any){
 return <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">UNGEWÖHNLICH</span><h3>Tage außerhalb deiner Norm</h3></div></div>
  {list.length?<ul className="unusual">{list.map((u:any)=><li key={u.date}><b>{dateKey(u.date)}</b><span>{u.hits.map((h:any)=>`${h.label} ${h.key==='mean'?format(h.value,unit):num(h.value,h.key==='tbr'?1:0)} statt sonst ${h.key==='mean'?format(h.usual,unit):num(h.usual,h.key==='tbr'?1:0)} ${h.key==='mean'?unit:h.unit}`).join(' · ')}</span></li>)}</ul>
  :<p className="fine">Keine Tage, die deutlich aus deinem Rahmen fallen.</p>}
  <More label="Was heißt ungewöhnlich?"><p className="fine tight">Verglichen wird mit den 28 Tagen davor: deutlich außerhalb des eigenen Normalbereichs (Median ± Streuung) und außerhalb von allem, was in diesen Wochen vorkam. Mögliche Gründe sind Infekt, Katheter, Sensor oder ein besonderer Tag; Haze nennt keine Ursache.</p></More>
 </article>;
}
