// Planung der tconnectsync-Läufe (Tandem Source → lokales Nightscout), die Haze selbst startet.
// Regulär: vom letzten erfolgreichen Tag (1 Tag Überlappung) bis heute, beim ersten Mal rückwärts bis zum Rückblick,
// in Blöcken zu 7 Tagen, höchstens 3 Blöcke pro Lauf, Älteste zuerst (damit der Cursor lückenlos wandert).
export const FEATURES=['BASAL','BOLUS','PUMP_EVENTS','PROFILES','CGM_ALERTS'];
export function planTandem({cursor,today,backfillDays=180,addDays,chunk=7,maxRuns=3}){
 const floor=addDays(today,-(backfillDays-1)),start=cursor?(addDays(cursor,-1)<floor?floor:addDays(cursor,-1)):floor,runs=[];
 for(let s=start;s<=today&&runs.length<maxRuns;s=addDays(s,chunk)){const e=addDays(s,chunk-1);runs.push({start:s,end:e>today?today:e});}
 return runs;
}
