// Garmin-Connect-Antworten → haze.db-Zeilen. Geprüft am 7. Oktober 2026 mit echten Antworten (Forerunner 265,
// Web-API connect.garmin.com/gc-api/, spikes/garmin-connect.cjs): Tageswerte, Schlaf inkl. Phasen (Summen stimmen
// minutengenau), Stress, Body Battery, Puls, Schritte, HRV, Aktivitätenliste (Läufe).
// Jede Funktion bleibt tolerant gegen fehlende Felder; Rohantworten werden zusätzlich gespeichert.
const DAY=86400000;
export const gmt=s=>{if(s==null)return null;if(typeof s==='number')return s;const t=Date.parse(String(s).replace(' ','T')+(/Z|[+-]\d\d:?\d\d$/.test(s)?'':'Z'));return Number.isFinite(t)?t:null;};
const n=v=>v==null||v===''||!Number.isFinite(Number(v))||Number(v)<0?null:Number(v);
const dateOf=key=>/^\d{4}-\d\d-\d\d$/.test(key)?key:null;
// Tageszusammenfassung (usersummary-service/usersummary/daily).
export function daily(json,date){
 if(!json||typeof json!=='object')return null;
 const mod=n(json.moderateIntensityMinutes),vig=n(json.vigorousIntensityMinutes);
 return {date:dateOf(json.calendarDate)||date,steps:n(json.totalSteps),
  // Garmin zählt intensive Minuten doppelt.
  intensityMinutes:mod==null&&vig==null?null:(mod||0)+2*(vig||0),
  rhr:n(json.restingHeartRate),stressAvg:n(json.averageStressLevel),bbMax:n(json.bodyBatteryHighestValue),bbMin:n(json.bodyBatteryLowestValue),source:'garmin',updated:Date.now()};
}
// Schlaf (wellness-service/wellness/dailySleepData). Phasen: activityLevel 0 tief, 1 leicht, 2 REM, 3 wach (geprüft).
const STAGE={0:'deep',1:'light',2:'rem',3:'awake'};
export function sleep(json,date){
 const d=json?.dailySleepDTO;if(!d)return null;
 const start=n(d.sleepStartTimestampGMT),end=n(d.sleepEndTimestampGMT);if(!start||!end||end<=start)return null;
 const min=s=>n(s)==null?null:Math.round(n(s)/60);
 return {sleep:{night:dateOf(d.calendarDate)||date,start,end,score:n(d.sleepScores?.overall?.value),deep:min(d.deepSleepSeconds),light:min(d.lightSleepSeconds),rem:min(d.remSleepSeconds),awake:min(d.awakeSleepSeconds),
   hrv:n(json.avgOvernightHrv),rhr:n(json.restingHeartRate),source:'garmin',updated:Date.now()},
  stages:(json.sleepLevels||[]).map(l=>({night:dateOf(d.calendarDate)||date,start:gmt(l.startGMT),end:gmt(l.endGMT),stage:STAGE[Math.round(l.activityLevel)]||'unknown'})).filter(s=>s.start&&s.end>s.start)};
}
// Stress und Body Battery (wellness-service/wellness/dailyStress): [[zeit, wert], …]; negative Werte = keine Messung.
// Spaltenindex laut Deskriptor-Liste der Antwort (z. B. bodyBatteryLevel = 2), sonst Standard.
const column=(list,key,idxKey,nameKey,fallback)=>{const d=(list||[]).find(x=>x?.[nameKey]===key);return Number.isInteger(d?.[idxKey])?d[idxKey]:fallback;};
export function stress(json){
 const out=[],si=column(json?.stressValueDescriptorsDTOList,'stressLevel','index','key',1),ti=column(json?.stressValueDescriptorsDTOList,'timestamp','index','key',0);
 const bi=column(json?.bodyBatteryValueDescriptorsDTOList,'bodyBatteryLevel','bodyBatteryValueDescriptorIndex','bodyBatteryValueDescriptorKey',2),bt=column(json?.bodyBatteryValueDescriptorsDTOList,'timestamp','bodyBatteryValueDescriptorIndex','bodyBatteryValueDescriptorKey',0);
 for(const a of json?.stressValuesArray||[]){const t=a[ti],v=a[si];if(Number.isFinite(t)&&Number.isFinite(v)&&v>=0)out.push({kind:'stress',time:t,value:v,source:'garmin'});}
 for(const a of json?.bodyBatteryValuesArray||[]){const t=a[bt],v=a[bi];if(Number.isFinite(t)&&Number.isFinite(v)&&v>=0)out.push({kind:'body_battery',time:t,value:v,source:'garmin'});}
 return out;
}
// Puls des Tages (wellness-service/wellness/dailyHeartRate): [[zeit, bpm], …].
export function heartRate(json){return (json?.heartRateValues||[]).filter(([t,v])=>Number.isFinite(t)&&v>0).map(([time,bpm])=>({time,bpm,source:'garmin'}));}
// Schritte in 15-min-Abschnitten (wellness-service/wellness/dailySummaryChart).
export function steps(json){return (Array.isArray(json)?json:[]).map(s=>({kind:'steps',time:gmt(s.startGMT),value:n(s.steps),source:'garmin'})).filter(s=>s.time&&s.value!=null);}
// HRV (hrv-service/hrv/{datum}).
export function hrv(json){const v=n(json?.hrvSummary?.lastNightAvg);return v==null?null:{value:v,status:json.hrvSummary.status??null};}
// Aktivitätenliste (activitylist-service/activities/search/activities).
export function activities(json){
 return (Array.isArray(json)?json:[]).map(a=>{const start=gmt(a.startTimeGMT),dur=n(a.duration);return start&&dur?{id:`garmin:${a.activityId}`,start,end:start+dur*1000,type:a.activityType?.typeKey||'sonstige',
  avgHr:n(a.averageHR),maxHr:n(a.maxHR),kcal:n(a.calories),load:n(a.activityTrainingLoad),trainingEffect:n(a.aerobicTrainingEffect),source:'garmin',updated:Date.now()}:null;}).filter(Boolean);
}
// Welche Tage beim nächsten Lauf abgerufen werden: die letzten `overlap` Tage immer (Garmin rechnet nach),
// danach rückwärts alles, was noch fehlt, bis `backfillDays`; höchstens `budget` Tage pro Lauf, Neueste zuerst.
export function planDays({today,done=new Set(),backfillDays=180,overlap=3,budget=30,addDays}){
 const out=[];for(let i=0;i<backfillDays&&out.length<budget;i++){const d=addDays(today,-i);if(i<overlap||!done.has(d))out.push(d);}
 return out;
}
export const ENDPOINTS={
 daily:(dn,d)=>`usersummary-service/usersummary/daily/${dn}?calendarDate=${d}`,
 sleep:(dn,d)=>`wellness-service/wellness/dailySleepData/${dn}?date=${d}&nonSleepBufferMinutes=60`,
 stress:(dn,d)=>`wellness-service/wellness/dailyStress/${d}`,
 heartRate:(dn,d)=>`wellness-service/wellness/dailyHeartRate/${dn}?date=${d}`,
 steps:(dn,d)=>`wellness-service/wellness/dailySummaryChart/${dn}?date=${d}`,
 hrv:(dn,d)=>`hrv-service/hrv/${d}`,
};
export const activitiesPath=(from,to,start=0)=>`activitylist-service/activities/search/activities?startDate=${from}&endDate=${to}&start=${start}&limit=100`;
// Rohantworten eines Tages in Zeilen übersetzen (auch für spätere Neuberechnung aus raw).
export function normalizeDay(date,raw){
 const out={daily:[],sleep:[],stages:[],series:[],hr:[]};
 const d=daily(raw.daily,date);if(d)out.daily.push(d);
 const s=sleep(raw.sleep,date);if(s){const h=hrv(raw.hrv);if(h&&s.sleep.hrv==null)s.sleep.hrv=h.value;out.sleep.push(s.sleep);out.stages.push(...s.stages);}
 out.series.push(...stress(raw.stress),...steps(raw.steps));out.hr.push(...heartRate(raw.heartRate));
 return out;
}
export {DAY};
