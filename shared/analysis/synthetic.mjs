// Künstliche, reproduzierbare Daten für Tests und die Demo-Analyse. Keine echten Messwerte.
// Eingebaute Zusammenhänge (damit Tests sie wiederfinden): Training senkt die Glukose und erhöht das Risiko
// später Tiefs in der Nacht danach; unruhige Nächte senken den Schlafwert; einzelne Kompressionstiefs.
// Pumpe (eigener Zufallsstrom, damit die übrigen Daten gleich bleiben): Katheterwechsel alle 3 Tage, Glukose steigt mit
// dem Katheter-Alter; Sportmodus halbiert ungefähr den Abfall; Schlafmodus jede Nacht; Alarme in Nächten mit Tief;
// unruhige Nächte erhöhen unruhige Momente und Schlafstress; Trainingsbereitschaft sinkt nach unruhigen Nächten.
// Langzeit (nur mit longterm, dritter Zufallsstrom): ab Tag shiftDay liegt die Glukose um shiftDelta anders (Wendepunkt);
// jede Woche hat ein eigenes Bewegungsniveau, Wochen mit mehr Schritten haben niedrigere Glukose; Tage in unusual liegen ungewöhnlich hoch.
import {MIN,HOUR,DAY,dayStart,addDays,dayKey} from './time.mjs';
import {rng} from './stats.mjs';
export function synthetic({days=90,end=Date.now(),tz='Europe/Berlin',seed=42,gapDays=[],longterm=false,shiftDay=Math.floor(days*.6),shiftDelta=-15,unusual=[],body=false}={}){
 const r=rng(seed),gauss=()=>{let s=0;for(let i=0;i<6;i++)s+=r();return (s-3)*1.41;};
 const r2=rng(seed+1000),g2=()=>{let s=0;for(let i=0;i<6;i++)s+=r2();return (s-3)*1.41;};
 const r3=rng(seed+2000),week=longterm?Array.from({length:Math.ceil(days/7)+1},()=>{let s=0;for(let i=0;i<6;i++)s+=r3();return (s-3)*1.41;}):null;
 const lastKey=dayKey(end,tz),firstKey=addDays(lastKey,-(days-1));
 const glucose=[],treatments=[],activities=[],sleeps=[],daily=[],deviceEvents=[];
 const plan=[];
 for(let d=0;d<days;d++){
  const key=addDays(firstKey,d),t0=dayStart(key,tz),train=r()<.45;
  const meals=[7.5,12.5,19].map(h=>({time:t0+(h+gauss()*.4)*HOUR,carbs:Math.round(40+r()*50)}));
  const act=train?{id:`a${d}`,start:t0+(17+r()*1.5)*HOUR,minutes:Math.round(35+r()*55),type:r()<.6?'running':'cycling'}:null;
  if(act){act.end=act.start+act.minutes*MIN;act.drop=25+act.minutes*.6+gauss()*8;act.mode=r2()<.5;if(act.mode)act.drop*=.55;}
  plan.push({key,t0,train,meals,act,lateLow:train&&r()<.55,restless:r()<.3,compression:r()<.12});
  if(d%10===0)deviceEvents.push({time:t0+9*HOUR,type:'sensor_start'});
  if(d%3===0)deviceEvents.push({time:t0+10*HOUR,type:'site',source:'pump'});
 }
 let noise=0;
 for(let d=0;d<days;d++){
  const p=plan[d],prev=plan[d-1];
  // Nacht, die am Morgen dieses Tages endet (gehört zum Vortag-Abend).
  const sleepStart=p.t0-(1-(r()-.5)*.8)*HOUR,sleepEnd=p.t0+(7+(r()-.5)*.8)*HOUR;
  for(let t=p.t0;t<p.t0+DAY;t+=5*MIN){
   if(gapDays.includes(d)||t>end)continue;
   const h=(t-p.t0)/HOUR,age=(d%3)+(h<10&&d%3===0?3:0);let v=118+(h>4&&h<8?(h-4)*7:h>=8&&h<10?(10-h)*14:0)+age*9;
   for(const m of [...(prev?.meals||[]),...p.meals]){const x=(t-m.time)/MIN;if(x>=0&&x<300)v+=m.carbs*1.1*(x<45?x/45:Math.exp(-(x-45)/70));}
   if(p.act){const x=(t-p.act.start)/MIN;if(x>=0&&x<p.act.minutes)v-=p.act.drop*x/p.act.minutes;else if(x>=p.act.minutes&&x<p.act.minutes+150)v-=p.act.drop*(1-(x-p.act.minutes)/150);}
   if(prev?.lateLow&&h>=2&&h<4.5)v-=70*Math.sin((h-2)/2.5*Math.PI);
   if(prev?.restless&&h<6)v+=35*Math.sin(h*2.1);
   if(p.compression&&h>=3&&h<3.5)v-=60*Math.sin((h-3)/.5*Math.PI);
   if(week)v+=-6*week[Math.floor(d/7)]+(d>=shiftDay?shiftDelta:0)+(unusual.includes(d)?75:0);// ungewöhnliche Tage (z. B. Infekt)
   noise=.8*noise+gauss()*3;v=Math.max(40,Math.min(400,v+noise));
   glucose.push({time:t,value:Math.round(v),source:'share'});
  }
  for(const m of p.meals){treatments.push({time:m.time,type:'bolus',insulin:Math.round(m.carbs/10*10)/10,carbs:m.carbs});}
  for(let h=0;h<24;h+=1)treatments.push({time:p.t0+h*HOUR,type:'basal',rate:.8,duration:60});
  if(p.act){activities.push({id:p.act.id,start:p.act.start,end:p.act.end,type:p.act.type,avgHr:Math.round(130+r()*30),maxHr:Math.round(165+r()*20),load:Math.round(p.act.minutes*1.3),trainingEffect:Math.round((2+r()*2)*10)/10});
   r();if(p.act.mode)treatments.push({time:p.act.start-30*MIN,type:'exercise_mode',duration:p.act.minutes+60,source:'pump'});}
  treatments.push({time:p.t0-HOUR,type:'sleep_mode',duration:480,source:'pump'});
  if(prev?.lateLow)deviceEvents.push({time:p.t0+3*HOUR,type:'alarm',detail:'Niedrig',source:'pump'});
  const nightStd=(prev?.restless?25:8)+(prev?.lateLow?15:0);
  if(prev)sleeps.push({night:p.key,start:sleepStart,end:sleepEnd,score:Math.round(Math.max(30,Math.min(98,88-nightStd*.9+gauss()*4))),deep:Math.round(70+gauss()*15),light:Math.round(240+gauss()*20),rem:Math.round(90+gauss()*15),awake:Math.round(20+nightStd*.6),hrv:Math.round(48-nightStd*.3+gauss()*4),rhr:Math.round(54+nightStd*.1+gauss()),
   spo2:Math.round(95+g2()*.8),spo2Low:Math.round(88+g2()*2),respiration:Math.round(13+g2()*.7),stress:Math.round(14+nightStd*.5+g2()*3),restless:Math.round(25+nightStd*1.3+g2()*5),bbChange:Math.round(55-nightStd*.6+g2()*5),awakeCount:Math.round(1+nightStd/12)});
  daily.push({date:p.key,steps:Math.round(6500+(p.act?p.act.minutes*120:0)+gauss()*1500+(week?2000*week[Math.floor(d/7)]:0)),intensityMinutes:p.act?p.act.minutes:Math.round(r()*10),stressAvg:Math.round(32+(prev?.restless?8:0)+gauss()*5),bbMax:Math.round(70+(prev?.restless?-15:0)+gauss()*8),bbMin:Math.round(15+gauss()*5),rhr:Math.round(54+gauss()),
   readiness:Math.round(Math.max(10,Math.min(100,72-(prev?.restless?18:0)+g2()*7))),acwr:Math.round((1+g2()*.15)*10)/10,respiration:Math.round(14+g2()*.6),spo2:Math.round(96+g2()*.6)});
 }
 // Körperdaten für „Schlaf und Tag“ (nur mit body, eigener Zufallsstrom): Schlafphasen in Zyklen, Body Battery, Stress, Schritte, Puls.
 const stages=[],series=[],hr=[];
 if(body){const r4=rng(seed+3000);
  for(const s of sleeps){let t=s.start,c=0;while(t<s.end){const deep=c<2?25+r4()*20:5+r4()*10,rem=10+c*6+r4()*8;
   for(const [stage,m] of [['light',20+r4()*15],['deep',deep],['light',10+r4()*10],['rem',rem],...(r4()<.35?[['awake',3+r4()*6]]:[])]){const e=Math.min(s.end,t+m*MIN);if(e>t)stages.push({night:s.night,start:t,end:e,stage});t=e;if(t>=s.end)break;}c++;}}
  const first=sleeps[0]?.start??glucose[0]?.time,last=glucose.at(-1)?.time??end;let bb=60;
  for(let t=first,i=0;t<=last;t+=3*MIN,i++){const asleep=sleeps.some(s=>t>=s.start&&t<s.end),h=((t-dayStart(dayKey(t,tz),tz))/HOUR);
   if(i%5===0){bb=Math.max(5,Math.min(100,bb+(asleep?1.1:-.45)+(r4()-.5)*.6));series.push({kind:'body_battery',time:t,value:Math.round(bb)});}
   series.push({kind:'stress',time:t,value:Math.round(asleep?10+r4()*12:22+18*Math.sin(h/24*Math.PI)+r4()*20)});
   if(i%5===0&&!asleep&&h>7&&h<23)series.push({kind:'steps',time:t,value:Math.round(r4()<.3?r4()*900:r4()*120)});
   hr.push({time:t,bpm:Math.round(asleep?48+r4()*8:62+r4()*25)});}}
 return {glucose,treatments,activities,sleeps,daily,deviceEvents,stages,series,hr};
}
