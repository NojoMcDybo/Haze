// Künstliche, reproduzierbare Daten für Tests und die Demo-Analyse. Keine echten Messwerte.
// Eingebaute Zusammenhänge (damit Tests sie wiederfinden): Training senkt die Glukose und erhöht das Risiko
// später Tiefs in der Nacht danach; unruhige Nächte senken den Schlafwert; einzelne Kompressionstiefs.
import {MIN,HOUR,DAY,dayStart,addDays,dayKey} from './time.mjs';
import {rng} from './stats.mjs';
export function synthetic({days=90,end=Date.now(),tz='Europe/Berlin',seed=42,gapDays=[]}={}){
 const r=rng(seed),gauss=()=>{let s=0;for(let i=0;i<6;i++)s+=r();return (s-3)*1.41;};
 const lastKey=dayKey(end,tz),firstKey=addDays(lastKey,-(days-1));
 const glucose=[],treatments=[],activities=[],sleeps=[],daily=[],deviceEvents=[];
 const plan=[];
 for(let d=0;d<days;d++){
  const key=addDays(firstKey,d),t0=dayStart(key,tz),train=r()<.45;
  const meals=[7.5,12.5,19].map(h=>({time:t0+(h+gauss()*.4)*HOUR,carbs:Math.round(40+r()*50)}));
  const act=train?{id:`a${d}`,start:t0+(17+r()*1.5)*HOUR,minutes:Math.round(35+r()*55),type:r()<.6?'running':'cycling'}:null;
  if(act){act.end=act.start+act.minutes*MIN;act.drop=25+act.minutes*.6+gauss()*8;}
  plan.push({key,t0,train,meals,act,lateLow:train&&r()<.55,restless:r()<.3,compression:r()<.12});
  if(d%10===0)deviceEvents.push({time:t0+9*HOUR,type:'sensor_start'});
 }
 let noise=0;
 for(let d=0;d<days;d++){
  const p=plan[d],prev=plan[d-1];
  // Nacht, die am Morgen dieses Tages endet (gehört zum Vortag-Abend).
  const sleepStart=p.t0-(1-(r()-.5)*.8)*HOUR,sleepEnd=p.t0+(7+(r()-.5)*.8)*HOUR;
  for(let t=p.t0;t<p.t0+DAY;t+=5*MIN){
   if(gapDays.includes(d)||t>end)continue;
   const h=(t-p.t0)/HOUR;let v=118+(h>4&&h<8?(h-4)*7:h>=8&&h<10?(10-h)*14:0);
   for(const m of [...(prev?.meals||[]),...p.meals]){const x=(t-m.time)/MIN;if(x>=0&&x<300)v+=m.carbs*1.1*(x<45?x/45:Math.exp(-(x-45)/70));}
   if(p.act){const x=(t-p.act.start)/MIN;if(x>=0&&x<p.act.minutes)v-=p.act.drop*x/p.act.minutes;else if(x>=p.act.minutes&&x<p.act.minutes+150)v-=p.act.drop*(1-(x-p.act.minutes)/150);}
   if(prev?.lateLow&&h>=2&&h<4.5)v-=70*Math.sin((h-2)/2.5*Math.PI);
   if(prev?.restless&&h<6)v+=35*Math.sin(h*2.1);
   if(p.compression&&h>=3&&h<3.5)v-=60*Math.sin((h-3)/.5*Math.PI);
   noise=.8*noise+gauss()*3;v=Math.max(40,Math.min(400,v+noise));
   glucose.push({time:t,value:Math.round(v),source:'share'});
  }
  for(const m of p.meals){treatments.push({time:m.time,type:'bolus',insulin:Math.round(m.carbs/10*10)/10,carbs:m.carbs});}
  for(let h=0;h<24;h+=1)treatments.push({time:p.t0+h*HOUR,type:'basal',rate:.8,duration:60});
  if(p.act){activities.push({id:p.act.id,start:p.act.start,end:p.act.end,type:p.act.type,avgHr:Math.round(130+r()*30),maxHr:Math.round(165+r()*20),load:Math.round(p.act.minutes*1.3),trainingEffect:Math.round((2+r()*2)*10)/10});
   if(r()<.5)treatments.push({time:p.act.start-30*MIN,type:'exercise_mode',duration:p.act.minutes+60});}
  const nightStd=(prev?.restless?25:8)+(prev?.lateLow?15:0);
  if(prev)sleeps.push({night:p.key,start:sleepStart,end:sleepEnd,score:Math.round(Math.max(30,Math.min(98,88-nightStd*.9+gauss()*4))),deep:Math.round(70+gauss()*15),light:Math.round(240+gauss()*20),rem:Math.round(90+gauss()*15),awake:Math.round(20+nightStd*.6),hrv:Math.round(48-nightStd*.3+gauss()*4),rhr:Math.round(54+nightStd*.1+gauss())});
  daily.push({date:p.key,steps:Math.round(6500+(p.act?p.act.minutes*120:0)+gauss()*1500),intensityMinutes:p.act?p.act.minutes:Math.round(r()*10),stressAvg:Math.round(32+(prev?.restless?8:0)+gauss()*5),bbMax:Math.round(70+(prev?.restless?-15:0)+gauss()*8),bbMin:Math.round(15+gauss()*5),rhr:Math.round(54+gauss())});
 }
 return {glucose,treatments,activities,sleeps,daily,deviceEvents};
}
