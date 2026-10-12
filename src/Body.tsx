import React,{useCallback,useRef,useState,useEffect} from 'react';
import {format} from '../shared/model.mjs';
import {More} from './More';
import {Skeleton} from './Analysis';
// Schlaf und Tag (shared/analysis/body.mjs): Garmin-Werte auf derselben Zeitachse wie die Glukose.
// Farben (dataviz-Validator, hell und dunkel geprüft): Schlafphasen Wach/REM/Leicht/Tief, Body Battery, Stress; Glukose in Tinte,
// unter 70 und über 180 in den Bereichsfarben. Vergleich im selben Element: Band = dein Üblicher (14 Tage davor).
// Umschalter: einzelner Tag oder Durchschnitt (7/14/30 Tage, Nächte ab dem Einschlafen übereinandergelegt).
const num=(v:any,d=0)=>v==null||!Number.isFinite(v)?'—':v.toLocaleString('de-DE',{maximumFractionDigits:d,minimumFractionDigits:d});
const hhmm=(t:number)=>new Date(t).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
const dayLabel=(k:string)=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'2-digit'});};
const short=(k:string)=>{const [,m,d]=k.split('-');return `${d}.${m}.`;};
const STAGES:[string,string][]=[['awake','Wach'],['rem','REM'],['light','Leicht'],['deep','Tief']];
const stageName=(s:string)=>(STAGES.find(x=>x[0]===s)||[,'—'])[1];
const mins=(m:any)=>m==null?'—':m>=60?`${Math.floor(m/60)} h ${String(Math.round(m%60)).padStart(2,'0')}`:`${Math.round(m)} min`;
function useWidth(){const el=useRef<SVGSVGElement|null>(null),ro=useRef<ResizeObserver|null>(null),[w,setW]=useState(900);
 const ref=useCallback((node:SVGSVGElement|null)=>{ro.current?.disconnect();el.current=node;if(node){ro.current=new ResizeObserver(([e])=>setW(Math.max(280,e.contentRect.width)));ro.current.observe(node);}},[]);
 return [ref,w,el] as const;}
function useHover(el:any,L:number,R:number,w:number,from:number,to:number){
 const [t,setT]=useState<number|null>(null);
 const move=(e:React.PointerEvent)=>{const r=el.current?.getBoundingClientRect();if(!r)return;const px=e.clientX-r.left;setT(px<L||px>w-R?null:from+(px-L)/(w-L-R)*(to-from));};
 return [t,move,()=>setT(null)] as const;}
const near=(pts:any[],t:number,max:number)=>{let b:any=null;for(const p of pts)if(Math.abs(p.time-t)<=max&&(!b||Math.abs(p.time-t)<Math.abs(b.time-t)))b=p;return b;};
const path=(pts:any[],x:(t:number)=>number,y:(v:number)=>number,key='value',gap=20*60000)=>pts.map((p,i)=>`${i&&p.time-pts[i-1].time<=gap?'L':'M'}${x(p.time).toFixed(1)} ${y(p[key]).toFixed(1)}`).join('');
const band=(pts:any[],x:(t:number)=>number,y:(v:number)=>number)=>pts.length?`M${pts.map(p=>`${x(p.time).toFixed(1)} ${y(p.p75).toFixed(1)}`).join('L')}L${[...pts].reverse().map(p=>`${x(p.time).toFixed(1)} ${y(p.p25).toFixed(1)}`).join('L')}Z`:'';
// Glukose als Linie in Tinte; Abschnitte unter 70 bzw. über 180 in den Bereichsfarben (dicker), damit sie herausstechen.
function GlucoseLine({pts,x,y}:any){
 const segs:any={ink:[],low:[],high:[]};
 for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];if(b.time-a.time>20*60000)continue;const m=(a.value+b.value)/2,k=m<70?'low':m>180?'high':'ink';segs[k].push(`M${x(a.time).toFixed(1)} ${y(a.value).toFixed(1)}L${x(b.time).toFixed(1)} ${y(b.value).toFixed(1)}`);}
 return <g className="glucose-line">{(['ink','high','low'] as const).map(k=><path key={k} d={segs[k].join('')} className={'g-'+k}/>)}</g>;
}
function Legend({items}:{items:[string,string][]}){return <ul className="viz-legend">{items.map(([c,l])=><li key={c}><i className={c}/>{l}</li>)}</ul>;}
const STAGE_LEGEND:[string,string][]=STAGES.map(([k,l])=>['st-'+k,l]);
// Anteile der Phasen als 100-%-Balken; mehrere Zeilen = Vergleich im selben Element.
function Composition({rows}:{rows:{label:string,v:any}[]}){
 return <div className="composition" role="img" aria-label={rows.map(r=>`${r.label}: ${STAGES.slice().reverse().map(([k,l])=>`${l} ${mins(r.v[k])}`).join(', ')}`).join('; ')}>
  {rows.map(r=>{const order=['deep','light','rem','awake'],tot=order.reduce((s,k)=>s+(r.v[k]||0),0)||1;
   return <div key={r.label} className="comp-row"><span>{r.label}</span><div className="comp-bar">{order.map(k=>r.v[k]>0&&<i key={k} className={'st-'+k} style={{flexGrow:r.v[k]}} title={`${stageName(k)}: ${mins(r.v[k])} (${Math.round(r.v[k]/tot*100)} %)`}>{r.v[k]/tot>.11?<b>{Math.round(r.v[k]/tot*100)} %</b>:null}</i>)}</div></div>;})}
 </div>;
}

export function Body({load,unit,active,lastRun,source}:any){
 const [day,setDay]=useState<string|null>(null),[mode,setMode]=useState(0),[res,setRes]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!active)return;let live=true;setBusy(true);load(day,mode||undefined).then((r:any)=>{if(!live)return;if(r?.error)setError(r.error);else{setRes(r);setError('');}}).catch((e:any)=>live&&setError(e.message)).finally(()=>live&&setBusy(false));return()=>{live=false;};},[active,day,mode,lastRun,source]);
 if(res&&!res.days?.length)return <section className="body-view" aria-label="Schlaf und Tag"><div className="analysis-head"><div><span className="eyebrow">SCHLAF UND TAG</span><h2>Garmin</h2></div></div>
  <p className="fine">Schlaf, Body Battery, Stress und Schritte erscheinen hier nach der Garmin-Anmeldung (Datenquellen oben).</p></section>;
 const i=res?res.days.indexOf(res.day):-1,go=(d:number)=>{const k=res.days[i+d];if(k)setDay(k);},a=res?.average;
 return <section className="body-view" aria-label="Schlaf und Tag">
  <div className="analysis-head"><div><span className="eyebrow">SCHLAF UND TAG</span>
    <h2>{!res?'Schlaf und Tag':a?`Ø ${a.days} Tage · ${short(a.first)}–${short(a.last)}`:dayLabel(res.day)}</h2></div>
   <div className="body-controls">
    <div className="segmented small" role="group" aria-label="Ansicht">{[[0,'Tag'],[7,'Ø 7 T.'],[14,'Ø 14 T.'],[30,'Ø 30 T.']].map(([v,l]:any)=><button key={v} aria-pressed={mode===v} className={mode===v?'active':''} onClick={()=>setMode(v)}>{l}</button>)}</div>
    {res&&<div className="day-nav" role="group" aria-label={a?'Zeitraum verschieben':'Tag wählen'}><button className="icon-button" aria-label="Früher" disabled={i>=res.days.length-1||busy} onClick={()=>go(1)}>‹</button>
     <button className="icon-button" aria-label="Später" disabled={i<=0||busy} onClick={()=>go(-1)}>›</button></div>}</div></div>
  {error&&<div className="notice n-liquid panel" role="status">{error}</div>}
  {!res&&busy&&<Skeleton rows={3} label="Schlaf und Tag werden geladen"/>}
  {res&&<div className={busy?'analysis-body busy':'analysis-body'} aria-busy={busy}>
   <div className="analysis-grid body-grid">
    {a?<NightAvg n={a.night} unit={unit}/>:<Night n={res.night} usual={res.usual?.night} unit={unit}/>}
    {a?<DayAvg d={a.day} gs={a.glucoseSummary} unit={unit}/>:<Day d={res.today} usual={res.usual?.day} unit={unit}/>}
   </div>
   <Trends list={res.trends}/>
  </div>}
 </section>;
}
// ── Nacht (einzeln): Glukose mit üblichem Band, Phasen als farbige Blöcke, Anteile gegen üblich ──
function Night({n,usual,unit}:any){
 const [ref,w,el]=useWidth(),[t,move,leave]=useHover(el,8,46,w,n?.from??0,n?.to??1);
 if(!n)return <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">NACHT</span><h3>Kein Schlaf aufgezeichnet</h3></div></div><p className="fine">Für diese Nacht hat die Uhr keinen Schlaf erfasst.</p></article>;
 const H=268,L=8,R=46,T=10,GH=128,gap=24,LH=18,x=(tt:number)=>L+(tt-n.from)/(n.to-n.from)*(w-L-R);
 const ub=(usual?.glucose||[]).map((b:any)=>({...b,time:n.start+(b.offset+5)*60000})).filter((b:any)=>b.time<=n.end);
 const gv=[...n.glucose.map((p:any)=>p.value),...ub.flatMap((b:any)=>[b.p25,b.p75])],gmin=Math.min(60,...gv)-5,gmax=Math.max(200,...gv)+10,gy=(v:number)=>T+(gmax-v)/(gmax-gmin)*GH;
 const lane=(s:string)=>T+GH+gap+STAGES.findIndex(z=>z[0]===s)*LH;
 const gp=t==null?null:near(n.glucose,t,6*60000),st=t==null?null:n.stages.find((s:any)=>t>=s.start&&t<s.end),hp=t==null?null:near(n.hr,t,3*60000),up=t==null?null:near(ub,t,6*60000);
 const gs=n.glucoseSummary,um=usual?.metrics;
 return <article className="analysis-card night-card"><div className="card-top"><div><span className="eyebrow">NACHT</span><h3>{hhmm(n.start)} – {hhmm(n.end)} · {num(n.hours,1)} h{um?.hours!=null&&<small className="vs"> üblich {num(um.hours,1)} h</small>}</h3></div>{n.score!=null&&<span className="score" title="Schlafwert (Garmin)">{n.score}{um?.score!=null&&<small>Ø {um.score}</small>}</span>}</div>
  <div className="agp body-chart" onPointerMove={move} onPointerLeave={leave}>
   <svg ref={ref} viewBox={`0 0 ${w} ${H}`} style={{height:H}} role="img" aria-label={`Nacht von ${hhmm(n.start)} bis ${hhmm(n.end)}: Glukose ${gs.tir} % im Bereich, tiefster Wert ${gs.min}; Schlafphasen darunter.`}>
    <rect x={L} y={gy(180)} width={w-L-R} height={gy(70)-gy(180)} className="agp-range"/>
    {[70,180].map(v=><g key={v}><line x1={L} x2={w-R} y1={gy(v)} y2={gy(v)} className={v===70?'agp-low':'agp-high'}/><text x={w-R+8} y={gy(v)+4}>{format(v,unit)}</text></g>)}
    {ub.length>1&&<><path d={band(ub,x,gy)} className="usual-area"/><path d={path(ub,x,gy,'p50')} className="usual-median"/></>}
    <GlucoseLine pts={n.glucose} x={x} y={gy}/>
    {STAGES.map(([k,l])=><g key={k}><line x1={L} x2={w-R} y1={lane(k)+LH/2} y2={lane(k)+LH/2} className="lane"/><text x={w-R+8} y={lane(k)+LH/2+4}>{l}</text></g>)}
    {n.stages.map((s:any)=><rect key={s.start} x={x(s.start)} y={lane(s.stage)+2} width={Math.max(1,x(s.end)-x(s.start)-.5)} height={LH-4} rx={3} className={'st-'+s.stage}/>)}
    {[n.from,(n.from+n.to)/2,n.to].map((v,k)=><text key={k} x={x(v)} y={H-4} textAnchor={k===0?'start':k===2?'end':'middle'}>{hhmm(v)}</text>)}
    {t!=null&&<line x1={x(t)} x2={x(t)} y1={T} y2={lane('deep')+LH} className="chart-cursor"/>}
    {gp&&<circle cx={x(gp.time)} cy={gy(gp.value)} r={4} className={'body-dot '+(gp.value<70?'low':gp.value>180?'high':'')}/>}
   </svg>
   <div className={'chart-selection n-liquid'+(t!=null?' visible':'')} aria-live="polite">{t!=null?[hhmm(t),gp?`${format(gp.value,unit)} ${unit}`:'kein Glukosewert',up?`üblich ${format(up.p25,unit)}–${format(up.p75,unit)}`:null,st?stageName(st.stage):'außerhalb des Schlafs',hp?`Puls ${Math.round(hp.value)}`:null].filter(Boolean).join(' · '):''}</div>
  </div>
  <Legend items={[...STAGE_LEGEND,['usual-chip','üblich (14 Nächte)']]}/>
  <Composition rows={[{label:'Diese Nacht',v:n},...(um?[{label:`Üblich (Ø ${usual.n})`,v:um}]:[])]}/>
  <dl className="body-stats">
   <div><dt>Glukose nachts</dt><dd>{num(gs.tir)} % im Bereich · min <span className={gs.min!=null&&gs.min<70?'v-low':''}>{format(gs.min,unit)}</span>{gs.lows?<span className="v-low"> · {gs.lows} Tief{gs.lows>1?'s':''}</span>:''}</dd></div>
   <div><dt>HRV · Ruhepuls</dt><dd>{num(n.hrv)} ms{um?.hrv!=null&&<small className="vs"> (Ø {um.hrv})</small>} · {num(n.rhr)} bpm{um?.rhr!=null&&<small className="vs"> (Ø {um.rhr})</small>}</dd></div>
   <div><dt>SpO2 · Atmung</dt><dd>{num(n.spo2)} % (min {num(n.spo2Low)}) · {num(n.respiration)}/min</dd></div>
   <div><dt>Body Battery</dt><dd><span className="v-bb">{n.bbChange!=null?`+${n.bbChange}`:'—'}</span> über Nacht{um?.bbChange!=null&&<small className="vs"> (Ø +{um.bbChange})</small>}</dd></div>
  </dl>
 </article>;
}
// ── Nacht (Durchschnitt): ab dem Einschlafen übereinandergelegt ──
function NightAvg({n,unit}:any){
 const span=Math.max(6*60,...(n?.stageShare||[]).map((b:any)=>b.offset+10)),[ref,w,el]=useWidth(),[t,move,leave]=useHover(el,8,46,w,0,span);
 if(!n)return <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">NÄCHTE</span><h3>Keine Nächte im Zeitraum</h3></div></div></article>;
 const H=268,L=8,R=46,T=10,GH=128,gap=24,SH=72,x=(m:number)=>L+m/span*(w-L-R);
 const g=n.glucose.map((b:any)=>({...b,time:b.offset+5})),gv=g.flatMap((b:any)=>[b.p25,b.p75]),gmin=Math.min(60,...gv)-5,gmax=Math.max(200,...gv)+10,gy=(v:number)=>T+(gmax-v)/(gmax-gmin)*GH;
 const s0=T+GH+gap,order=['deep','light','rem','awake'];
 // Gestapelte Anteile: Tief unten, Wach oben (gleiche Reihenfolge wie die Bahnen der Einzelnacht, umgekehrt gestapelt).
 const layers=order.map((k,li)=>{const lo=(b:any)=>order.slice(0,li).reduce((s,o)=>s+b[o],0),hi=(b:any)=>lo(b)+b[k];const sy=(v:number)=>s0+SH-v*SH;
  const sh=n.stageShare;return {k,d:sh.length?`M${sh.map((b:any)=>`${x(b.offset+5).toFixed(1)} ${sy(hi(b)).toFixed(1)}`).join('L')}L${[...sh].reverse().map((b:any)=>`${x(b.offset+5).toFixed(1)} ${sy(lo(b)).toFixed(1)}`).join('L')}Z`:''};});
 const bin=t==null?null:n.stageShare.find((b:any)=>t>=b.offset&&t<b.offset+10),gb=t==null?null:g.find((b:any)=>t>=b.offset&&t<b.offset+10),m=n.metrics;
 return <article className="analysis-card night-card"><div className="card-top"><div><span className="eyebrow">NÄCHTE · Ø {n.n}</span><h3>Ø {num(m.hours,1)} h Schlaf</h3></div>{m.score!=null&&<span className="score">{m.score}<small>Ø Wert</small></span>}</div>
  <div className="agp body-chart" onPointerMove={move} onPointerLeave={leave}>
   <svg ref={ref} viewBox={`0 0 ${w} ${H}`} style={{height:H}} role="img" aria-label={`Durchschnitt von ${n.n} Nächten ab dem Einschlafen: Glukose als Median mit mittlerer Hälfte, darunter Anteile der Schlafphasen.`}>
    <rect x={L} y={gy(180)} width={w-L-R} height={gy(70)-gy(180)} className="agp-range"/>
    {[70,180].map(v=><g key={v}><line x1={L} x2={w-R} y1={gy(v)} y2={gy(v)} className={v===70?'agp-low':'agp-high'}/><text x={w-R+8} y={gy(v)+4}>{format(v,unit)}</text></g>)}
    <path d={band(g,x,gy)} className="avg-area"/><path d={path(g,x,gy,'p50',30)} className="avg-median draw" pathLength={1}/>
    {layers.map(l=><path key={l.k} d={l.d} className={'st-'+l.k+' stack'}/>)}
    <text x={w-R+8} y={s0+4}>100 %</text><text x={w-R+8} y={s0+SH}>0</text>
    {Array.from({length:Math.floor(span/120)+1},(_,k)=>k*120).map(v=><text key={v} x={x(v)} y={H-4} textAnchor={v===0?'start':'middle'}>{v/60} h</text>)}
    {t!=null&&<line x1={x(t)} x2={x(t)} y1={T} y2={s0+SH} className="chart-cursor"/>}
   </svg>
   <div className={'chart-selection n-liquid'+(t!=null?' visible':'')} aria-live="polite">{t!=null?[`${Math.floor(t/60)} h ${String(Math.floor(t%60)).padStart(2,'0')} nach dem Einschlafen`,gb?`Glukose ${format(gb.p50,unit)} (${format(gb.p25,unit)}–${format(gb.p75,unit)})`:null,bin?order.map(k=>`${stageName(k)} ${Math.round(bin[k]*100)} %`).join(', '):null].filter(Boolean).join(' · '):''}</div>
  </div>
  <Legend items={[...STAGE_LEGEND,['avg-chip','Glukose: Median, mittlere Hälfte']]}/>
  <Composition rows={[{label:`Ø ${n.n} Nächte`,v:m}]}/>
  <dl className="body-stats">
   <div><dt>HRV · Ruhepuls</dt><dd>Ø {num(m.hrv)} ms · Ø {num(m.rhr)} bpm</dd></div>
   <div><dt>SpO2 · Atmung</dt><dd>Ø {num(m.spo2)} % · Ø {num(m.respiration)}/min</dd></div>
   <div><dt>Body Battery</dt><dd><span className="v-bb">Ø +{num(m.bbChange)}</span> über Nacht</dd></div>
  </dl>
 </article>;
}
// ── Tag: Streifen auf einer Zeitachse (einzeln mit üblichem Band, oder Durchschnitt) ──
function Strips({w,refEl,from,to,glucose,glucoseBand,bb,bbBand,stress,stressMedian,stressBand,steps,stepsUsual,unit,readout}:any){
 const [t,move,leave]=useHover(refEl.el,8,46,w,from,to);
 const L=8,R=46,T=10,G=118,B=64,S=64,P=40,gap=22,H=T+G+B+S+P+3*gap+24,x=(tt:number)=>L+(tt-from)/(to-from)*(w-L-R);
 const gv=[...glucose.map((p:any)=>p.value??p.p50),...(glucoseBand||[]).flatMap((b:any)=>[b.p25,b.p75])].filter((v:any)=>v!=null),gmin=Math.min(60,...gv)-5,gmax=Math.max(200,...gv)+10,gy=(v:number)=>T+(gmax-v)/(gmax-gmin)*G;
 const b0=T+G+gap,by=(v:number)=>b0+(100-v)/100*B,s0=b0+B+gap,sy=(v:number)=>s0+(100-v)/100*S,p0=s0+S+gap;
 const smax=Math.max(400,...steps.map((p:any)=>p.value??0),...(stepsUsual||[]).map((p:any)=>p.mean??0)),py=(v:number)=>p0+P-v/smax*P,bw=(w-L-R)/96*.75,hw=(w-L-R)/24*.72;
 const label=(y:number,cls:string,text:string)=><g className="strip-head"><rect x={L} y={y-11} width={8} height={8} rx={2} className={cls}/><text x={L+13} y={y-3} className="strip-label">{text}</text></g>;
 return <div className="agp body-chart" onPointerMove={move} onPointerLeave={leave}>
  <svg ref={refEl.ref} viewBox={`0 0 ${w} ${H}`} style={{height:H}} role="img" aria-label="Tagesverlauf: Glukose, Body Battery, Stress und Schritte je Stunde">
   <rect x={L} y={gy(180)} width={w-L-R} height={gy(70)-gy(180)} className="agp-range"/>
   {[70,180].map(v=><g key={v}><line x1={L} x2={w-R} y1={gy(v)} y2={gy(v)} className={v===70?'agp-low':'agp-high'}/><text x={w-R+8} y={gy(v)+4}>{format(v,unit)}</text></g>)}
   {glucoseBand?.length>1&&<><path d={band(glucoseBand,x,gy)} className={glucose[0]?.p50!=null?'avg-area':'usual-area'}/>{glucose[0]?.p50==null&&<path d={path(glucoseBand,x,gy,'p50',30*60000)} className="usual-median"/>}</>}
   {glucose[0]?.p50!=null?<path d={path(glucose,x,gy,'p50',30*60000)} className="avg-median draw" pathLength={1}/>:<GlucoseLine pts={glucose} x={x} y={gy}/>}
   {label(b0,'s-bb','Body Battery')}
   {bbBand?.length>1&&<path d={band(bbBand,x,by)} className="bb-band"/>}
   <path d={path(bb,x,by,bb[0]?.p50!=null?'p50':'value',40*60000)} className="bb-line draw" pathLength={1}/>
   <text x={w-R+8} y={by(100)+4}>100</text><text x={w-R+8} y={by(0)}>0</text>
   {label(s0,'s-stress','Stress')}
   {stressBand?.length>1&&<path d={band(stressBand,x,sy)} className="stress-band"/>}
   {stress.map((p:any)=><rect key={p.time} x={x(p.time)} y={sy(p.value??p.p50)} width={bw} height={s0+S-sy(p.value??p.p50)} rx={1.5} className="stress-bar"/>)}
   {stressMedian?.length>1&&<path d={path(stressMedian,x,sy,'p50',30*60000)} className="usual-median"/>}
   <text x={w-R+8} y={sy(100)+4}>100</text><text x={w-R+8} y={sy(0)}>0</text>
   {label(p0,'s-steps','Schritte je Stunde')}
   {steps.map((p:any)=><rect key={p.time} x={x(p.time)} y={py(p.value)} width={hw} height={p0+P-py(p.value)} rx={2} className="steps-bar"/>)}
   {(stepsUsual||[]).map((p:any)=><line key={p.time} x1={x(p.time)} x2={x(p.time)+hw} y1={py(p.mean)} y2={py(p.mean)} className="usual-tick"/>)}
   {[0,6,12,18,24].map(h=><text key={h} x={x(from+h*3600000)} y={H-2} textAnchor={h===0?'start':h===24?'end':'middle'}>{String(h).padStart(2,'0')}:00</text>)}
   {t!=null&&<line x1={x(t)} x2={x(t)} y1={T} y2={p0+P} className="chart-cursor"/>}
  </svg>
  <div className={'chart-selection n-liquid'+(t!=null?' visible':'')} aria-live="polite">{t!=null?readout(t):''}</div>
 </div>;
}
const inBin=(list:any[],from:number,t:number,step:number,key='minute')=>list?.find((b:any)=>{const s=from+b[key]*60000;return t>=s&&t<s+step;});
const timed=(list:any[],from:number)=>(list||[]).map((b:any)=>({...b,time:from+(b.minute+7.5)*60000}));
function Day({d,usual,unit}:any){
 const [ref,w,el]=useWidth(),dl=d.daily,um=usual?.metrics;
 const gU=timed(usual?.glucose,d.from),bbU=timed(usual?.bodyBattery,d.from),stU=timed(usual?.stress,d.from),stepsU=(usual?.steps||[]).map((p:any)=>({...p,time:d.from+p.hour*3600000}));
 const readout=(t:number)=>{const gp=near(d.glucose,t,6*60000),bp=near(d.bodyBattery,t,20*60000),sp=near(d.stress,t,8*60000),stp=d.steps.find((p:any)=>t>=p.time&&t<p.time+3600000),
  gu=inBin(usual?.glucose,d.from,t,15*60000),bu=inBin(usual?.bodyBattery,d.from,t,15*60000),su=stepsU.find((p:any)=>t>=p.time&&t<p.time+3600000);
  return [hhmm(t),gp?`${format(gp.value,unit)} ${unit}${gu?` (üblich ${format(gu.p25,unit)}–${format(gu.p75,unit)})`:''}`:null,bp?`Body Battery ${Math.round(bp.value)}${bu?` (üblich ${bu.p25}–${bu.p75})`:''}`:null,sp?`Stress ${Math.round(sp.value)}`:null,stp?`${num(stp.value)} Schritte${su?` (üblich ${num(su.mean)})`:''}`:null].filter(Boolean).join(' · ');};
 return <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">TAG</span><h3>{d.glucoseSummary?`${num(d.glucoseSummary.tir)} % im Bereich`:'Keine Glukosewerte'}{dl?.steps!=null?` · ${num(dl.steps)} Schritte`:''}{um?.steps!=null&&<small className="vs"> üblich {num(um.steps)}</small>}</h3></div></div>
  <Strips w={w} refEl={{ref,el}} from={d.from} to={d.to} glucose={d.glucose} glucoseBand={gU} bb={d.bodyBattery} bbBand={bbU} stress={d.stress} stressMedian={stU} steps={d.steps} stepsUsual={stepsU} unit={unit} readout={readout}/>
  <Legend items={[['g-chip','Glukose'],['s-bb','Body Battery'],['s-stress','Stress'],['s-steps','Schritte'],['usual-chip','üblich (14 Tage)']]}/>
  {dl&&<dl className="body-stats">
   <div><dt>Body Battery</dt><dd><span className="v-bb">{num(dl.bbMin)} – {num(dl.bbMax)}</span>{um?.bbMax!=null&&<small className="vs"> (Ø {um.bbMin}–{um.bbMax})</small>}</dd></div>
   <div><dt>Stress Ø</dt><dd><span className="v-stress">{num(dl.stressAvg)}</span>{um?.stressAvg!=null&&<small className="vs"> (Ø {um.stressAvg})</small>}</dd></div>
   <div><dt>Bereitschaft</dt><dd>{num(dl.readiness)}{um?.readiness!=null&&<small className="vs"> (Ø {um.readiness})</small>}{dl.trainingStatus?` · ${({DETRAINING:'Formverlust',RECOVERY:'Erholung',MAINTAINING:'Halten',PRODUCTIVE:'Produktiv',PEAKING:'Höchstform',UNPRODUCTIVE:'Unproduktiv',OVERREACHING:'Überlastung'} as any)[dl.trainingStatus]||dl.trainingStatus}`:''}</dd></div>
  </dl>}
 </article>;
}
function DayAvg({d,gs,unit}:any){
 const [ref,w,el]=useWidth(),from=0,to=86400000,m=d.metrics;
 const g=timed(d.glucose,from),bb=timed(d.bodyBattery,from),st=timed(d.stress,from),steps=d.steps.map((p:any)=>({time:p.hour*3600000,value:p.mean}));
 const readout=(t:number)=>{const gb=inBin(d.glucose,from,t,15*60000),bb2=inBin(d.bodyBattery,from,t,15*60000),sb=inBin(d.stress,from,t,15*60000),sp=steps.find((p:any)=>t>=p.time&&t<p.time+3600000),h=Math.floor(t/3600000),mm=Math.floor(t/60000)%60;
  return [`${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`,gb?`Glukose ${format(gb.p50,unit)} (${format(gb.p25,unit)}–${format(gb.p75,unit)})`:null,bb2?`Body Battery ${bb2.p50} (${bb2.p25}–${bb2.p75})`:null,sb?`Stress ${sb.p50}`:null,sp?`Ø ${num(sp.value)} Schritte`:null].filter(Boolean).join(' · ');};
 return <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">TAGE · Ø {d.n}</span><h3>{gs?.tir!=null?`${num(gs.tir)} % im Bereich`:''}{m.steps!=null?` · Ø ${num(m.steps)} Schritte`:''}</h3></div></div>
  <Strips w={w} refEl={{ref,el}} from={from} to={to} glucose={g} glucoseBand={g} bb={bb} bbBand={bb} stress={[]} stressBand={st} stressMedian={st} steps={steps} unit={unit} readout={readout}/>
  <Legend items={[['avg-chip','Median, mittlere Hälfte'],['s-bb','Body Battery'],['s-stress','Stress'],['s-steps','Ø Schritte']]}/>
  <dl className="body-stats">
   <div><dt>Body Battery</dt><dd><span className="v-bb">Ø {num(m.bbMin)} – {num(m.bbMax)}</span></dd></div>
   <div><dt>Stress Ø</dt><dd><span className="v-stress">{num(m.stressAvg)}</span></dd></div>
   <div><dt>Bereitschaft</dt><dd>Ø {num(m.readiness)}</dd></div>
  </dl>
 </article>;
}
// ── 4 Wochen: Wert gegen deinen üblichen Bereich als Balken, darunter der Verlauf ──
function Trends({list}:any){
 if(!list?.some((t:any)=>t.series.some((p:any)=>p.value!=null)))return null;
 return <article className="analysis-card"><div className="card-top"><div><span className="eyebrow">4 WOCHEN</span><h3>Im Vergleich zu deinem Üblichen</h3></div></div>
  <div className="trend-tiles">{list.map((t:any)=><TrendTile key={t.key} t={t}/>)}</div>
  <More label="Was heißt „üblich“?"><p className="fine tight">Üblich ist die mittlere Hälfte deiner Werte aus den 28 Tagen davor (dunkler Abschnitt im Balken, helles Band im Verlauf). „Höher“ oder „niedriger“ heißt: außerhalb davon. Garmin-Werte sind Schätzungen der Uhr; das ist eine Beschreibung, keine Bewertung.</p></More>
 </article>;
}
function TrendTile({t}:any){
 const vals=t.series.map((p:any)=>p.value).filter((x:any)=>x!=null),lo=Math.min(...vals,t.usual?.lo??Infinity),hi=Math.max(...vals,t.usual?.hi??-Infinity),pad=(hi-lo)*.12||1,a=lo-pad,b=hi+pad,pc=(v:number)=>(v-a)/(b-a)*100;
 const W=140,Hh=36,x=(i:number)=>i/(t.series.length-1)*W,y=(v:number)=>Hh-(v-a)/(b-a)*Hh;
 const d=t.series.reduce((s:string,p:any,i:number,arr:any[])=>p.value==null?s:s+(i&&arr[i-1].value!=null?'L':'M')+`${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`,'');
 const diff=t.value!=null&&t.usual?t.value-t.usual.median:null,dir=t.status==='höher'?'↑':t.status==='niedriger'?'↓':'';
 return <div className={'trend-tile '+(t.status||'')}><span className="eyebrow">{t.label}</span>
  <b>{num(t.value,t.d)}{t.value!=null&&t.unit?<small> {t.unit}</small>:''}{dir&&<em className="dir"> {dir}</em>}</b>
  {t.usual&&<div className="bullet" role="img" aria-label={`Heute ${num(t.value,t.d)}, üblich ${num(t.usual.lo,t.d)} bis ${num(t.usual.hi,t.d)}`}>
   <i className="bullet-usual" style={{left:pc(t.usual.lo)+'%',width:Math.max(1,pc(t.usual.hi)-pc(t.usual.lo))+'%'}}/>
   {t.value!=null&&<i className="bullet-mark" style={{left:pc(t.value)+'%'}}/>}</div>}
  <svg viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="none" className="trend-spark" aria-hidden="true">
   {t.usual&&<rect x={0} y={y(t.usual.hi)} width={W} height={Math.max(1,y(t.usual.lo)-y(t.usual.hi))} className="usual-band"/>}
   <path d={d} className="spark-line draw" pathLength={1}/></svg>
  <small>{t.status==='höher'?'höher als üblich':t.status==='niedriger'?'niedriger als üblich':t.status==='üblich'?'im üblichen Bereich':t.usual?'heute kein Wert':'noch zu wenige Tage'}{diff!=null&&t.status!=='üblich'?` · ${diff>0?'+':'−'}${num(Math.abs(diff),t.d)} zum Median`:t.usual?` · üblich ${num(t.usual.lo,t.d)}–${num(t.usual.hi,t.d)}`:''}</small>
 </div>;
}
