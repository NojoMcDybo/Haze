// Planung der tconnectsync-Läufe (Tandem Source → Haze-Empfänger → haze.db).
// Vom letzten erfolgreichen Tag (1 Tag Überlappung) bis heute, beim ersten Mal ab dem Rückblick, in Blöcken zu
// 7 Tagen, höchstens 3 Blöcke pro Lauf, Älteste zuerst (damit der Cursor lückenlos wandert).
// Features laut tconnectsync/features.py; IOB wird für Tandem Source dort nicht verarbeitet.
export const FEATURES=['BASAL','BOLUS','PUMP_EVENTS','PROFILES','CGM','CGM_ALERTS','DEVICE_STATUS'];
export function planTandem({cursor,today,backfillDays=180,addDays,chunk=7,maxRuns=3}){
 const floor=addDays(today,-(backfillDays-1)),start=cursor?(addDays(cursor,-1)<floor?floor:addDays(cursor,-1)):floor,runs=[];
 for(let s=start;s<=today&&runs.length<maxRuns;s=addDays(s,chunk)){const e=addDays(s,chunk-1);runs.push({start:s,end:e>today?today:e});}
 return runs;
}
// Umgebung für den Kindprozess: nur das Nötigste aus Windows plus die Werte für tconnectsync. Keine .env, kein Cache.
export function childEnv(base,{email,password,url,secret,timezone='Europe/Berlin',region='EU'}){
 const keep=['SystemRoot','SYSTEMROOT','windir','PATH','Path','TEMP','TMP','USERPROFILE','HOMEDRIVE','HOMEPATH','LOCALAPPDATA','APPDATA','ProgramData','COMSPEC','PATHEXT','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE'];
 const env={};for(const k of keep)if(base[k]!=null)env[k]=base[k];
 return {...env,PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1',PYTHONNOUSERSITE:'1',
  TCONNECT_EMAIL:email,TCONNECT_PASSWORD:password,TCONNECT_REGION:region,TIMEZONE_NAME:timezone,
  NS_URL:url,NS_SECRET:secret,CACHE_CREDENTIALS:'false',AUTOUPDATE_RESTART_ON_FAILURE:'false'};
}
