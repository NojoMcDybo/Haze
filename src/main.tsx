import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Icon} from './Icon';
import {arrows,category,statusText,format,freshness,delta,demo,defaults} from '../shared/model.mjs';
import './nojo/nojo-ui.css';
import './style.css';
import {glassLight,lightScroller,liquid,segments,windowControls} from './nojo/nojo-ui';
import {Widget} from './Widget';
import {GarminPanel,useGarminConnection} from './Garmin';
import {heartSegments,nearestHeartRate} from '../shared/garmin.mjs';
import {DockLab} from './DockLab';
import {widgetDefaults,migrate} from '../shared/widget.mjs';
declare global {interface Window {nebel?:any;}}
const desktop=!!window.nebel;
const overlay=new URLSearchParams(location.search).has('overlay');
const taskbar=new URLSearchParams(location.search).has('taskbar');
const preview=new URLSearchParams(location.search).has('preview');
const demoState=()=>({config:{...migrate({},defaults()),configured:true},feed:{entries:demo(),error:null,checkedAt:Date.now(),future:0,rejected:0},systemDark:matchMedia('(prefers-color-scheme: dark)').matches,version:'1.1.0',shortcutError:null,update:{configured:false,message:'Noch keine Veröffentlichungsquelle eingerichtet.'}});
let previewState=demoState();
if(preview){try{previewState.config=migrate(JSON.parse(localStorage.getItem('nebel-demo-display')||'{}'),previewState.config);}catch{}}
const api={
 async getState(){if(desktop)return window.nebel.getState();if(preview)return previewState;const r=await fetch('/api/state');if(!r.ok)throw Error('Lokale Anwendung nicht erreichbar. Haze starten und die Webansicht erneut öffnen.');return r.json();},
 async action(type:string,payload:any={}){
  if(desktop)return window.nebel.action(type,payload);
  if(preview){
   if(type==='test')return payload.source==='demo'?{ok:true,entries:demo()}:{ok:false,error:'Die reine Designvorschau verbindet keine Gesundheitsdaten. Bitte die installierte Haze-App verwenden.'};
   if(type==='connect'&&payload.source==='nightscout')return {error:'Nightscout bitte in der installierten App verbinden.'};
   if(type==='settings'){
    if('autoStart' in payload||'shortcut' in payload||'clickThrough' in payload||'locked' in payload)return {error:'Diese Windows-Funktion ist in der installierten App verfügbar.'};
    Object.assign(previewState.config,payload);localStorage.setItem('nebel-demo-display',JSON.stringify(previewState.config));
   }
   if(type==='profile')Object.assign(previewState.config,previewState.config.profiles[payload.name],{profile:payload.name});
   if(type==='refresh')previewState.feed.entries=demo();
   if(type==='overlay')location.search='?preview=1&overlay=1';
   if(type==='hide-overlay'||type==='dashboard')location.href='?preview=1'+(payload.settings?'#settings':'');
   if(type==='updates')return {configured:false,message:'Keine Veröffentlichungsquelle eingerichtet.'};
   if(type==='save-profile')return {error:'Profile bitte in der installierten App speichern.'};
   if(type==='reset')return {error:'Das Zurücksetzen betrifft das native Fenster in der installierten App.'};
   dispatchEvent(new Event('preview-change'));return {ok:true};
  }
  const r=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,payload})});return r.json();
 },
 subscribe(fn:any){if(desktop)return window.nebel.subscribe(fn);if(preview){const cb=()=>fn({...previewState,config:{...previewState.config}});addEventListener('preview-change',cb);return()=>removeEventListener('preview-change',cb);}const e=new EventSource('/api/events');e.onmessage=m=>fn(JSON.parse(m.data));return()=>e.close();}
};
function ThemeSwitch({theme,onChange,glass}:any){return <div className={'theme-switch'+(glass?' n-liquid':'')} role="group" aria-label="Farbschema">{[['light','sun','Hell'],['dark','moon','Dunkel'],['system','auto','System']].map(([v,icon,label]:any)=><button key={v} className={theme===v?'selected':''} aria-label={label} title={label} aria-pressed={theme===v} onClick={()=>onChange(v)}><Icon name={icon} size={17}/></button>)}</div>}
function Chart({entries,hours=3,unit,now,compact=false,heart=[],heartActive=false}:any){
 const [selected,setSelected]=useState<number|null>(null),[hover,setHover]=useState<number|null>(null);const svg=useRef<SVGSVGElement>(null);const [dimensions,setDimensions]=useState({width:900,height:compact?130:260});
 useEffect(()=>{if(!svg.current)return;const ro=new ResizeObserver(([entry])=>{setDimensions({width:Math.max(120,entry.contentRect.width),height:Math.max(70,entry.contentRect.height)});});ro.observe(svg.current);return()=>ro.disconnect();},[]);
 const {points,low,high,start,end,min,max}=useMemo(()=>{const end=Math.floor(now/60000)*60000+60000,start=end-hours*3600000;const pts=entries.filter((e:any)=>e.time>=start&&e.time<=end);return {points:pts,low:70,high:180,start,end,min:Math.min(40,...pts.map((p:any)=>p.value-15)),max:Math.max(220,...pts.map((p:any)=>p.value+20))};},[entries,hours,Math.floor(now/60000)]);
 const segments=useMemo(()=>compact?[]:heartSegments(heart||[],start,end),[heart,start,end,compact]);
 const showHeart=!compact&&(segments.length>0||heartActive);
 const W=dimensions.width,H=dimensions.height,L=compact?6:14,R=compact?35:45,T=compact?8:20,B=compact?20:showHeart?10:30;
 const xp=(t:number)=>L+(t-start)/(end-start)*(W-L-R),yp=(v:number)=>T+(max-v)/(max-min)*(H-T-B);
 useEffect(()=>{setSelected(null);setHover(null);},[hours,entries]);
 const time=(t:number)=>new Date(t).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
 // Shared time cursor: hover (pointer) or the selected glucose point drives both panels.
 const nearestPoint=(t:number)=>{let best=-1;points.forEach((p:any,i:number)=>{if(Math.abs(p.time-t)<=300000&&(best<0||Math.abs(p.time-t)<Math.abs(points[best].time-t)))best=i;});return best;};
 const cursorTime=hover??(selected==null?null:points[selected]?.time??null);
 const point=cursorTime==null?null:(hover!=null?points[nearestPoint(hover)]:points[selected!])||null;
 const pulse=cursorTime==null||!showHeart?null:nearestHeartRate(heart||[],point?.time??cursorTime);
 const move=(e:React.PointerEvent)=>{if(compact)return;const r=svg.current?.getBoundingClientRect();if(!r)return;const x=e.clientX-r.left;if(x<L||x>W-R){setHover(null);return;}setHover(start+(x-L)/(W-L-R)*(end-start));};
 const cursorX=cursorTime==null?null:xp(point?.time??cursorTime);
 const readout=cursorTime==null?'':[time(point?.time??cursorTime),point?`${format(point.value,unit)} ${unit}`:'kein Glukosewert',showHeart?(pulse?`♥ ${pulse.bpm} bpm`:'kein Puls'):null].filter(Boolean).join(' · ');
 return <div className={'chart '+(compact?'compact':'')} onPointerMove={move} onPointerLeave={()=>setHover(null)}>
 <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Glukoseverlauf der letzten ${hours} Stunden. Messpunkte mit Tab auswählen, Pfeiltasten zum Wechseln.`} preserveAspectRatio="none">
 <rect x={L} y={yp(high)} width={W-L-R} height={yp(low)-yp(high)} fill="var(--range)"/>
 {[high,low].map(v=><g key={v}><line x1={L} x2={W-R} y1={yp(v)} y2={yp(v)} stroke={v===low?'var(--low)':'var(--high)'} strokeWidth="1.2"/><text x={W-R+14} y={yp(v)+5} fill={v===low?'var(--low)':'var(--high)'}>{format(v,unit)}</text></g>)}
 <line x1={W-R} x2={W-R} y1={T} y2={H-B} stroke="var(--border)" strokeDasharray="3 5"/>
 {!showHeart&&[0,.5,1].map(v=><text key={v} x={L+v*(W-L-R)} y={H-8} textAnchor={v===0?'start':v===1?'end':'middle'} fill="var(--muted)">{time(start+(end-start)*v)}</text>)}
 {cursorX!=null&&<line className="chart-cursor" x1={cursorX} x2={cursorX} y1={T} y2={H-B}/>}
 {points.map((p:any,i:number)=><circle key={p.time} cx={xp(p.time)} cy={yp(p.value)} r={Math.max(1.2,Math.min(compact?2.6:4.1,(W-L-R)/Math.max(points.length,1)/2.6))} className={'point '+category(p.value)+(selected===i||point===p?' active':'')} tabIndex={i===(selected??points.length-1)?0:-1} role="button" aria-label={`${time(p.time)}: ${format(p.value,unit)} ${unit}, ${statusText(p.value)}${showHeart?((h:any)=>h?`, Puls ${h.bpm} bpm`:'')(nearestHeartRate(heart||[],p.time)):''}`} onClick={()=>setSelected(i)} onFocus={()=>setSelected(i)} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const n=Math.max(0,Math.min(points.length-1,i+(e.key==='ArrowLeft'?-1:1)));setSelected(n);(svg.current?.querySelectorAll('.point')[n] as SVGElement)?.focus();}if(e.key==='Escape')setSelected(null);}}/>)}</svg>
 {!points.length&&<div className="empty-chart">Keine Messungen in diesem Zeitraum</div>}
 {showHeart&&<HeartPanel segments={segments} start={start} end={end} W={W} L={L} R={R} cursorX={cursorX} pulse={pulse} time={time}/>}
 <div className={'chart-selection n-liquid'+(cursorTime!=null?' visible':'')} style={{'--x':cursorX==null?.5:cursorX/W} as any} aria-live="polite">{readout}</div>
 </div>;
}
// Pulse as its own panel under the glucose chart: same time axis, own bpm scale (never a second y-axis).
function HeartPanel({segments,start,end,W,L,R,cursorX,pulse,time}:any){
 const H=104,T=12,B=26,all=segments.flat(),lo=all.length?Math.min(...all.map((h:any)=>h.bpm)):60,hi=all.length?Math.max(...all.map((h:any)=>h.bpm)):100;
 const pad=Math.max(5,(20-(hi-lo))/2),min=Math.floor(lo-pad),max=Math.ceil(hi+pad);
 const xp=(t:number)=>L+(t-start)/(end-start)*(W-L-R),yp=(v:number)=>T+(max-v)/(max-min)*(H-T-B);
 const last=all.at(-1);
 return <div className="heart-panel">
  <div className="heart-head"><span className="eyebrow">PULS</span><span className="chart-label">bpm</span></div>
  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={all.length?`Pulsverlauf: ${all.length} Minutenwerte zwischen ${lo} und ${hi} bpm, zuletzt ${last.bpm} bpm um ${time(last.time)}.`:'Noch kein Pulsverlauf in diesem Zeitraum.'}>
   <line x1={W-R} x2={W-R} y1={T} y2={H-B} stroke="var(--border)" strokeDasharray="3 5"/>
   {all.length>0&&[hi,lo].filter((v,i,a)=>a.indexOf(v)===i).map(v=><text key={v} x={W-R+14} y={yp(v)+4} fill="var(--muted)">{v}</text>)}
   {segments.map((seg:any[],i:number)=>seg.length>1?<path key={i} className="heart-line" d={seg.map((h:any,j:number)=>`${j?'L':'M'}${xp(h.time).toFixed(1)} ${yp(h.bpm).toFixed(1)}`).join(' ')}/>:<circle key={i} className="heart-dot" cx={xp(seg[0].time)} cy={yp(seg[0].bpm)} r="2.5"/>)}
   {cursorX!=null&&<line className="chart-cursor" x1={cursorX} x2={cursorX} y1={T} y2={H-B}/>}
   {cursorX!=null&&pulse&&<circle className="heart-marker" cx={xp(pulse.time)} cy={yp(pulse.bpm)} r="4"/>}
   {[0,.5,1].map(v=><text key={v} x={L+v*(W-L-R)} y={H-8} textAnchor={v===0?'start':v===1?'end':'middle'} fill="var(--muted)">{time(start+(end-start)*v)}</text>)}
  </svg>
  {!all.length&&<div className="empty-chart small">Pulsverlauf erscheint, sobald die Uhr Werte sendet</div>}
 </div>;
}
function Value({state,now,small=false}:any){const c=state.config,f=freshness(state.feed.entries,now,c.staleMinutes),v=f.last?.value;return <>
 <div className={'reading '+(v!=null?category(v):'')+(f.stale?' stale':'')}><span className="number">{format(v,c.unit)}</span><span className="trend" aria-label={f.stale?'Trend veraltet':f.last?.trend?'Trend '+f.last.trend:'Trend unbekannt'}>{f.stale?'':arrows[f.last?.trend]||'·'}</span></div>
 <div className="eyebrow reading-unit">{c.unit} <span>·</span> {c.source==='demo'?'DEMO':'DEXCOM / NIGHTSCOUT'}</div>
 <div className={'age '+(f.stale?'warning':'')}>{f.text}</div>
 {f.last&&<div className={'age-line'+(f.stale?' stale':'')} key={f.last.time} title={f.stale?'Messung veraltet':'Bis zum nächsten Messwert (etwa alle 5 Minuten)'} style={{['--p' as any]:Math.min(1,Math.max(0,(now-f.last.time)/300000))}}><i/></div>}
 {!small&&<div className="reading-meta"><span className={'status-pill '+(v!=null?category(v):'')}>{statusText(v)}</span>{c.showDelta&&<span className="delta">{delta(state.feed.entries,c.unit)||'Änderung nicht verfügbar'}</span>}</div>}
 </>}
function ErrorNote({state}:any){return <>{state.widgetFrame?.shapeError&&<div className="notice warning n-liquid panel" role="status">{state.widgetFrame.shapeError}</div>}{state.feed.error&&<div role="status" className="notice warning n-liquid panel"><Icon name="wifi-off" size={16}/><span>{state.feed.error} Der letzte bekannte Wert bleibt sichtbar.</span></div>}{state.feed.future>0&&<div className="notice warning n-liquid panel">Zeitstempel in der Zukunft: {state.feed.future} Messung(en) ausgeblendet. Gerätezeit prüfen.</div>}{state.shortcutError&&<div className="notice warning n-liquid panel">{state.shortcutError}</div>}</>}
function Group({title,hint,open,children}:any){return <details className="settings-group" open={open}><summary><span>{title}</span>{hint&&<small>{hint}</small>}</summary><div className="group-body">{children}</div></details>}
function Segmented({label,value,options,onChange}:any){return <div className="field" role="group" aria-label={label}>{label}<div className="segmented compact">{options.map(([v,text]:any)=><button key={v} type="button" aria-pressed={value===v} className={value===v?'active':''} onClick={()=>onChange(v)}>{text}</button>)}</div></div>}
function Toggle({label,value,onChange,help,tip}:any){return <label className="toggle-row" title={tip}><span>{label}{help&&<small>{help}</small>}</span><input type="checkbox" checked={!!value} onChange={e=>onChange(e.target.checked)}/><span className="toggle" aria-hidden="true"/></label>}
function ConnectionForm({state,act,onDone,wizard=false}:any){const [source,setSource]=useState(state.config.source),[url,setUrl]=useState(state.config.url),[token,setToken]=useState(''),[tested,setTested]=useState<any>(null),[busy,setBusy]=useState(false);const c=state.config;return <>
 <div className="segmented wide">{[['demo','Demo erkunden'],['nightscout','Nightscout verbinden']].map(([v,label])=><button key={v} className={source===v?'active':''} onClick={()=>{setSource(v);setTested(null);}}>{label}</button>)}</div>
 {source==='nightscout'?<><label className="field">Nightscout-Adresse<input type="url" value={url} onChange={e=>{setUrl(e.target.value);setTested(null);}} placeholder="https://nightscout.example"/></label><label className="field">Lesetoken<input type="password" autoComplete="off" value={token} onChange={e=>{setToken(e.target.value);setTested(null);}} placeholder={c.hasToken?'Gespeicherten Token beibehalten':'Token mit Leserechten'}/><small>Verschlüsselt gespeichert · bei frei lesbarer Instanz leer lassen</small></label><button className="button secondary full" disabled={busy} onClick={async()=>{setBusy(true);try{setTested(await act('test',{source,url,...(token?{token}:{})}));}finally{setBusy(false);}}}><Icon name="refresh" size={16}/>{busy?'Verbindung wird geprüft …':'Verbindung testen'}</button>{tested&&<div className={'notice '+(!tested.ok?'warning':'')}>{tested.ok?(tested.entries?.length?`Server erreichbar · Letzter Wert: ${format(tested.entries.at(-1).value,c.unit)} ${c.unit}, ${new Date(tested.entries.at(-1).time).toLocaleString('de-DE')}${freshness(tested.entries,Date.now(),c.staleMinutes).stale?' · VERALTET':''}`:'Server erreichbar, aber keine gültigen Messwerte vorhanden.'):(tested.error||'Test fehlgeschlagen')}</div>}</>:<p className="muted">Beispieldaten, klar gekennzeichnet. Nightscout lässt sich jederzeit verbinden.</p>}
 <div className="two-columns"><label className="field">Einheit<select value={c.unit} onChange={e=>act('settings',{unit:e.target.value})}><option>mg/dL</option><option>mmol/L</option></select></label><div className="field">Darstellung<ThemeSwitch theme={c.theme} onChange={(theme:string)=>act('settings',{theme})}/></div></div>
 {wizard&&<><Toggle label="Mit Windows starten" value={c.autoStart} onChange={(v:boolean)=>act('settings',{autoStart:v})}/><Toggle label="Beim Start nur Widget anzeigen" value={c.overlayOnly} onChange={(v:boolean)=>act('settings',{overlayOnly:v})}/><p className="fine">Für Spiele: Fenster oder randloses Vollbild – exklusives Vollbild verdeckt das Widget.</p><p className="fine">Haze ist kein Medizinprodukt. Werte und Hinweise können verzögert, unvollständig oder falsch sein. Therapieentscheidungen nur mit deinem zugelassenen CGM-System oder einer Blutzuckermessung treffen.</p></>}
 <button className="button primary full" disabled={busy||(source==='nightscout'&&!tested?.ok)} onClick={async()=>{const result=await act('connect',{source,url,...(token?{token}:{})});if(!result?.error)onDone();}}>{wizard?'Dashboard öffnen':'Verbindung übernehmen'}<Icon name="open" size={18}/></button>
 </>}
function SettingsPanel({state,act,close,garmin,initial='connection'}:any){const bodyRef=useRef<HTMLDivElement>(null);useEffect(()=>{const el=bodyRef.current;if(!el)return;const s=lightScroller(el,{insetTop:8});return()=>s.dispose();},[]);const [tab,setTab]=useState(initial),[hotkey,setHotkey]=useState(state.config.shortcut);const c=state.config;
 return <div className="backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}><section className="settings-panel n-liquid panel" data-refract="10" role="dialog" aria-modal="true" aria-label="Einstellungen"><div className="panel-head"><div><div className="eyebrow">DEIN ARBEITSPLATZ</div><h2>Einstellungen</h2></div><button className="icon-button" aria-label="Schließen" onClick={close}><Icon name="close"/></button></div><div className="panel-body" ref={bodyRef}><nav className="settings-tabs n-seg n-liquid panel">{[['connection','Verbindung'],['garmin','Garmin'],['display','Anzeige'],['overlay','Widget'],['app','App']].map(([v,label])=><button key={v} className={tab===v?'active':''} onClick={()=>setTab(v)}>{label}</button>)}</nav>
 {tab==='garmin'&&<GarminPanel state={state} connection={garmin}/>}
 {tab==='connection'&&<ConnectionForm state={state} act={act} onDone={close}/>}
 {tab==='display'&&<><ThemeSwitch theme={c.theme} onChange={(theme:string)=>act('settings',{theme})}/><label className="field">Einheit<select value={c.unit} onChange={e=>act('settings',{unit:e.target.value})}><option>mg/dL</option><option>mmol/L</option></select></label><Toggle label="Änderung zum vorherigen Wert" tip="Mit dem tatsächlichen Zeitabstand zwischen beiden Messungen" value={c.showDelta} onChange={(showDelta:boolean)=>act('settings',{showDelta})}/><label className="field">Als veraltet markieren nach (Minuten)<input type="number" min="1" max="60" value={c.staleMinutes} onChange={e=>{const v=Number(e.target.value);if(v>=1&&v<=60)act('settings',{staleMinutes:v});}}/></label><p className="fine">Niedrig bis 70 · hoch ab 180 mg/dL</p></>}
 {tab==='overlay'&&<>
 <div className="widget-preview"><Widget state={state} act={act} now={Date.now()} embedded/></div>
 <Toggle label="Widget anzeigen" tip="Doppelklick auf das Widget öffnet diese App" value={state.overlayVisible} onChange={(v:boolean)=>act(v?'overlay':'hide-overlay')}/>
 <Group title="Darstellung" hint={`${c.fontSize} px · ${({auto:'Automatisch',horizontal:'Horizontal',vertical:'Vertikal'} as any)[c.alignment]} · Schrift ${({auto:'wie Theme',light:'hell',dark:'dunkel'} as any)[c.widgetText||'auto']}`} open>
  <label className="field">Schriftgröße · {c.fontSize} px<div className="range-row"><input aria-label="Schriftgröße" type="range" min="20" max="120" step="1" value={c.fontSize} onChange={e=>act('settings',{fontSize:+e.target.value})}/><button className="link-button" disabled={c.fontSize===48} onClick={()=>act('settings',{fontSize:48})}>Standard</button></div></label>
  <Toggle label="Rahmen passt sich der Schrift an" help={c.autoSize!==false?undefined:'Größe an den Rändern ziehen'} value={c.autoSize!==false} onChange={(autoSize:boolean)=>act('settings',{autoSize})}/>
  <Segmented label="Ausrichtung" value={c.alignment} options={[['auto','Automatisch'],['horizontal','Horizontal'],['vertical','Vertikal']]} onChange={(alignment:string)=>act('settings',{alignment})}/>
  <Segmented label="Schriftfarbe" value={c.widgetText||'auto'} options={[['auto','Wie Theme'],['light','Hell'],['dark','Dunkel']]} onChange={(widgetText:string)=>act('settings',{widgetText})}/>
 </Group>
 <Group title="Oberfläche" hint={c.surface==='glass'?`Liquid Glass · ${Math.round((1-c.glassOpacity)*100)} % transparent`:'Klar'}>
  <Segmented label="Material" value={c.surface} options={[['clear','Klar'],['glass','Liquid Glass']]} onChange={(surface:string)=>act('settings',{surface})}/>
  {c.surface==='glass'&&<>
   <label className="field">Transparenz · {Math.round((1-c.glassOpacity)*100)} %<input aria-label="Transparenz" type="range" min="0" max="95" step="1" value={Math.round((1-c.glassOpacity)*100)} onChange={e=>act('settings',{glassOpacity:1-Number(e.target.value)/100})}/></label>
   <Toggle label="Echte Hintergrundbrechung" value={c.nativeGlass} onChange={(nativeGlass:boolean)=>act('settings',{nativeGlass})} help="Fehlt dann in Screenshots" tip="Bricht den Desktop lokal auf der Grafikkarte"/>
   {c.nativeGlass&&<label className="field">Weichzeichnung · {c.glassBlur} px<input aria-label="Weichzeichnung" type="range" min="0" max="18" step="1" value={c.glassBlur} onChange={e=>act('settings',{glassBlur:Number(e.target.value)})}/></label>}
   <p className="fine" role="status">{state.glassStatus?.message||'Glas startet mit dem Desktop-Widget.'}</p>
  </>}
 </Group>
 <Group title="Rand & Bewegung" hint={`${c.snap?'Andocken an':'Andocken aus'} · ${({fluid:'flüssig',direct:'direkt',locked:'gesperrt'} as any)[c.detach||'fluid']}${c.dock?' · angedockt':''}`}>
  <Toggle label="Am Bildschirmrand andocken" value={c.snap} onChange={(snap:boolean)=>act('settings',{snap})}/>
  {c.snap&&<><Segmented label="Ablösen vom Rand" value={c.detach||'fluid'} options={[['fluid','Flüssig'],['direct','Direkt'],['locked','Gesperrt']]} onChange={(detach:string)=>act('settings',{detach})}/>
  <p className="fine tight">{(c.detach||'fluid')==='locked'?'Gleitet nur am Rand entlang':(c.detach||'fluid')==='direct'?'Löst sich sofort; nah am Rand loslassen dockt an':'Ziehen dehnt die Verbindung, bis sie reißt'}</p>
  {(c.detach||'fluid')==='fluid'&&<label className="field">Haftstrecke · {c.adhesion??103} px<input aria-label="Haftstrecke" type="range" min="35" max="145" step="1" value={c.adhesion??103} onChange={e=>act('settings',{adhesion:Number(e.target.value)})}/></label>}</>}
  {!c.reduceMotion&&<label className="field">Flüssigkeitseffekt · {c.fluid??55} %<input aria-label="Flüssigkeitseffekt" type="range" min="0" max="100" step="1" value={c.fluid??55} onChange={e=>act('settings',{fluid:Number(e.target.value)})}/></label>}
  <Toggle label="Bewegung reduzieren" value={c.reduceMotion} tip="Ohne Federn; die Windows-Einstellung gilt ebenfalls" onChange={(reduceMotion:boolean)=>act('settings',{reduceMotion})}/>
  {c.dock&&<button className="button secondary full" onClick={()=>act('undock')}>Vom Rand lösen</button>}
 </Group>
 <Group title="Bedienung" hint={[c.locked&&'gesperrt',c.clickThrough&&'durchklickbar'].filter(Boolean).join(' · ')||'frei beweglich'}>
  <Toggle label="Position sperren" value={c.locked} onChange={(locked:boolean)=>act('settings',{locked})}/>
  <Toggle label="Durchklicken" help="Zurück per Tastenkürzel oder Infobereich" value={c.clickThrough} onChange={(clickThrough:boolean)=>act('settings',{clickThrough})}/>
  <label className="field">Tastenkombination für Durchklicken<div className="input-action"><input value={hotkey} onChange={e=>setHotkey(e.target.value)}/><button className="button secondary" onClick={()=>act('settings',{shortcut:hotkey})}>Setzen</button></div></label>
  <button className="button secondary full" onClick={()=>act('reset')}><Icon name="restart" size={17}/>Position und Größe zurücksetzen</button>
 </Group>
 <Group title="Weitere Anzeigen" hint={[c.notch!==false&&'Notch',c.taskbarVisible&&'Taskleiste'].filter(Boolean).join(' · ')||'keine'}>
  <Toggle label="Wert an Notch senden" tip="Nur lokal an die Notch-App (127.0.0.1:47800). Läuft sie nicht, passiert nichts." value={c.notch!==false} onChange={(notch:boolean)=>act('settings',{notch})}/>
  <Toggle label="Anzeige an der Taskleiste" tip="Schmale Anzeige direkt außerhalb der Taskleiste" value={c.taskbarVisible} onChange={(taskbarVisible:boolean)=>act('settings',{taskbarVisible})}/>
  {c.taskbarVisible&&<label className="field">Monitor<select value={c.taskbarMonitor??''} onChange={e=>act('settings',{taskbarMonitor:e.target.value?+e.target.value:null})}><option value="">Hauptmonitor</option>{(state.displays||[]).map((d:any)=><option key={d.id} value={d.id}>{d.label}</option>)}</select></label>}
 </Group>
 <div className="profile-card"><div><h3>Profil {c.profile}</h3></div><button className="button primary" title="Speichert Darstellung, Oberfläche, Rand-Verhalten, Größe, Sperre und Durchklicken" onClick={()=>act('save-profile')}>Im Profil speichern<Icon name="check" size={17}/></button></div>
 </>}
 {tab==='app'&&<><div className="version-card"><span className="brand">Haze</span><span className="eyebrow">VERSION {state.version}</span></div><Toggle label="Mit Windows starten" value={c.autoStart} onChange={(autoStart:boolean)=>act('settings',{autoStart})}/><Toggle label="Beim Start nur Widget anzeigen" value={c.overlayOnly} onChange={(overlayOnly:boolean)=>act('settings',{overlayOnly})}/><p className="fine">Schließen blendet das Dashboard nur aus – beenden über den Infobereich.</p><button className="button secondary full" onClick={()=>act('web')}><Icon name="external" size={17}/>Lokale Webansicht öffnen</button><div className="divider"/><h3>Updates</h3><p className="muted" role="status">{state.update.message}</p>{state.update.status==='available'?<button className="button primary full" onClick={()=>act('install-update')}><Icon name="download" size={17}/>Haze {state.update.version} installieren</button>:<button className="button secondary full" disabled={!state.update.configured||['checking','downloading','installing'].includes(state.update.status)} onClick={()=>act('updates')}><Icon name="refresh" size={17}/>Nach Updates suchen</button>}<p className="fine">Sucht beim Start und alle 6 Stunden – installiert nur auf deinen Klick; Einstellungen bleiben.</p><p className="fine">Haze ist kein Medizinprodukt. Werte und Hinweise können verzögert, unvollständig oder falsch sein. Therapieentscheidungen nur mit deinem zugelassenen CGM-System oder einer Blutzuckermessung treffen.</p></>}
 </div></section></div>;
}
function App(){const garmin=useGarminConnection();const [state,setState]=useState<any>(null),[fatal,setFatal]=useState(''),[now,setNow]=useState(Date.now()),[hours,setHours]=useState(3),[settings,setSettings]=useState<string|null>(location.hash==='#settings'?'connection':null),[toast,setToast]=useState('');
 useEffect(()=>{api.getState().then(setState).catch(e=>setFatal(e.message));const unsub=api.subscribe(setState);const timer=setInterval(()=>setNow(Date.now()),1000);const online=()=>api.action('refresh');addEventListener('online',online);const unsubSettings=window.nebel?.onSettings(()=>setSettings('connection'));return()=>{unsub();clearInterval(timer);removeEventListener('online',online);unsubSettings?.();}},[]);
 useEffect(()=>{if(!state)return;const theme=state.config.theme==='system'?(state.systemDark?'dark':'light'):state.config.theme;document.documentElement.dataset.theme=theme;document.documentElement.classList.toggle('overlay-document',overlay||taskbar);document.body.classList.toggle('overlay-body',overlay||taskbar);document.body.classList.toggle('native-dashboard',desktop&&!overlay&&!taskbar);},[state?.config.theme,state?.systemDark]);
 useEffect(()=>{if(toast){const id=setTimeout(()=>setToast(''),5000);return()=>clearTimeout(id);}},[toast]);
 // gemeinsame Designsprache (src/nojo): Licht auf Glas, Perlen in Segmenten, Lichtleiste, Fensterknoepfe als Glaspille
 const loaded=!!state;
 useEffect(()=>{if(!loaded||overlay||taskbar)return;glassLight();liquid();const stopSeg=segments(document,'.n-seg, .segmented, .theme-switch');const sc=lightScroller(document.scrollingElement as HTMLElement,{insetTop:70});const wc=desktop?windowControls({minimize:()=>void api.action('window',{op:'minimize'}),toggleMaximize:()=>void api.action('window',{op:'maximize'}),close:()=>void api.action('window',{op:'close'})}):null;return()=>{stopSeg();sc.dispose();wc?.remove();};},[loaded]);
 useEffect(()=>{if(!settings)return;const old=document.activeElement as HTMLElement;const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setSettings(null);if(e.key==='Tab'){const elements=[...document.querySelectorAll<HTMLElement>('[role="dialog"] button:not(:disabled), [role="dialog"] input, [role="dialog"] select')];const first=elements[0],last=elements.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};const timeout=setTimeout(()=>document.querySelector<HTMLElement>('[role="dialog"] button')?.focus(),0);addEventListener('keydown',key);return()=>{clearTimeout(timeout);removeEventListener('keydown',key);old?.focus();};},[settings]);
 async function act(type:string,payload:any={}){try{const r=await api.action(type,payload);if(r?.error&&!['test'].includes(type))setToast(r.error);else if(type==='save-profile')setToast('Profil gespeichert.');return r;}catch(e){setToast('Aktion fehlgeschlagen. Läuft Haze noch?');return {error:'Verbindung unterbrochen'};}}
 if(fatal)return <main className="fatal"><span className="brand">Haze</span><h1>Verbindung zur App fehlt.</h1><p>{fatal}</p><button className="button primary" onClick={()=>location.reload()}>Erneut versuchen</button></main>;
 if(!state)return <main className="loading"><span className="brand">Haze</span><p>Deine Ansicht wird geladen …</p></main>;
 if(overlay||taskbar)return <><Widget state={state} act={act} now={now} taskbar={taskbar}/>{toast&&<div role="status" className="toast n-liquid panel">{toast}</div>}</>;
 const c=state.config,f=freshness(state.feed.entries,now,c.staleMinutes),tirFor=(h:number)=>{const r=state.feed.entries.filter((e:any)=>e.time>=now-h*3600000);return r.length?Math.round(r.filter((e:any)=>category(e.value)==='normal').length/r.length*100):null;},tir=tirFor(hours);
 return <><main className="dashboard"><header className="header" data-native={desktop}><div className="wordmark"><span className="brand">Haze</span></div><div className="header-right"><div className="clock">{new Date(now).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}<span>{new Date(now).toLocaleDateString('de-DE',{day:'2-digit',month:'short'})}</span></div><ThemeSwitch glass theme={c.theme} onChange={(theme:string)=>act('settings',{theme})}/><button className="icon-button n-liquid" aria-label={state.update?.status==='available'?'Einstellungen – Update verfügbar':'Einstellungen'} title={state.update?.status==='available'?'Einstellungen · Update verfügbar':'Einstellungen'} onClick={()=>setSettings(state.update?.status==='available'?'app':'connection')}><Icon name="settings" size={20}/>{state.update?.status==='available'&&<i className="n-dot"/>}</button></div></header>
 <div className="toolbar"><span className={'source-tag '+(c.source==='demo'?'demo':'')}><i/>{c.source==='demo'?'DEMODATEN':'NIGHTSCOUT'}{preview?' · VORSCHAU':''}</span><div className="toolbar-actions"><label className="profile-select"><span>PROFIL</span><select aria-label="Profil wählen" value={c.profile} onChange={e=>act('profile',{name:e.target.value})}><option>Arbeit</option><option>Gaming</option></select></label><button className="button secondary compact-button" onClick={()=>act('overlay')}><Icon name="widget" size={16}/>Widget<Icon name="open" size={15}/></button></div></div>
 {['available','downloading','installing'].includes(state.update?.status)&&<div className="notice update-note n-liquid panel" role="status"><Icon name="download" size={16}/><span>{state.update.message}</span>{state.update.status==='available'&&<button className="button primary compact-button" onClick={()=>act('install-update')}>Installieren</button>}</div>}
 <section className="hero" aria-label="Aktueller Glukosewert"><Value state={state} now={now}/></section><ErrorNote state={state}/>
 <section className="chart-card"><div className="card-top"><div><span className="eyebrow">DEIN VERLAUF</span></div><span className="chart-label">{c.unit}</span></div><Chart entries={state.feed.entries} hours={hours} unit={c.unit} now={now} heart={state.garmin?.history} heartActive={!!state.garmin?.connected}/></section>
 <div className="range-picker segmented" role="group" aria-label="Zeitraum">{[3,6,12,24].map(h=>{const t=tirFor(h);return <button key={h} aria-pressed={hours===h} className={hours===h?'active':''} onClick={()=>setHours(h)} title={t==null?`${h} Stunden`:`${h} Stunden · ${t} % im Zielbereich`} aria-label={t==null?`${h} Stunden`:`${h} Stunden, ${t} Prozent im Zielbereich`}>{h}<span> Std.</span>{t!=null&&<i className="tir" style={{['--p' as any]:t/100}}/>}</button>})}</div>
 <section className="stats"><article><div className="eyebrow">IM BEREICH · {hours} STD.</div><strong>{tir==null?'—':tir}<small>{tir!=null?' %':''}</small></strong><span>Anteil vorhandener Messpunkte</span></article><article><div className="eyebrow">LETZTE MESSUNG</div><strong className="stat-time">{f.last?new Date(f.last.time).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}):'—'}</strong><span>{f.stale?'Keine aktuelle Messung':`${f.minutes} Minuten alt`}</span></article><article><div className="eyebrow">DATENQUELLE</div><strong className="stat-source">{c.source==='demo'?'Demo':'Nightscout'}</strong><span>{c.source==='demo'?'Beispieldaten, keine echten Werte':state.feed.error?'Verbindung unterbrochen':'Nur lesender Zugriff'}</span></article></section>
 <section className="bottom-card"><div className="bottom-icon"><Icon name="widget" size={24}/></div><div><h3>Dein Wert. Auch nebenbei.</h3><p>Ein kleines Fenster für Arbeit und Gaming.</p></div><button className="button primary" onClick={()=>act('overlay')}>Widget öffnen<Icon name="open" size={18}/></button><button className="icon-button" title="Widget-Einstellungen" aria-label="Widget-Einstellungen" onClick={()=>setSettings('overlay')}><Icon name="sliders" size={20}/></button></section>
 <footer><span>Haze <span className="muted">/</span> {state.version}</span><span>{c.source==='demo'?'Demomodus · frei erfundene Messwerte':'Zusätzliche Anzeige · Dexcom-Warnungen weiter verwenden'}</span><button onClick={()=>act('refresh')}><Icon name="refresh" size={13}/>Aktualisieren</button></footer>
 </main>{!c.configured&&!preview&&<div className="backdrop"><section className="setup n-liquid panel" data-refract="10" role="dialog" aria-modal="true" aria-label="Einrichtung"><span className="brand">Haze</span><div className="eyebrow">WILLKOMMEN IN DEINER ANSICHT</div><h1>Weniger suchen.<br/>Mehr im Blick.</h1><p className="muted">Deine Glukosewerte, ruhig und übersichtlich.</p><ConnectionForm wizard state={state} act={act} onDone={()=>{}}/></section></div>}{settings&&<SettingsPanel state={state} garmin={garmin} act={act} close={()=>setSettings(null)} initial={settings}/>} {toast&&<div role="status" className="toast n-liquid panel">{toast}</div>}</>;
}
createRoot(document.getElementById('root')!).render(preview&&new URLSearchParams(location.search).has('docklab')?<DockLab/>:<App/>);


