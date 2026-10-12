import {useEffect,useRef,useState} from 'react';
// Bewegung für Haze: Zahlen und Diagramme gleiten zu neuen Werten statt zu springen, Karten erscheinen gestaffelt.
// „Bewegung reduzieren“ (Haze-Einstellung oder Windows) schaltet alles ab: dann stehen die Zielwerte sofort da.
export const reducedMotion=()=>document.documentElement.dataset.motion==='reduced'||matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease=(t:number)=>1-Math.pow(1-t,3);// wie --n-ease: schnell los, weich aus
function useTweenCore<T>(target:T,mix:(a:T,b:T,k:number)=>T,same:(a:T,b:T)=>boolean,ms:number):T{
 const [v,setV]=useState(target),from=useRef(target),cur=useRef(target),raf=useRef(0);
 useEffect(()=>{
  cancelAnimationFrame(raf.current);
  // Verdecktes Fenster: Der Browser pausiert die Bildwiederholung, also sofort den Zielwert zeigen statt stehen zu bleiben.
  if(reducedMotion()||document.hidden||same(cur.current,target)){cur.current=target;setV(target);return;}
  from.current=cur.current;const t0=performance.now();
  const step=(t:number)=>{const k=Math.min(1,(t-t0)/ms),x=mix(from.current,target,ease(k));cur.current=x;setV(x);if(k<1)raf.current=requestAnimationFrame(step);};
  // Wird das Fenster mittendrin verdeckt, gleich ans Ziel.
  const vis=()=>{if(document.hidden){cancelAnimationFrame(raf.current);cur.current=target;setV(target);}};document.addEventListener('visibilitychange',vis);
  raf.current=requestAnimationFrame(step);return()=>{cancelAnimationFrame(raf.current);document.removeEventListener('visibilitychange',vis);};
 },[target]);
 return v;
}
const num=(a:number,b:number,k:number)=>a==null||b==null||!Number.isFinite(a)?b:a+(b-a)*k;
/** Eine Zahl gleitet zum neuen Wert (null/NaN springen). */
export const useTween=(target:number,ms=650)=>useTweenCore<number>(target,num,(a,b)=>a===b,ms);
/** Mehrere Zahlen (gleiche Länge) gleiten gemeinsam, z. B. Achsen oder ein Verlauf; andere Länge springt. */
export function useTweenArray(target:number[],ms=650){
 const key=useRef(target);if(target.length!==key.current.length||target.some((v,i)=>v!==key.current[i]))key.current=target;
 return useTweenCore<number[]>(key.current,(a,b,k)=>a.length!==b.length?b:b.map((v,i)=>num(a[i],v,k)),(a,b)=>a===b,ms);
}
// Karten und Listen erscheinen beim ersten Sichtbarwerden: leicht von unten, gestaffelt (Reihenfolge im Elternelement).
const REVEAL='.analysis-card,.kpi,.source-tile,.chart-card,.stats article,.bottom-card,.swipe-hint,.insights li,.day-type,.unusual li,.range-card';
export function revealOnScroll(root:HTMLElement=document.body){
 if(!('IntersectionObserver' in window))return()=>{};
 const io=new IntersectionObserver(list=>{for(const e of list)if(e.isIntersecting){const el=e.target as HTMLElement;el.classList.add('in');io.unobserve(el);}},{threshold:.08});
 const scan=(node:ParentNode)=>node.querySelectorAll?.(REVEAL).forEach((el:Element)=>{if(el.classList.contains('reveal'))return;
  const sib=[...(el.parentElement?.children||[])].filter(x=>x.matches(REVEAL));(el as HTMLElement).style.setProperty('--i',String(Math.min(8,sib.indexOf(el))));
  el.classList.add('reveal');if(reducedMotion())el.classList.add('in');else io.observe(el);});
 scan(root);const mo=new MutationObserver(m=>m.forEach(r=>r.addedNodes.forEach(n=>{if(n instanceof HTMLElement){if(n.matches(REVEAL))scan(n.parentElement||root);scan(n);}})));
 mo.observe(root,{childList:true,subtree:true});
 // Rückfall: Meldet der Beobachter nichts (z. B. verdecktes Fenster), wird nichts dauerhaft unsichtbar.
 const safety=setInterval(()=>root.querySelectorAll('.reveal:not(.in)').forEach(el=>{const r=el.getBoundingClientRect();if(r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth){el.classList.add('in');io.unobserve(el);}}),1000);
 return()=>{io.disconnect();mo.disconnect();clearInterval(safety);};
}
