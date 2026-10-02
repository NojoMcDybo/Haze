// Bluetooth SIG Heart Rate Measurement (0x2A37). Optional fields are not inferred.
export function parseHeartRate(value) {
  if (!(value instanceof DataView) || value.byteLength < 2) throw Error('Unvollständiges Pulspaket');
  const flags=value.getUint8(0); let offset=1;
  const read16=()=>{if(offset+2>value.byteLength)throw Error('Unvollständiges Pulspaket');const n=value.getUint16(offset,true);offset+=2;return n;};
  const bpm=flags&1?read16():value.getUint8(offset++);
  if(bpm<1||bpm>300)throw Error('Ungültiger Puls');
  const contact=flags&4?!!(flags&2):null;
  const energyKj=flags&8?read16():null;
  const rrMs=[];
  if(flags&16)while(offset<value.byteLength)rrMs.push(read16()*1000/1024);
  return {bpm,contact,energyKj,rrMs};
}
export function liveHeartRate(garmin,now=Date.now()) {
  return !!(garmin?.connected&&garmin?.reading&&garmin.reading.contact!==false&&now-garmin.reading.at>=0&&now-garmin.reading.at<15000);
}
// Pulse history: one averaged value per minute, last 24 hours, only readings with skin contact.
export const HEART_BUCKET=60000,HEART_SPAN=24*3600000;
export function recordHeartRate(history,bpm,at,contact=null){
 if(contact===false||!Number.isFinite(bpm)||bpm<1||bpm>300||!Number.isFinite(at))return history;
 const time=Math.floor(at/HEART_BUCKET)*HEART_BUCKET,last=history.at(-1);
 if(last&&last.time===time){last.sum+=bpm;last.n++;last.bpm=Math.round(last.sum/last.n);}
 else if(!last||time>last.time)history.push({time,bpm:Math.round(bpm),sum:bpm,n:1});
 while(history.length&&history[0].time<at-HEART_SPAN)history.shift();
 return history;
}
export const publicHeartHistory=history=>history.map(({time,bpm})=>({time,bpm}));
export function restoreHeartHistory(saved,now=Date.now()){
 if(!Array.isArray(saved))return [];
 return saved.filter(h=>Number.isFinite(h?.time)&&Number.isFinite(h?.bpm)&&h.bpm>=1&&h.bpm<=300&&h.time>now-HEART_SPAN&&h.time<=now&&h.time%HEART_BUCKET===0)
  .sort((a,b)=>a.time-b.time).filter((h,i,a)=>!i||a[i-1].time!==h.time)
  .map(h=>{const n=Number.isInteger(h.n)&&h.n>0?h.n:1;return {time:h.time,bpm:Math.round(h.bpm),sum:h.bpm*n,n};});
}
// Line segments for a time window. More than 2 minutes without data breaks the line: no invented values.
export function heartSegments(history,start,end,maxGap=150000){
 const segments=[];let current=null,prev=null;
 for(const h of history){if(h.time<start||h.time>end)continue;if(!current||h.time-prev>maxGap){current=[];segments.push(current);}current.push(h);prev=h.time;}
 return segments;
}
export function nearestHeartRate(history,time,maxDistance=90000){let best=null;for(const h of history){const d=Math.abs(h.time-time);if(d<=maxDistance&&(!best||d<Math.abs(best.time-time)))best=h;}return best;}
