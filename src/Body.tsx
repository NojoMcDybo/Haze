import React,{useCallback,useEffect,useRef,useState} from 'react';
import {format} from '../shared/model.mjs';
import {More} from './More';
import {Skeleton} from './Analysis';
// Schlaf und Tag (shared/analysis/body.mjs): Garmin-Werte auf derselben Zeitachse wie die Glukose. Beschreibend.
const num=(v:any,d=0)=>v==null||!Number.isFinite(v)?'—':v.toLocaleString('de-DE',{maximumFractionDigits:d,minimumFractionDigits:d});
const hhmm=(t:number)=>new Date(t).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
const dayLabel=(k:string)=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'2-digit'});};
const STAGES=[['awake','Wach'],['rem','REM'],['light','Leicht'],['deep','Tief']];
const stageName=(s:string)=>(STAGES.find(x=>x[0]===s)||[,'—'])[1];
// Breite des Diagramms; Callback-Ref, weil das SVG erst erscheint, wenn Daten da sind.
function useWidth(){const el=useRef<SVGSVGElement|null>(null),ro=useRef<ResizeObserver|null>(null),[w,setW]=useState(900);
 const ref=useCallback((node:SVGSVGElement|null)=>{ro.current?.disconnect();el.current=node;if(node){ro.current=new ResizeObserver(([e])=>setW(Math.max(280,e.contentRect.width)));ro.current.observe(node);}},[]);
 return [ref,w,el] as const;}
const line=(pts:any[],x:(t:number)=>number,y:(v:number)=>number,gap=20*60000)=>pts.map((p,i)=>`${i&&p.time-pts[i-1].time<=gap?'L':'M'}${x(p.time).toFixed(1)} ${y(p.value).toFixed(1)}`).join('');
const near=(pts:any[],t:number,max:number)=>{let b:any=null;for(const p of pts)if(Math.abs(p.time-t)<=max&&(!b||Math.abs(p.time-t)<Math.abs(b.time-t)))b=p;return b;};

export function Body({load,unit,active,lastRun,source}:any){
 const [day,setDay]=useState<string|null>(null),[res,setRes]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!active)return;let live=true;setBusy(true);load(day).then((r:any)=>{if(!live)return;if(r?.error)setError(r.error);else{setRes(r);setError('');}}).catch((e:any)=>live&&setError(e.message)).finally(()=>live&&setBusy(false));return()=>{live=false;};},[active,day,lastRun,source]);
 if(res&&!res.days?.length)return <section className="body-view" aria-label="Schlaf und Tag"><div className="analysis-head"><div><span className="eyebrow">SCHLAF UND TAG</span><h2>Garmin</h2></div></div>
  <p className="fine">Schlaf, Body Battery, Stress und Schritte erscheinen hier nach der Garmin-Anmeldung (Datenquellen oben).</p></section>;
 const i=res?res.days.indexOf(res.day):-1,go=(d:number)=>{const k=res.days[i+d];if(k)setDay(k);};
 return <section className="body-view" aria-label="Schlaf und Tag">
  <div className="analysis-head"><div><span className="eyebrow">SCHLAF UND TAG</span><h2>{res?dayLabel(res.day):'Schlaf und Tag'}</h2></div>
   {res&&<div className="day-nav" role="group" aria-label="Tag wählen"><button className="icon-button" aria-label="Tag davor" disabled={i>=res.days.length-1||busy} onClick={()=>go(1)}>‹</button>
    <button className="icon-button" aria-label="Tag danach" disabled={i<=0||busy} onClick={()=>go(-1)}>›</button></div>}</div>
  {error&&<div className="notice n-liquid panel" role="status">{error}</div>}
  {!res&&busy&&<Skeleton rows={3} label="Schlaf und Tag werden geladen"/>}
  {res&&<div className={busy?'analysis-body busy':'analysis-body'} aria-busy={busy}>
   <div className="analysis-grid body-grid">
    <Night n={res.night} unit={unit}/>
    <Today d={res.today} unit={unit}/>
   </div>
   <Trends list={res.trends}/>
  </div>}
 </section>;
}
// Nacht: Glukose oben, Schlafphasen als Treppe darunter, gemeinsamer Zeiger.
function Night({n,unit}:any){
 const [ref,w,el]=useWidth(),[hover,setHover]=useState<number|null>(null);
 if(!n)return <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">NACHT</span><h3>Kein Schlaf aufgezeichnet</h3></div></div><p className="fine">Für diese Nacht hat die Uhr keinen Schlaf erfasst.</p></article>;
 const H=250,L=8,R=46,T=10,GH=130,SH=70,gap=26,x=(t:number)=>L+(t-n.from)/(n.to-n.from)*(w-L-R);
 const g=n.glucose,gv=g.map((p:any)=>p.value),gmin=Math.min(60,...gv)-5,gmax=Math.max(200,...gv)+10,gy=(v:number)=>T+(gmax-v)/(gmax-gmin)*GH;
 const lane=(s:string)=>T+GH+gap+STAGES.findIndex(x=>x[0]===s)*(SH/3);
 const hyp=n.stages.map((s:any,i:number)=>`${i?'L':'M'}${x(s.start).toFixed(1)} ${lane(s.stage).toFixed(1)}H${x(s.end).toFixed(1)}`).join('');
 const t=hover,gp=t==null?null:near(g,t,6*60000),st=t==null?null:n.stages.find((s:any)=>t>=s.start&&t<s.end),hp=t==null?null:near(n.hr,t,3*60000);
 const move=(e:React.PointerEvent)=>{const r=el.current?.getBoundingClientRect();if(!r)return;const px=e.clientX-r.left;setHover(px<L||px>w-R?null:n.from+(px-L)/(w-L-R)*(n.to-n.from));};
 const gs=n.glucoseSummary,min=(m:any)=>m==null?'—':`${Math.floor(m/60)} h ${String(m%60).padStart(2,'0')}`;
 return <article className="analysis-card night-card"><div className="card-top"><div><span className="eyebrow">NACHT</span><h3>{hhmm(n.start)} – {hhmm(n.end)} · {num(n.hours,1)} h</h3></div>{n.score!=null&&<span className="score" title="Schlafwert (Garmin)">{n.score}</span>}</div>
  <div className="agp body-chart" onPointerMove={move} onPointerLeave={()=>setHover(null)}>
   <svg ref={ref} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={`Nacht von ${hhmm(n.start)} bis ${hhmm(n.end)}: Glukose ${gs.tir} % im Bereich, tiefster Wert ${gs.min}; Schlafphasen darunter.`}>
    <rect x={L} y={gy(180)} width={w-L-R} height={gy(70)-gy(180)} className="agp-range"/>
    {[70,180].map(v=><g key={v}><line x1={L} x2={w-R} y1={gy(v)} y2={gy(v)} className={v===70?'agp-low':'agp-high'}/><text x={w-R+8} y={gy(v)+4}>{format(v,unit)}</text></g>)}
    <rect x={x(n.start)} y={T} width={x(n.end)-x(n.start)} height={GH+gap+SH} className="sleep-span"/>
    <path d={line(g,x,gy)} className="body-glucose draw" pathLength={1}/>
    {STAGES.map(([k,l])=><g key={k}><line x1={L} x2={w-R} y1={lane(k)} y2={lane(k)} className="lane"/><text x={w-R+8} y={lane(k)+4}>{l}</text></g>)}
    <path d={hyp} className="hypnogram draw" pathLength={1}/>
    {[n.from,(n.from+n.to)/2,n.to].map((v,i)=><text key={i} x={x(v)} y={H-4} textAnchor={i===0?'start':i===2?'end':'middle'}>{hhmm(v)}</text>)}
    {t!=null&&<line x1={x(t)} x2={x(t)} y1={T} y2={T+GH+gap+SH} className="chart-cursor"/>}
    {gp&&<circle cx={x(gp.time)} cy={gy(gp.value)} r={4} className="body-dot"/>}
   </svg>
   <div className={'chart-selection n-liquid'+(t!=null?' visible':'')} aria-live="polite">{t!=null?[hhmm(t),gp?`${format(gp.value,unit)} ${unit}`:'kein Glukosewert',st?stageName(st.stage):'wach (außerhalb)',hp?`Puls ${Math.round(hp.value)}`:null].filter(Boolean).join(' · '):''}</div>
  </div>
  <dl className="body-stats">
   <div><dt>Glukose</dt><dd>{num(gs.tir)} % im Bereich · min {format(gs.min,unit)}{gs.lows?` · ${gs.lows} Tief${gs.lows>1?'s':''}`:''}</dd></div>
   <div><dt>Phasen</dt><dd>Tief {min(n.deep)} · REM {min(n.rem)} · Leicht {min(n.light)} · Wach {min(n.awake)}</dd></div>
   <div><dt>HRV · Ruhepuls</dt><dd>{num(n.hrv)} ms · {num(n.rhr)} bpm</dd></div>
   <div><dt>SpO2 · Atmung</dt><dd>{num(n.spo2)} % (min {num(n.spo2Low)}) · {num(n.respiration)}/min</dd></div>
   <div><dt>Body Battery</dt><dd>{n.bbChange!=null?`+${n.bbChange}`:'—'} über Nacht · Unruhe {num(n.restless)}</dd></div>
  </dl>
 </article>;
}
// Tag: Glukose, Body Battery mit Stress, Schritte je Stunde – drei Streifen auf einer Zeitachse.
function Today({d,unit}:any){
 const [ref,w,el]=useWidth(),[hover,setHover]=useState<number|null>(null);
 const H=290,L=8,R=46,T=10,G=120,B=80,S=40,gap=16,x=(t:number)=>L+(t-d.from)/(d.to-d.from)*(w-L-R);
 const gv=d.glucose.map((p:any)=>p.value),gmin=Math.min(60,...gv)-5,gmax=Math.max(200,...gv)+10,gy=(v:number)=>T+(gmax-v)/(gmax-gmin)*G;
 const b0=T+G+gap,by=(v:number)=>b0+(100-v)/100*B,s0=b0+B+gap,smax=Math.max(500,...d.steps.map((p:any)=>p.value)),sy=(v:number)=>s0+S-v/smax*S;
 const bw=(w-L-R)/96*.7,hw=(w-L-R)/24*.7,t=hover;
 const gp=t==null?null:near(d.glucose,t,6*60000),bp=t==null?null:near(d.bodyBattery,t,20*60000),sp=t==null?null:near(d.stress,t,8*60000),stp=t==null?null:d.steps.find((p:any)=>t>=p.time&&t<p.time+3600000);
 const move=(e:React.PointerEvent)=>{const r=el.current?.getBoundingClientRect();if(!r)return;const px=e.clientX-r.left;setHover(px<L||px>w-R?null:d.from+(px-L)/(w-L-R)*(d.to-d.from));};
 const dl=d.daily;
 return <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">TAG</span><h3>{d.glucoseSummary?`${num(d.glucoseSummary.tir)} % im Bereich`:'Keine Glukosewerte'}{dl?.steps!=null?` · ${num(dl.steps)} Schritte`:''}</h3></div></div>
  <div className="agp body-chart" onPointerMove={move} onPointerLeave={()=>setHover(null)}>
   <svg ref={ref} viewBox={`0 0 ${w} ${H}`} role="img" aria-label="Tagesverlauf: Glukose, Body Battery und Stress, Schritte je Stunde">
    <rect x={L} y={gy(180)} width={w-L-R} height={gy(70)-gy(180)} className="agp-range"/>
    {[70,180].map(v=><g key={v}><line x1={L} x2={w-R} y1={gy(v)} y2={gy(v)} className={v===70?'agp-low':'agp-high'}/><text x={w-R+8} y={gy(v)+4}>{format(v,unit)}</text></g>)}
    <path d={line(d.glucose,x,gy)} className="body-glucose draw" pathLength={1}/>
    <text x={L} y={b0-3} className="strip-label">Body Battery · Stress</text>
    {d.stress.map((p:any)=><rect key={p.time} x={x(p.time)} y={by(p.value)} width={bw} height={b0+B-by(p.value)} className="stress-bar"/>)}
    <path d={line(d.bodyBattery,x,by,40*60000)} className="bb-line draw" pathLength={1}/>
    <text x={w-R+8} y={by(100)+4}>100</text><text x={w-R+8} y={by(0)}>0</text>
    <text x={L} y={s0-3} className="strip-label">Schritte je Stunde</text>
    {d.steps.map((p:any)=><rect key={p.time} x={x(p.time)} y={sy(p.value)} width={hw} height={s0+S-sy(p.value)} className="steps-bar"/>)}
    {[0,6,12,18,24].map(h=><text key={h} x={x(d.from+h*3600000)} y={H-2} textAnchor={h===0?'start':h===24?'end':'middle'}>{String(h).padStart(2,'0')}:00</text>)}
    {t!=null&&<line x1={x(t)} x2={x(t)} y1={T} y2={s0+S} className="chart-cursor"/>}
    {gp&&<circle cx={x(gp.time)} cy={gy(gp.value)} r={4} className="body-dot"/>}
   </svg>
   <div className={'chart-selection n-liquid'+(t!=null?' visible':'')} aria-live="polite">{t!=null?[hhmm(t),gp?`${format(gp.value,unit)} ${unit}`:null,bp?`Body Battery ${Math.round(bp.value)}`:null,sp?`Stress ${Math.round(sp.value)}`:null,stp?`${num(stp.value)} Schritte in dieser Stunde`:null].filter(Boolean).join(' · '):''}</div>
  </div>
  {dl&&<dl className="body-stats">
   <div><dt>Body Battery</dt><dd>{num(dl.bbMin)} – {num(dl.bbMax)}</dd></div>
   <div><dt>Stress Ø</dt><dd>{num(dl.stressAvg)}</dd></div>
   <div><dt>Bereitschaft</dt><dd>{num(dl.readiness)}{dl.trainingStatus?` · ${({DETRAINING:'Formverlust',RECOVERY:'Erholung',MAINTAINING:'Halten',PRODUCTIVE:'Produktiv',PEAKING:'Höchstform',UNPRODUCTIVE:'Unproduktiv',OVERREACHING:'Überlastung'} as any)[dl.trainingStatus]||dl.trainingStatus}`:''}</dd></div>
  </dl>}
 </article>;
}
// 4 Wochen: Kachel je Kennzahl mit Mini-Verlauf und eigenem üblichen Bereich.
function Trends({list}:any){
 if(!list?.some((t:any)=>t.series.some((p:any)=>p.value!=null)))return null;
 return <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">4 WOCHEN</span><h3>Im Vergleich zu deinem Üblichen</h3></div></div>
  <div className="trend-tiles">{list.map((t:any)=><TrendTile key={t.key} t={t}/>)}</div>
  <More label="Was heißt „üblich“?"><p className="fine tight">Üblich ist die mittlere Hälfte deiner Werte aus den 28 Tagen davor (helles Band). „Höher“ oder „niedriger“ heißt: außerhalb dieses Bandes. Das ist eine Beschreibung; Garmin-Werte sind Schätzungen der Uhr.</p></More>
 </article>;
}
function TrendTile({t}:any){
 const W=140,Hh=40,v=t.series.map((p:any)=>p.value).filter((x:any)=>x!=null),lo=Math.min(...v,t.usual?.lo??Infinity),hi=Math.max(...v,t.usual?.hi??-Infinity),pad=(hi-lo)*.12||1;
 const x=(i:number)=>i/(t.series.length-1)*W,y=(val:number)=>Hh-(val-lo+pad)/(hi-lo+2*pad)*Hh;
 const d=t.series.map((p:any,i:number)=>p.value==null?null:`${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).reduce((s:string,p:any,i:number,a:any[])=>p==null?s:s+(i&&a[i-1]!=null?'L':'M')+p,'');
 const lastI=t.series.length-1,last=t.series[lastI]?.value;
 return <div className={'trend-tile '+(t.status||'')}><span className="eyebrow">{t.label}</span>
  <b>{num(t.value,t.d)}{t.value!=null&&t.unit?<small> {t.unit}</small>:''}</b>
  <svg viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="none" className="trend-spark" aria-hidden="true">
   {t.usual&&<rect x={0} y={y(t.usual.hi)} width={W} height={Math.max(1,y(t.usual.lo)-y(t.usual.hi))} className="usual-band"/>}
   <path d={d} className="spark-line draw" pathLength={1}/>{last!=null&&<circle cx={x(lastI)} cy={y(last)} r={2.6} className="spark-dot"/>}</svg>
  <small>{t.status==='höher'?'höher als üblich':t.status==='niedriger'?'niedriger als üblich':t.status==='üblich'?'im üblichen Bereich':t.usual?'heute kein Wert':'noch zu wenige Tage'}{t.usual?` · üblich ${num(t.usual.lo,t.d)}–${num(t.usual.hi,t.d)}`:''}</small>
 </div>;
}
