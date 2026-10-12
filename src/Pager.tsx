import React,{useEffect,useLayoutEffect,useRef} from 'react';
// Seiten wie in Nebel: Die ankommende Seite schiebt sich von rechts über die vorige und deckt sie ab; die darunter bleibt
// stehen, wird unscharf und blasser. Wirkt wie ein aufgelegtes Blatt, nicht wie ein Karussell. Der Finger (Maus, Touch,
// Touchpad) führt die Seite 1:1; beim Loslassen entscheidet die Geschwindigkeit, sonst die Hälfte. Reiter und Strg+Pfeile.
// Das Fenster scrollt weiter normal: Die Höhe folgt der aktiven Seite, jede Seite merkt sich ihre Scrollposition.
const INTERACTIVE='button,a,input,select,textarea,label,summary,[role="slider"],[role="tab"],.point,.range-picker,.table-scroll';
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
const SNAP_MS=560;
export function Pager({page,onPage,labels,children}:{page:number,onPage:(p:number)=>void,labels:string[],children:React.ReactNode}){
 const ref=useRef<HTMLDivElement>(null),pages=React.Children.toArray(children),last=pages.length-1;
 const prog=useRef(page),settled=useRef(page),drag=useRef<any>(null),moving=useRef<number[]>([]),timer=useRef<any>(0),scrolls=useRef<number[]>([]),wheel=useRef<any>(null);
 const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 const els=()=>[...(ref.current?.children||[])] as HTMLElement[];
 // Höhe: während einer Bewegung die größere der beteiligten Seiten, sonst die aktive.
 const fit=()=>{const el=ref.current;if(!el)return;const list=els(),show=moving.current.length?moving.current:[settled.current];el.style.height=Math.max(...show.map(i=>list[i]?.offsetHeight||0))+'px';};
 const apply=(p:number)=>{
  prog.current=p;const el=ref.current;if(!el)return;const lo=Math.floor(clamp(p,0,last)),hi=Math.ceil(clamp(p,0,last));
  els().forEach((c,i)=>{
   // In Prozent der eigenen Breite: stimmt auch beim Größenändern des Fensters ohne Neuberechnung.
   const d=p-i,under=clamp(d,0,2),x=d<0?-d*100:0;
   c.style.transform=i>0&&x>0?`translate3d(${x.toFixed(3)}%,0,0)`:'';
   c.style.filter=under<.004||reduce()?'':`blur(${(Math.min(under,1.35)*9).toFixed(2)}px)`;
   c.style.opacity=under<.004?'':String(1-.26*Math.min(under,1.4));
   c.style.visibility=(i>=lo&&i<=hi)||moving.current.includes(i)?'':'hidden';
  });
 };
 // Ziehen beginnt: laufendes Einrasten anhalten, Nachbarseiten sichtbar machen und Höhe für beide reservieren.
 const hold=(base:number)=>{clearTimeout(timer.current);els().forEach(c=>c.classList.remove('snap'));moving.current=[...new Set([clamp(base-1,0,last),base,clamp(base+1,0,last)])];fit();};
 const finish=()=>{moving.current=[];els().forEach(c=>c.classList.remove('snap'));apply(prog.current);fit();};
 const snapTo=(target:number,from=settled.current)=>{
  target=clamp(target,0,last);const old=settled.current;settled.current=target;
  moving.current=[...new Set([Math.floor(clamp(prog.current,0,last)),Math.ceil(clamp(prog.current,0,last)),from,target])];
  els().forEach(c=>c.classList.add('snap'));apply(target);fit();
  clearTimeout(timer.current);timer.current=setTimeout(finish,reduce()?0:SNAP_MS+20);
  if(target!==old){
   // Scrollposition je Seite merken; die neue Seite beginnt dort, wo man sie verlassen hat (höchstens am Seitenanfang).
   const top=(ref.current?.getBoundingClientRect().top||0)+scrollY;scrolls.current[old]=scrollY;
   const back=scrolls.current[target]??Math.min(scrollY,Math.max(0,top-90));if(Math.abs(back-scrollY)>2)scrollTo({top:back,behavior:reduce()?'auto':'smooth'});
   onPage(target);
  }
 };
 // Seite von außen (Reiter, Tasten, Knopf).
 useEffect(()=>{if(page!==settled.current)snapTo(page);},[page]);
 useLayoutEffect(()=>{apply(prog.current);fit();const list=els(),ro=new ResizeObserver(fit);list.forEach(c=>ro.observe(c));ro.observe(ref.current!);return()=>ro.disconnect();},[pages.length]);
 // Maus, Touch, Stift: erst ab 8 px entscheiden, ob waagerecht gezogen oder senkrecht gescrollt wird.
 const down=(e:React.PointerEvent)=>{if(e.button!==0||(e.target as HTMLElement).closest(INTERACTIVE))return;drag.current={x:e.clientX,y:e.clientY,base:settled.current,last:e.clientX,t:performance.now(),v:0,lock:null,id:e.pointerId};};
 const move=(e:React.PointerEvent)=>{
  const d=drag.current,el=ref.current;if(!d||!el||e.pointerId!==d.id)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;
  if(!d.lock){if(Math.abs(dx)<8&&Math.abs(dy)<8)return;d.lock=Math.abs(dx)>Math.abs(dy)*1.15?'x':'y';
   if(d.lock==='x'){try{el.setPointerCapture(e.pointerId);}catch{}document.body.classList.add('paging');getSelection()?.removeAllRanges();hold(d.base);}}
  if(d.lock!=='x')return;
  const now=performance.now();d.v=(e.clientX-d.last)/Math.max(1,now-d.t);d.last=e.clientX;d.t=now;
  let p=d.base-dx/el.clientWidth;if(p<0)p*=.32;if(p>last)p=last+(p-last)*.32;// Gummiband an den Rändern
  apply(clamp(p,-.12,last+.12));
 };
 const up=(e:React.PointerEvent)=>{
  const d=drag.current;drag.current=null;if(!d||d.lock!=='x')return;document.body.classList.remove('paging');
  // Der Klick nach einem Zug soll nichts auslösen (z. B. Messpunkt im Diagramm).
  const stop=(ev:Event)=>{ev.stopPropagation();ev.preventDefault();};addEventListener('click',stop,{capture:true,once:true});setTimeout(()=>removeEventListener('click',stop,{capture:true}),60);
  snapTo(d.v<-.45?d.base+1:d.v>.45?d.base-1:Math.round(clamp(prog.current,0,last)),d.base);
 };
 // Touchpad: waagerechtes Wischen (deltaX) führt die Seite, kurz nach dem letzten Ereignis rastet sie ein.
 useEffect(()=>{const el=ref.current;if(!el)return;
  const onWheel=(e:WheelEvent)=>{
   if(Math.abs(e.deltaX)<=Math.abs(e.deltaY)||Math.abs(e.deltaX)<1)return;
   for(let n=e.target as HTMLElement|null;n&&n!==el;n=n.parentElement)if(n.scrollWidth>n.clientWidth+1&&getComputedStyle(n).overflowX!=='visible'&&getComputedStyle(n).overflowX!=='hidden')return;// Tabelle scrollt selbst
   e.preventDefault();let w=wheel.current;if(!w){w=wheel.current={base:settled.current,p:prog.current};hold(w.base);}
   w.p=clamp(w.p+e.deltaX/el.clientWidth,Math.max(-.12,w.base-1),Math.min(last+.12,w.base+1));apply(w.p);
   clearTimeout(w.t);w.t=setTimeout(()=>{const s=wheel.current;wheel.current=null;snapTo(s.p-s.base>.18?s.base+1:s.p-s.base<-.18?s.base-1:s.base,s.base);},110);
  };
  el.addEventListener('wheel',onWheel,{passive:false});return()=>el.removeEventListener('wheel',onWheel);
 },[last]);
 return <div ref={ref} className="pager" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} aria-roledescription="Seiten">
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
// Hinweis am Ende einer Seite: wohin es weitergeht (wie die Wisch-Aufforderung in Nebel).
export function SwipeHint({title,text,onClick}:{title:string,text:string,onClick:()=>void}){
 return <button className="swipe-hint" onClick={onClick}><span><b>{title}</b><small>{text}</small></span><span className="swipe-arrows" aria-hidden="true"><i>›</i><i>›</i><i>›</i></span></button>;
}
