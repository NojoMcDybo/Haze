import React,{useEffect,useLayoutEffect,useRef} from 'react';
// Zwei (oder mehr) Seiten nebeneinander: Wischen nach links/rechts per Maus (linke Taste gedrückt ziehen), Touchpad
// oder Touch; dazu Reiter und Strg+Pfeiltasten. Die Höhe folgt der aktiven Seite, damit die Seite weiter normal scrollt.
const INTERACTIVE='button,a,input,select,textarea,label,summary,[role="slider"],[role="tab"],.point,.range-picker';
export function Pager({page,onPage,labels,children}:{page:number,onPage:(p:number)=>void,labels:string[],children:React.ReactNode}){
 const ref=useRef<HTMLDivElement>(null),drag=useRef<any>(null),pages=React.Children.toArray(children);
 const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 // Seite → Scrollposition
 useEffect(()=>{const el=ref.current;if(!el)return;const x=page*el.clientWidth;if(Math.abs(el.scrollLeft-x)>2)el.scrollTo({left:x,behavior:reduce()?'auto':'smooth'});},[page]);
 // Höhe der aktiven Seite übernehmen (auch wenn sie sich ändert, z. B. Auswertung lädt nach)
 useLayoutEffect(()=>{
  const el=ref.current,active=el?.children[page] as HTMLElement|undefined;if(!el||!active)return;
  const fit=()=>{el.style.height=active.offsetHeight+'px';};fit();
  const ro=new ResizeObserver(fit);ro.observe(active);return()=>ro.disconnect();
 },[page,pages.length]);
 // Fenstergröße: auf der aktuellen Seite bleiben
 useEffect(()=>{const el=ref.current;if(!el)return;const ro=new ResizeObserver(()=>{el.scrollTo({left:page*el.clientWidth});});ro.observe(el);return()=>ro.disconnect();},[page]);
 // Natives Wischen (Touchpad, Touch): nach dem Einrasten Seite übernehmen
 const settle=useRef<any>(0);
 const onScroll=()=>{const el=ref.current;if(!el||drag.current?.active)return;clearTimeout(settle.current);settle.current=setTimeout(()=>{const p=Math.round(el.scrollLeft/el.clientWidth);if(p!==page)onPage(Math.max(0,Math.min(pages.length-1,p)));},120);};
 // Maus: mit gedrückter linker Taste ziehen
 const down=(e:React.PointerEvent)=>{
  if(e.pointerType!=='mouse'||e.button!==0||(e.target as HTMLElement).closest(INTERACTIVE))return;
  drag.current={x:e.clientX,y:e.clientY,left:ref.current!.scrollLeft,active:false,id:e.pointerId,t:performance.now()};
 };
 const move=(e:React.PointerEvent)=>{
  const d=drag.current,el=ref.current;if(!d||!el||e.pointerId!==d.id)return;
  const dx=e.clientX-d.x,dy=e.clientY-d.y;
  if(!d.active){if(Math.abs(dx)<8||Math.abs(dx)<Math.abs(dy)*1.2){if(Math.abs(dy)>12)drag.current=null;return;}d.active=true;el.classList.add('dragging');el.setPointerCapture(e.pointerId);}
  el.scrollLeft=d.left-dx;
 };
 const up=(e:React.PointerEvent)=>{
  const d=drag.current,el=ref.current;drag.current=null;if(!d||!el||!d.active)return;
  el.classList.remove('dragging');
  const dx=e.clientX-d.x,fast=Math.abs(dx)/(performance.now()-d.t)>.5,far=Math.abs(dx)>el.clientWidth*.15;
  const target=Math.max(0,Math.min(pages.length-1,page+((far||fast)?(dx<0?1:-1):0)));
  el.scrollTo({left:target*el.clientWidth,behavior:reduce()?'auto':'smooth'});if(target!==page)onPage(target);
  // Der Klick nach einem Wischen soll nichts auslösen (z. B. Messpunkt im Diagramm).
  const stop=(ev:Event)=>{ev.stopPropagation();ev.preventDefault();};el.addEventListener('click',stop,{capture:true,once:true});setTimeout(()=>el.removeEventListener('click',stop,{capture:true}),50);
 };
 return <div ref={ref} className="pager" onScroll={onScroll} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-roledescription="Seiten" >
  {pages.map((p,i)=><section key={i} className="page" role="tabpanel" id={`page-${i}`} aria-label={labels[i]} aria-hidden={i!==page} inert={i!==page}>{p}</section>)}
 </div>;
}
// Reiter für die Seiten (Strg+Pfeiltasten wechseln ebenfalls).
export function PageTabs({page,onPage,labels}:{page:number,onPage:(p:number)=>void,labels:string[]}){
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(!e.ctrlKey||e.altKey||e.metaKey)return;const t=e.target as HTMLElement;if(t?.closest('input,textarea,select,[contenteditable]'))return;
  if(e.key==='ArrowRight'&&page<labels.length-1){e.preventDefault();onPage(page+1);}if(e.key==='ArrowLeft'&&page>0){e.preventDefault();onPage(page-1);}};
  addEventListener('keydown',key);return()=>removeEventListener('keydown',key);},[page,labels.length]);
 return <div className="segmented page-tabs" role="tablist" aria-label="Ansicht">{labels.map((l,i)=><button key={l} role="tab" aria-selected={page===i} aria-controls={`page-${i}`} className={page===i?'active':''} onClick={()=>onPage(i)} title={i>page?'Oder nach links wischen':i<page?'Oder nach rechts wischen':undefined}>{l}</button>)}</div>;
}
