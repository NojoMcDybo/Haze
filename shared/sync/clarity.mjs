// Dexcom-Clarity-CSV-Export (clarity.dexcom.eu → Exportieren) einlesen. Englische und deutsche Spaltennamen.
// Zeitstempel im Export sind Ortszeit ohne Zone; sie werden mit der angegebenen Zeitzone nach UTC umgerechnet.
import {offset} from '../analysis/time.mjs';
export function parseCsv(text){
 const rows=[];let row=[],cell='',q=false;
 const src=text.replace(/^﻿/,'');
 const sep=(src.split('\n')[0].match(/;/g)||[]).length>(src.split('\n')[0].match(/,/g)||[]).length?';':',';
 for(let i=0;i<src.length;i++){
  const c=src[i];
  if(q){if(c==='"'){if(src[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=c;continue;}
  if(c==='"')q=true;else if(c===sep){row.push(cell);cell='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&src[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}else cell+=c;
 }
 if(cell!==''||row.length){row.push(cell);rows.push(row);}
 return rows;
}
const find=(header,re)=>header.findIndex(h=>re.test(h));
function localToUtc(s,tz){
 const m=s.match(/(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d))?/);if(!m)return null;
 const guess=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0));let t=guess-offset(guess,tz);t=guess-offset(t,tz);return t;
}
const num=s=>{const v=Number(String(s??'').trim().replace(',','.'));return Number.isFinite(v)&&String(s).trim()!==''?v:null;};
export function parseClarity(text,tz){
 const rows=parseCsv(text),h=rows.findIndex(r=>r.some(c=>/time ?stamp|zeitstempel/i.test(c)));
 if(h<0)throw Error('Keine Clarity-Exportdatei: Spalte „Zeitstempel“/„Timestamp“ fehlt.');
 const header=rows[h].map(c=>c.trim());
 const col={time:find(header,/time ?stamp|zeitstempel/i),type:find(header,/event type|ereignistyp/i),sub:find(header,/event subtype|ereignis.?untertyp|untertyp/i),
  glucose:find(header,/glucose value|glukosewert|glucosewert/i),insulin:find(header,/insulin value|insulinwert/i),carbs:find(header,/carb value|kohlenhydrat/i),
  duration:find(header,/duration|dauer/i),device:find(header,/device info|geräteinfo/i)};
 if(col.time<0||col.glucose<0)throw Error('Clarity-Export ohne Zeit- oder Glukosespalte.');
 const mmol=/mmol/i.test(header[col.glucose]);
 const glucose=[],treatments=[],deviceEvents=[];let skipped=0;
 for(const r of rows.slice(h+1)){
  const time=localToUtc(r[col.time]||'',tz),type=(r[col.type]||'').trim(),sub=(r[col.sub]||'').trim();
  if(time==null){skipped++;continue;}
  if(/^(egv|egw|ggw|glucose|glukose|sensor)/i.test(type)||(!type&&r[col.glucose])){
   const raw=(r[col.glucose]||'').trim();let v=num(raw);
   if(v!=null&&mmol)v=v*18;else if(v==null&&/low|niedrig/i.test(raw))v=39;else if(v==null&&/high|hoch/i.test(raw))v=401;
   if(v==null){skipped++;continue;}
   glucose.push({time,value:v,source:'clarity'});
  }else if(/carb|kohlenhydrat/i.test(type)){const c=num(r[col.carbs]);if(c)treatments.push({id:`clarity:carbs:${time}`,time,type:'carbs',carbs:c,event:type,source:'clarity'});}
  else if(/insulin/i.test(type)){const u=num(r[col.insulin]);if(u)treatments.push({id:`clarity:insulin:${time}`,time,type:/long|lang|basal/i.test(sub)?'basal_injection':'bolus',insulin:u,event:`${type} ${sub}`.trim(),source:'clarity'});}
  else if(/exerci|bewegung|sport/i.test(type)){const d=(r[col.duration]||'').match(/(\d+):(\d+)/);treatments.push({id:`clarity:exercise:${time}`,time,type:'exercise',duration:d?+d[1]*60+ +d[2]:null,event:`${type} ${sub}`.trim(),source:'clarity'});}
  else if(/alert|alarm|warn/i.test(type))deviceEvents.push({id:`clarity:alarm:${time}`,time,type:'alarm',detail:sub||type,source:'clarity'});
  else if(/device|gerät/i.test(type)&&/sensor/i.test(`${sub} ${r[col.device]||''}`))deviceEvents.push({id:`clarity:device:${time}`,time,type:'sensor_start',detail:sub,source:'clarity'});
  else skipped++;
 }
 glucose.sort((a,b)=>a.time-b.time);
 return {glucose,treatments,deviceEvents,skipped,from:glucose[0]?.time??null,to:glucose.at(-1)?.time??null};
}
