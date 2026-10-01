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
