// Garmin-Connect-Antworten → haze.db-Zeilen. Geprüft am 7. Oktober 2026 mit echten Antworten (Forerunner 265,
// Web-API connect.garmin.com/gc-api/, spikes/garmin-connect.cjs): Tageswerte, Schlaf inkl. Phasen (Summen stimmen
// minutengenau), Stress, Body Battery, Puls, Schritte, HRV, Aktivitätenliste (Läufe). Seit 11. Oktober zusätzlich (ebenfalls
// gegen echte Antworten geprüft): Schlaf-Epochen (HRV, Atmung, SpO2), Atmung/SpO2 des Tages, Trainingsbereitschaft,
// Trainingsstatus und Messreihen je Training (ohne GPS: Ortsdaten werden vor dem Speichern entfernt).
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
   hrv:n(json.avgOvernightHrv),rhr:n(json.restingHeartRate),source:'garmin',updated:Date.now(),
   spo2:n(d.averageSpO2Value),spo2Low:n(d.lowestSpO2Value),respiration:n(d.averageRespirationValue),stress:n(d.avgSleepStress),
   restless:n(json.restlessMomentsCount),bbChange:Number.isFinite(Number(json.bodyBatteryChange))?Number(json.bodyBatteryChange):null,awakeCount:n(d.awakeCount)},
  stages:(json.sleepLevels||[]).map(l=>({night:dateOf(d.calendarDate)||date,start:gmt(l.startGMT),end:gmt(l.endGMT),stage:STAGE[Math.round(l.activityLevel)]||'unknown'})).filter(s=>s.start&&s.end>s.start),
  // Epochen der Nacht: HRV alle 5 min, Atmung und SpO2 je Minute (nur sichere SpO2-Messungen, Vertrauen >= 2).
  series:[
   ...(json.hrvData||[]).map(x=>({kind:'hrv',time:n(x.startGMT),value:n(x.value),source:'garmin'})),
   ...(json.wellnessEpochRespirationDataDTOList||[]).map(x=>({kind:'respiration',time:n(x.startTimeGMT),value:n(x.respirationValue),source:'garmin'})),
   ...(json.wellnessEpochSPO2DataDTOList||[]).filter(x=>!(n(x.readingConfidence)<2)).map(x=>({kind:'spo2',time:gmt(x.epochTimestamp),value:n(x.spo2Reading),source:'garmin'})),
  ].filter(x=>x.time&&x.value!=null&&x.value>0)};
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
// Atmung des Tages (wellness-service/wellness/daily/respiration): Reihe laut Deskriptoren, Mittel im Wachzustand.
export function respiration(json){
 const ti=column(json?.respirationValueDescriptorsDTOList,'timestamp','index','key',0),vi=column(json?.respirationValueDescriptorsDTOList,'respiration','index','key',1);
 return {avg:n(json?.avgWakingRespirationValue),series:(json?.respirationValuesArray||[]).map(a=>({kind:'respiration',time:a[ti],value:a[vi],source:'garmin'})).filter(x=>Number.isFinite(x.time)&&x.value>0)};
}
// SpO2 des Tages (wellness-service/wellness/daily/spo2): nur der Tagesmittelwert (Nachtwerte kommen aus dem Schlaf).
export const spo2Daily=json=>n(json?.averageSpO2);
// Trainingsbereitschaft (metrics-service/metrics/trainingreadiness/{datum}): Liste, neuester Eintrag zählt.
export function readiness(json){
 const r=(Array.isArray(json)?json:[]).filter(x=>x&&n(x.score)!=null).sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp)))[0];
 return r?{readiness:n(r.score),readinessLevel:r.level??null,acuteLoad:n(r.acuteLoad),hrvWeekly:n(r.hrvWeeklyAverage),recoveryTime:n(r.recoveryTime)}:null;
}
// Trainingsstatus (metrics-service/metrics/trainingstatus/aggregated/{datum}): je Gerät; das primäre Gerät zählt.
export function trainingStatus(json){
 const all=Object.values(json?.mostRecentTrainingStatus?.latestTrainingStatusData||{}),t=all.find(x=>x?.primaryTrainingDevice)||all[0];
 if(!t)return null;const a=t.acuteTrainingLoadDTO||{};
 return {trainingStatus:t.trainingStatusFeedbackPhrase??(t.trainingStatus!=null?String(t.trainingStatus):null),acuteLoad:n(a.dailyTrainingLoadAcute),acwr:n(a.dailyAcuteChronicWorkloadRatio)};
}
// Messreihen eines Trainings (activity-service/activity/{id}/details). Ortsdaten werden nicht übernommen.
const DETAIL={directHeartRate:'activity_hr',directSpeed:'activity_speed',directPower:'activity_power',directElevation:'activity_elevation'};
export function activityDetails(json){
 const desc=json?.metricDescriptors||[],ts=desc.find(d=>d.key==='directTimestamp')?.metricsIndex;if(!Number.isInteger(ts))return [];
 const wanted=desc.filter(d=>DETAIL[d.key]&&Number.isInteger(d.metricsIndex)),out=[];
 for(const row of json.activityDetailMetrics||[]){const m=row?.metrics||[],t=m[ts];if(!Number.isFinite(t))continue;for(const d of wanted){const v=m[d.metricsIndex];if(Number.isFinite(v)&&(d.key==='directElevation'||v>0))out.push({kind:DETAIL[d.key],time:t,value:v,source:'garmin'});}}
 return out;
}
// Vor dem Speichern als Rohdaten: GPS-Spur und Koordinaten entfernen (Datensparsamkeit).
export function stripLocation(json){
 if(!json||typeof json!=='object')return json;
 const desc=json.metricDescriptors||[],drop=new Set(desc.filter(d=>/latitude|longitude/i.test(d.key)).map(d=>d.metricsIndex));
 const {geoPolylineDTO,...rest}=json;
 return {...rest,metricDescriptors:desc.filter(d=>!drop.has(d.metricsIndex)),activityDetailMetrics:(json.activityDetailMetrics||[]).map(r=>({...r,metrics:(r.metrics||[]).map((v,i)=>drop.has(i)?null:v)}))};
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
// Pro Tag nur die Datenarten abrufen, die fehlen oder noch nachgerechnet werden können: die letzten `overlap` Tage
// immer komplett, ältere Tage nur, wenn eine Datenart fehlt oder vor Ablauf der Überlappung abgerufen wurde
// (z. B. neue Datenarten nach einem Update). Neueste zuerst, höchstens `budget` Tage pro Lauf.
export function planFetch({today,backfillDays=180,overlap=3,budget=30,addDays,kinds,fetched,settledAt}){
 const out=[];
 for(let i=0;i<backfillDays&&out.length<budget;i++){
  const date=addDays(today,-i),need=i<overlap?[...kinds]:kinds.filter(k=>{const f=fetched(k,date);return f==null||f<settledAt(date);});
  if(need.length)out.push({date,kinds:need});
 }
 return out;
}
// Normalisierung erneut aus gespeicherten Rohdaten (nach Updates der Aufbereitung, ohne neuen Abruf).
export function reprocess(store){
 const dates=new Set(store.rawKeys('garmin','daily').map(r=>r.key).concat(store.rawKeys('garmin','sleep').map(r=>r.key)));let n=0;
 for(const date of dates){
  const raw={};for(const kind of Object.keys(ENDPOINTS))raw[kind]=store.getRaw('garmin',kind,date)?.json??null;
  const rows=normalizeDay(date,raw);store.upsert('daily',rows.daily);store.upsert('sleep',rows.sleep);store.upsert('sleep_stage',rows.stages);store.upsert('series',rows.series);store.upsert('hr',rows.hr);n++;
 }
 return n;
}
export const NORMALIZER_VERSION='2';
export const ENDPOINTS={
 daily:(dn,d)=>`usersummary-service/usersummary/daily/${dn}?calendarDate=${d}`,
 sleep:(dn,d)=>`wellness-service/wellness/dailySleepData/${dn}?date=${d}&nonSleepBufferMinutes=60`,
 stress:(dn,d)=>`wellness-service/wellness/dailyStress/${d}`,
 heartRate:(dn,d)=>`wellness-service/wellness/dailyHeartRate/${dn}?date=${d}`,
 steps:(dn,d)=>`wellness-service/wellness/dailySummaryChart/${dn}?date=${d}`,
 hrv:(dn,d)=>`hrv-service/hrv/${d}`,
 respiration:(dn,d)=>`wellness-service/wellness/daily/respiration/${d}`,
 spo2:(dn,d)=>`wellness-service/wellness/daily/spo2/${d}`,
 readiness:(dn,d)=>`metrics-service/metrics/trainingreadiness/${d}`,
 trainingStatus:(dn,d)=>`metrics-service/metrics/trainingstatus/aggregated/${d}`,
};
export const activityDetailsPath=id=>`activity-service/activity/${encodeURIComponent(id)}/details?maxChartSize=2000&maxPolylineSize=0`;
export const activitiesPath=(from,to,start=0)=>`activitylist-service/activities/search/activities?startDate=${from}&endDate=${to}&start=${start}&limit=100`;
// Rohantworten eines Tages in Zeilen übersetzen (auch für spätere Neuberechnung aus raw).
export function normalizeDay(date,raw){
 const out={daily:[],sleep:[],stages:[],series:[],hr:[]};
 // Tageszeile aus mehreren Antworten zusammensetzen; fehlt die Tageszusammenfassung, bleibt es bei den übrigen Feldern.
 const resp=respiration(raw.respiration),ready=readiness(raw.readiness),status=trainingStatus(raw.trainingStatus);
 const d={...(daily(raw.daily,date)||{date,source:'garmin',updated:Date.now()}),respiration:resp.avg,spo2:spo2Daily(raw.spo2),...(ready||{}),
  trainingStatus:status?.trainingStatus??null,acwr:status?.acwr??null,acuteLoad:ready?.acuteLoad??status?.acuteLoad??null};
 if(raw.daily||raw.respiration||raw.spo2||raw.readiness||raw.trainingStatus)out.daily.push(d);
 const s=sleep(raw.sleep,date);if(s){const h=hrv(raw.hrv);if(h&&s.sleep.hrv==null)s.sleep.hrv=h.value;out.sleep.push(s.sleep);out.stages.push(...s.stages);out.series.push(...s.series);}
 out.series.push(...stress(raw.stress),...steps(raw.steps),...resp.series);out.hr.push(...heartRate(raw.heartRate));
 return out;
}
export {DAY};
