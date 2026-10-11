// Kleine, deterministische Statistik: keine Abhängigkeiten, gleicher Seed = gleiches Ergebnis.
export const finite=a=>a.filter(Number.isFinite);
export const sum=a=>a.reduce((s,x)=>s+x,0);
export const mean=a=>a.length?sum(a)/a.length:null;
export function sd(a){if(a.length<2)return null;const m=mean(a);return Math.sqrt(sum(a.map(x=>(x-m)**2))/(a.length-1));}
// Quantil nach Typ 7 (wie R/NumPy-Standard); a muss sortiert sein.
export function quantileSorted(a,q){if(!a.length)return null;const i=(a.length-1)*q,lo=Math.floor(i),hi=Math.ceil(i);return a[lo]+(a[hi]-a[lo])*(i-lo);}
export const quantile=(a,q)=>quantileSorted([...a].sort((x,y)=>x-y),q);
export const median=a=>quantile(a,.5);
// Gewichtete Mittelwerte für zeitgewichtete Kennzahlen.
export function weightedMean(v,w){let s=0,n=0;for(let i=0;i<v.length;i++){s+=v[i]*w[i];n+=w[i];}return n?s/n:null;}
export function weightedSd(v,w){const m=weightedMean(v,w);if(m==null)return null;let s=0,n=0;for(let i=0;i<v.length;i++){s+=w[i]*(v[i]-m)**2;n+=w[i];}return n?Math.sqrt(s/n):null;}
// Ränge mit Mittelrang bei Bindungen.
export function ranks(a){
 const idx=a.map((v,i)=>[v,i]).sort((x,y)=>x[0]-y[0]),r=new Array(a.length);
 for(let i=0;i<idx.length;){let j=i;while(j+1<idx.length&&idx[j+1][0]===idx[i][0])j++;const rank=(i+j)/2+1;for(let k=i;k<=j;k++)r[idx[k][1]]=rank;i=j+1;}
 return r;
}
export function pearson(x,y){
 const n=x.length;if(n<3)return null;const mx=mean(x),my=mean(y);let sxy=0,sxx=0,syy=0;
 for(let i=0;i<n;i++){const dx=x[i]-mx,dy=y[i]-my;sxy+=dx*dy;sxx+=dx*dx;syy+=dy*dy;}
 return sxx&&syy?sxy/Math.sqrt(sxx*syy):null;
}
export const spearman=(x,y)=>pearson(ranks(x),ranks(y));
// Seedbarer Zufall (mulberry32).
export function rng(seed=1){let a=seed>>>0;return()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function shuffle(a,r){for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
// Spearman mit Permutations-p (zweiseitig) und Bootstrap-95-%-Intervall.
export function spearmanTest(x,y,{permutations=999,bootstrap=999,seed=7}={}){
 const n=x.length,rx=ranks(x),ry=ranks(y),rho=pearson(rx,ry);
 if(rho==null||!Number.isFinite(rho))return {n,rho:null,p:1,ci:null};
 const r=rng(seed),perm=[...ry];let extreme=0;
 for(let k=0;k<permutations;k++){const v=pearson(rx,shuffle(perm,r));if(v!=null&&Math.abs(v)>=Math.abs(rho)-1e-12)extreme++;}
 const boots=[];
 for(let k=0;k<bootstrap;k++){const bx=new Array(n),by=new Array(n);for(let i=0;i<n;i++){const j=Math.floor(r()*n);bx[i]=x[j];by[i]=y[j];}const v=spearman(bx,by);if(v!=null&&Number.isFinite(v))boots.push(v);}
 boots.sort((a,b)=>a-b);
 return {n,rho,p:(extreme+1)/(permutations+1),ci:boots.length>=50?[quantileSorted(boots,.025),quantileSorted(boots,.975)]:null};
}
// Benjamini-Hochberg: q-Werte zu p-Werten.
export function fdr(ps){
 const m=ps.length,order=ps.map((p,i)=>[p,i]).sort((a,b)=>a[0]-b[0]),q=new Array(m);let min=1;
 for(let k=m-1;k>=0;k--){min=Math.min(min,order[k][0]*m/(k+1));q[order[k][1]]=min;}
 return q;
}
// Differenz der Mediane zweier Gruppen mit Bootstrap-Intervall.
export function medianDifference(a,b,{bootstrap=999,seed=11}={}){
 if(a.length<3||b.length<3)return null;const r=rng(seed),diffs=[];
 for(let k=0;k<bootstrap;k++){const ba=a.map(()=>a[Math.floor(r()*a.length)]),bb=b.map(()=>b[Math.floor(r()*b.length)]);diffs.push(median(ba)-median(bb));}
 diffs.sort((x,y)=>x-y);
 return {difference:median(a)-median(b),ci:[quantileSorted(diffs,.025),quantileSorted(diffs,.975)]};
}
// Standardnormalverteilung (Abramowitz/Stegun 7.1.26, Fehler < 1,5e-7).
export function normalCdf(z){const t=1/(1+.3275911*Math.abs(z)/Math.SQRT2),e=1-t*(.254829592+t*(-.284496736+t*(1.421413741+t*(-1.453152027+t*1.061405429))))*Math.exp(-z*z/2);return z>=0?(1+e)/2:(1-e)/2;}
// Theil-Sen: Median aller paarweisen Steigungen, robust gegen Ausreißer.
export function theilSen(x,y){
 const s=[];for(let i=0;i<x.length;i++)for(let j=i+1;j<x.length;j++)if(x[j]!==x[i])s.push((y[j]-y[i])/(x[j]-x[i]));
 if(!s.length)return null;const slope=median(s),intercept=median(y.map((v,i)=>v-slope*x[i]));return {slope,intercept};
}
// Mann-Kendall-Trendtest (zweiseitig, mit Bindungskorrektur); y in zeitlicher Reihenfolge.
export function mannKendall(y){
 const n=y.length;if(n<4)return {s:0,z:0,p:1};let s=0;
 for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)s+=Math.sign(y[j]-y[i]);
 const ties=new Map();for(const v of y)ties.set(v,(ties.get(v)||0)+1);
 let v=n*(n-1)*(2*n+5);for(const t of ties.values())v-=t*(t-1)*(2*t+5);v/=18;
 const z=v>0?(s-Math.sign(s))/Math.sqrt(v):0;return {s,z,p:z?Math.min(1,2*(1-normalCdf(Math.abs(z)))):1};
}
// Autokorrelation mit Verzögerung 1.
export function lag1(a){const m=mean(a);let num=0,den=0;for(let i=0;i<a.length;i++){den+=(a[i]-m)**2;if(i)num+=(a[i]-m)*(a[i-1]-m);}return den?num/den:0;}
// t-Verteilung: 97,5-%-Quantil (Cornish-Fisher) und zweiseitiger p-Wert (Näherung, für df ≥ 3 ausreichend).
export function tQuantile975(df){const z=1.959964,g1=(z**3+z)/4,g2=(5*z**5+16*z**3+3*z)/96,g3=(3*z**7+19*z**5+17*z**3-15*z)/384;return z+g1/df+g2/df**2+g3/df**3;}
export function tTwoSided(t,df){const z=Math.abs(t)*(1-1/(4*df))/Math.sqrt(1+t*t/(2*df));return Math.min(1,2*(1-normalCdf(z)));}
// Unterschied der Mittelwerte (b − a) zweier Zeiträume mit zusammenhängenden Tagen: gemeinsame AR(1)-Korrelation der Reste
// (mit Verzerrungskorrektur), effektive Stichprobengröße n·(1−ρ)/(1+ρ), t-Intervall. Bootstrap war bei 2–4 Wochen zu optimistisch.
export function meanDifference(a,b){
 if(a.length<3||b.length<3)return null;const ma=mean(a),mb=mean(b);let num=0,den=0;
 for(const [x,m] of [[a,ma],[b,mb]])for(let i=0;i<x.length;i++){const e=x[i]-m;den+=e*e;if(i)num+=e*(x[i-1]-m);}
 const N=a.length+b.length,raw=den?num/den:0,rho=Math.max(0,Math.min(.9,raw+(1+3*raw)/N)),s2=den/(N-2),f=(1-rho)/(1+rho);
 const se=Math.sqrt(s2/(a.length*f)+s2/(b.length*f)),df=Math.max(2,(a.length+b.length)*f-2),d=mb-ma,t=tQuantile975(df);
 return {difference:d,ci:[d-t*se,d+t*se],p:se?tTwoSided(d/se,df):d?0:1,rho};
}
// Wendepunkte im Mittelwert (binäre Segmentierung). Der Strafterm nutzt die Langzeitvarianz der Reste um die gefundenen
// Abschnitte (Varianz × (1+ρ)/(1−ρ)), damit zusammenhängende Tage keine Scheinbrüche erzeugen. Iteriert, bis die Schnitte stabil sind.
// Liefert Startindizes neuer Abschnitte.
export function changePoints(v,{minSize=14,beta=4,max=3}={}){
 const n=v.length;if(n<2*minSize)return [];
 const pre=[0];for(const x of v)pre.push(pre.at(-1)+x);const avg=(i,j)=>(pre[j]-pre[i])/(j-i);
 const best=(i,j)=>{let top=null;for(let k=i+minSize;k<=j-minSize;k++){const g=(k-i)*(j-k)/(j-i)*(avg(i,k)-avg(k,j))**2;if(!top||g>top.gain)top={k,gain:g};}return top;};
 const segment=penalty=>{const cuts=[];
  while(cuts.length<max){const bounds=[0,...cuts,n];let pick=null;
   for(let s=0;s+1<bounds.length;s++){const b=best(bounds[s],bounds[s+1]);if(b&&(!pick||b.gain>pick.gain))pick=b;}
   if(!pick||pick.gain<=penalty)break;cuts.push(pick.k);cuts.sort((a,b)=>a-b);}
  return cuts;};
 const lrv=cuts=>{const bounds=[0,...cuts,n],res=[];for(let s=0;s+1<bounds.length;s++){const m=avg(bounds[s],bounds[s+1]);for(let i=bounds[s];i<bounds[s+1];i++)res.push(v[i]-m);}
  const rho=Math.max(0,Math.min(.9,lag1(res))),varr=res.reduce((a,x)=>a+x*x,0)/Math.max(1,res.length-bounds.length+1);return varr*(1+rho)/(1-rho);};
 // Start optimistisch (Streuung aus Tagesdifferenzen), dann mit der Langzeitvarianz der Reste nachschärfen.
 const d=v.slice(1).map((x,i)=>x-v[i]),md=median(d),sigma=1.4826*median(d.map(x=>Math.abs(x-md)))/Math.SQRT2;
 if(!sigma)return [];
 let cuts=segment(beta*sigma*sigma*Math.log(n));
 for(let it=0;it<4;it++){const next=segment(beta*lrv(cuts)*Math.log(n));if(next.join()===cuts.join())break;cuts=next;}
 return cuts;
}
