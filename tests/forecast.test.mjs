import {test} from 'node:test';import assert from 'node:assert/strict';
import {grid,fitAr,runAr,evaluate,predict,recentWindow,STEP} from '../shared/analysis/forecast.mjs';
import {synthetic} from '../shared/analysis/synthetic.mjs';
import {rng} from '../shared/analysis/stats.mjs';
const END=Date.UTC(2026,9,11,12),DAY=86400000,MIN=60000;
const gauss=r=>{let s=0;for(let i=0;i<6;i++)s+=r();return (s-3)*1.41;};

test('Raster: 5-Minuten-Werte mit Toleranz, Lücken bleiben leer',()=>{
 const g=grid([{time:0,value:100},{time:5*MIN+60000,value:110},{time:20*MIN,value:130}],0,25*MIN);
 assert.deepEqual(g,[100,110,null,null,130]);
});
test('AR lernt bekannte Dynamik der Veränderungen zurück',()=>{
 const r=rng(4),y=[120];let d=0;for(let i=0;i<4000;i++){d=.8*d+gauss(r);y.push(y.at(-1)+d);}
 const m=fitAr([y],{p:3,ridge:1});assert.ok(Math.abs(m.coef[0]-.8)<.05,`Koeffizient ${m.coef[0]}`);assert.ok(Math.abs(m.coef[1])<.08);
 assert.ok(Math.abs(runAr(m,[100,100,100,100,104],1)-(104+.8*4))<1);
 assert.equal(fitAr([[1,2,3]],{p:3}),null);
});
test('Rückwärtsprüfung: gelerntes Modell schlägt die Fortschreibung bei Dynamik, sonst nicht',async()=>{
 const d=synthetic({days:40,end:END,longterm:true}),m=await evaluate(d.glucose,{to:END});
 assert.ok(m.enough&&m.ar);assert.equal(m.best,'ar');assert.ok(m.gain>.05);
 const n30=m.metrics.naive[6].rmse;assert.ok(n30>8&&n30<40,`RMSE ${n30}`);assert.ok(m.metrics.ar[12].rmse>m.metrics.ar[3].rmse);
 // Zufallsweg ohne Dynamik: Kein Modell darf sich besser darstellen als die Fortschreibung.
 const r=rng(8),walk=[];let v=140;for(let t=END-36*DAY;t<END;t+=STEP){v=Math.max(50,Math.min(350,v+gauss(r)*3));walk.push({time:t,value:v});}
 assert.equal((await evaluate(walk,{to:END})).best,'naive');
});
test('Prognose: 12 Punkte mit Band; keine Prognose bei alten Werten oder zu wenig Daten',async()=>{
 const d=synthetic({days:40,end:END,longterm:true}),m=await evaluate(d.glucose,{to:END}),p=predict(m,d.glucose,END);
 assert.equal(p.length,12);assert.ok(p.every(x=>x.lo<=x.value&&x.value<=x.hi));assert.ok(p[11].hi-p[11].lo>p[0].hi-p[0].lo);
 assert.equal(predict(m,d.glucose,END+20*MIN),null);
 assert.equal(predict({enough:false},d.glucose,END),null);
 assert.equal((await evaluate(d.glucose.filter(e=>e.time>END-2*DAY),{to:END})).enough,false);
});
test('Band ist ehrlich: In der Woche nach der Prüfung liegen etwa 80 % der echten Werte darin',async()=>{
 const d=synthetic({days:47,end:END,longterm:true}),T=END-7*DAY,m=await evaluate(d.glucose.filter(e=>e.time<T),{to:T});
 const truth=new Map(d.glucose.map(e=>[Math.round(e.time/STEP),e.value]));let inside=0,n=0;
 for(let t=T+2*60*MIN;t<END-60*MIN;t+=45*MIN){const p=predict(m,d.glucose.filter(e=>e.time<=t),t);if(!p)continue;
  for(const x of [p[5],p[11]]){const v=truth.get(Math.round(x.time/STEP));if(v==null)continue;n++;if(v>=x.lo&&v<=x.hi)inside++;}}
 assert.ok(n>200);const share=inside/n;assert.ok(share>.7&&share<.9,`Abdeckung ${share}`);
});
test('Modell von außen (wie TTM): nur bei genug Vorlauf am Stück, gleiche Startpunkte, Live-Pfad nötig',async()=>{
 const d=synthetic({days:40,end:END,longterm:true});
 // Ein „Orakel“ mit langem Vorlauf, das den letzten Wert fortschreibt und leicht korrigiert: Es muss geprüft und vergleichbar sein.
 const extra={label:'Test',context:360,path:async y=>Array.from({length:12},()=>y.at(-1))};
 const m=await evaluate(d.glucose,{to:END,extra});assert.equal(m.external.status,'geprüft');assert.ok(m.metrics.ttm);
 assert.deepEqual(m.metrics.ttm[6].n,m.metrics.naive[6].n);// dieselben Startpunkte
 assert.ok(Math.abs(m.metrics.ttm[6].rmse-m.metrics.naive[6].rmse)<1e-9);assert.notEqual(m.best,'ttm');
 // Mit Lücken alle paar Stunden reicht der Vorlauf nicht: Modell bleibt außen vor.
 const gappy=d.glucose.filter(e=>Math.floor(e.time/(6*3600000))%2===0||e.time%(6*3600000)>3600000);
 const g=await evaluate(gappy,{to:END,extra});assert.match(g.external.status,/zu wenig zusammenhängende Daten/);assert.ok(!g.metrics.ttm);
 // Live: ohne passenden Pfad keine Prognose, mit Pfad 12 Punkte.
 const fake={...m,best:'ttm'},w=recentWindow(d.glucose,360,END);assert.equal(w.values.length,360);
 assert.equal(predict(fake,d.glucose,END),null);
 assert.equal(predict(fake,d.glucose,END,{time:w.time,values:Array(12).fill(150)}).length,12);
});
