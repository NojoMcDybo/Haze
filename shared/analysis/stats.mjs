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
