// Prognose-Experiment: 15–60 Minuten voraus, nur aus CGM-Werten. NICHT BELASTBAR – keine Grundlage für Entscheidungen.
// Insulin und Kohlenhydrate kennt die Prognose nicht (Pumpendaten kommen mit Stunden Verzögerung), deshalb ist sie
// grundsätzlich unsicher. Ehrlichkeit vor Eindruck: Jedes Modell wird rückwärts auf Tagen geprüft, die es beim Lernen nicht
// gesehen hat; gezeigt wird das beste nur, wenn es die einfache Fortschreibung schlägt. Das Band stammt aus den echten Fehlern.
import {MIN,DAY} from './time.mjs';
import {mean,quantileSorted} from './stats.mjs';
export const STEP=5*MIN,HORIZONS=[3,6,9,12];// Schritte à 5 min: 15, 30, 45, 60 min
const MAX_H=12,clampV=v=>Math.max(40,Math.min(400,v));
// Auf ein 5-Minuten-Raster legen (±2,5 min); Lücken bleiben null.
export function grid(entries,from,to){
 const n=Math.max(0,Math.floor((to-from)/STEP)),g=new Array(n).fill(null);
 for(const e of entries){const i=Math.round((e.time-from)/STEP);if(i>=0&&i<n&&Math.abs(e.time-(from+i*STEP))<=STEP/2&&g[i]==null)g[i]=e.value;}
 return g;
}
// Modelle: f(werte bis jetzt, h Schritte) → Wert; werte enden mit dem letzten Messwert.
export const MODELS={
 naive:{label:'Einfache Fortschreibung',run:(y,h)=>y.at(-1)},
 trend:{label:'Gedämpfter Trend',run:(y,h)=>{const s=(y.at(-1)-y.at(-4))/3;let v=y.at(-1),f=1;for(let k=0;k<h;k++){f*=.85;v+=s*f;}return clampV(v);}},
};
// AR(p) auf den 5-Minuten-Differenzen, gelernt per kleinster Quadrate (leichter Ridge); mehrstufig rekursiv.
export function fitAr(series,{p=6,ridge=50}={}){
 const X=[],Y=[];
 for(const g of series)for(let i=p+1;i<g.length;i++){const w=g.slice(i-p-1,i+1);if(w.some(v=>v==null))continue;const d=w.slice(1).map((v,k)=>v-w[k]);X.push(d.slice(0,p).reverse());Y.push(d[p]);}
 if(X.length<p*50)return null;
 // Normalgleichungen (p×p) mit Ridge, gelöst per Gauß-Elimination.
 const A=Array.from({length:p},(_,i)=>Array.from({length:p},(_,j)=>X.reduce((s,x)=>s+x[i]*x[j],0)+(i===j?ridge:0))),b=Array.from({length:p},(_,i)=>X.reduce((s,x,k)=>s+x[i]*Y[k],0));
 for(let c=0;c<p;c++){let piv=c;for(let r=c+1;r<p;r++)if(Math.abs(A[r][c])>Math.abs(A[piv][c]))piv=r;[A[c],A[piv]]=[A[piv],A[c]];[b[c],b[piv]]=[b[piv],b[c]];
  for(let r=0;r<p;r++)if(r!==c){const f=A[r][c]/A[c][c];for(let k=c;k<p;k++)A[r][k]-=f*A[c][k];b[r]-=f*b[c];}}
 return {p,coef:b.map((v,i)=>v/A[i][i]),n:X.length};
}
export function runAr(m,y,h){
 const d=[];for(let i=y.length-m.p;i<y.length;i++)d.push(y[i]-y[i-1]);let v=y.at(-1);
 for(let k=0;k<h;k++){const next=m.coef.reduce((s,c,i)=>s+c*d[d.length-1-i],0);d.push(next);v+=next;}
 return clampV(v);
}
const usable=(y,need)=>y.length>=need&&y.slice(-need).every(v=>v!=null);
// Rückwärtsprüfung: AR lernt nur auf Tagen VOR dem Prüfzeitraum. Alle 15 min ein Startpunkt, Fehler je Horizont.
// extra: vortrainiertes Modell von außen ({label,context,path(y)→12 Werte}, z. B. TTM im Analyse-Thread). Es braucht einen langen
// Vorlauf am Stück; alle Modelle werden dann auf denselben Startpunkten verglichen, sonst bleibt es außen vor.
/** @param {{time:number,value:number}[]} entries @param {{to?:number,trainDays?:number,testDays?:number,p?:number,extra?:any}} [options] */
export async function evaluate(entries,{to,trainDays=28,testDays=7,p=6,extra=null}={}){
 to??=entries.at(-1)?.time??Date.now();const testFrom=to-testDays*DAY,trainFrom=testFrom-trainDays*DAY,lead=Math.max(24,extra?.context??0);
 const train=grid(entries,trainFrom,testFrom),test=grid(entries,testFrom-lead*STEP,to);
 const segs=[];let cur=[];for(const v of train){if(v==null){if(cur.length)segs.push(cur);cur=[];}else cur.push(v);}if(cur.length)segs.push(cur);
 const ar=fitAr(segs,{p}),models={...MODELS};if(ar)models.ar={label:'Gelernt aus deinen Daten (AR)',run:(y,h)=>runAr(ar,y,h)};
 const need=Math.max(p+1,4),starts=[];
 for(let i=lead;i+MAX_H<test.length;i+=3){const y=test.slice(0,i+1);if(usable(y,need))starts.push({i,long:!!extra&&usable(y,extra.context)});}
 const longCount=starts.filter(s=>s.long).length,useExtra=!!extra&&longCount>=200;
 const external=extra?{key:'ttm',label:extra.label,status:useExtra?'geprüft':`zu wenig zusammenhängende Daten (braucht ${Math.round(extra.context*5/60)} h am Stück, ${longCount} Startpunkte)`}:null;
 const list=useExtra?starts.filter(s=>s.long):starts;if(useExtra)models.ttm={label:extra.label,external:true};
 const err=Object.fromEntries(Object.keys(models).map(k=>[k,Object.fromEntries(HORIZONS.map(h=>[h,[]]))]));
 for(const {i} of list){
  const y=test.slice(0,i+1),ext=useExtra?await extra.path(y.slice(-extra.context)):null;
  for(const [k,m] of Object.entries(models))for(const h of HORIZONS){const truth=test[i+h];if(truth==null)continue;err[k][h].push((m.external?ext[h-1]:m.run(y,h))-truth);}
 }
 const metrics=Object.fromEntries(Object.entries(err).map(([k,byH])=>[k,Object.fromEntries(HORIZONS.map(h=>{const e=byH[h],s=[...e].sort((a,b)=>a-b);
  return [h,e.length?{n:e.length,mae:mean(e.map(Math.abs)),rmse:Math.sqrt(mean(e.map(x=>x*x))),bias:mean(e),q10:quantileSorted(s,.1),q90:quantileSorted(s,.9)}:null];}))]));
 // Bestes Modell nach dem Fehler bei 30 min; ein Modell zählt nur, wenn es die Fortschreibung um mindestens 5 % schlägt.
 const at30=k=>metrics[k][6]?.rmse??Infinity,naive=at30('naive');let best='naive';
 for(const k of Object.keys(models))if(k!=='naive'&&at30(k)<=naive*.95&&at30(k)<at30(best))best=k;
 return {origins:list.length,testDays,trainDays,ar,external,metrics,best,gain:naive<Infinity&&best!=='naive'?1-at30(best)/naive:0,
  enough:list.length>=200&&!!metrics.naive[6]?.n,trainedTo:testFrom,evaluatedTo:to};
}
// Live: Punkte 5–60 min voraus mit 80-%-Band aus den Fehlern der Rückwärtsprüfung (Fehler = Prognose − Wahrheit).
// path: bei einem Modell von außen (TTM) die schon gerechneten 12 Werte ab dem letzten Messwert {time,values}.
export function predict(model,entries,now=Date.now(),path=null){
 if(!model?.enough)return null;const from=now-2*60*MIN,y=grid(entries,from,now+STEP/2);
 while(y.length&&y.at(-1)==null)y.pop();const lastIdx=y.length-1;if(lastIdx<0)return null;
 const lastTime=from+lastIdx*STEP;if(now-lastTime>12*MIN||!usable(y,Math.max((model.ar?.p??0)+1,4)))return null;// zu alt oder Lücke
 const external=!MODELS[model.best]&&model.best!=='ar';if(external&&(!path||Math.abs(path.time-lastTime)>STEP/2))return null;
 const run=external?(_,h)=>path.values[h-1]:model.best==='ar'&&model.ar?(v,h)=>runAr(model.ar,v,h):MODELS[model.best].run,m=model.metrics[model.best];
 const band=h=>{const k=HORIZONS.find(x=>x>=h)??12,lo=HORIZONS.filter(x=>x<=h).at(-1);const a=m[lo??k]??m[k],b=m[k];const t=lo&&k!==lo?(h-lo)/(k-lo):1;
  const q10=lo?a.q10+(b.q10-a.q10)*t:b.q10*h/k,q90=lo?a.q90+(b.q90-a.q90)*t:b.q90*h/k;return [q10,q90];};
 return Array.from({length:MAX_H},(_,i)=>{const h=i+1,v=run(y,h),[q10,q90]=band(h);return {time:lastTime+h*STEP,value:v,lo:clampV(v-q90),hi:clampV(v-q10)};});
}
// Für ein Modell von außen: die letzten Werte am Stück (Raster) bis zum letzten Messwert, oder null.
export function recentWindow(entries,context,now=Date.now()){
 const from=now-(context+3)*STEP,y=grid(entries,from,now+STEP/2);while(y.length&&y.at(-1)==null)y.pop();
 return y.length&&usable(y,context)?{time:from+(y.length-1)*STEP,values:y.slice(-context)}:null;
}
