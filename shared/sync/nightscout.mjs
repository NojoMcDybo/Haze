// Nightscout-Historie schrittweise nach haze.db holen (nur GET). Quelle für Share-Werte (nightscout-connect)
// und Pumpendaten (tconnectsync). Zeitfenster aufsteigend, damit ein Abbruch nichts überspringt.
const DAY=86400000,HOUR=3600000;
function base(url){
 const u=new URL(url);if(u.username||u.password||u.search||u.hash)throw Error('Ungültige Nightscout-Adresse');
 if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw Error('Bitte HTTPS verwenden; HTTP ist nur für localhost erlaubt.');
 return u.toString().replace(/\/$/,'');
}
async function getJson(fetcher,url,token){
 const u=new URL(url);if(token)u.searchParams.set('token',token);
 const r=await fetcher(u,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(30000),redirect:'error',cache:'no-store'});
 if([401,403].includes(r.status))throw Object.assign(Error('Zugang abgelehnt. Lesetoken und Rechte prüfen.'),{kind:'auth'});
 if(!r.ok)throw Object.assign(Error(`Nightscout antwortet mit HTTP ${r.status}.`),{kind:'server'});
 const data=await r.json();if(!Array.isArray(data))throw Object.assign(Error('Nightscout liefert keine Liste.'),{kind:'data'});
 return data;
}
export const pumpDevice=d=>/tconnect|tandem|t:slim/i.test(String(d||''));
export function mapEntry(e){
 const time=Number(e.date??Date.parse(e.dateString)),value=Number(e.sgv);
 if(!Number.isFinite(time)||!Number.isFinite(value)||(e.type&&e.type!=='sgv')||value<20||value>600)return null;
 return {time,value,trend:e.direction??null,device:e.device??null,source:pumpDevice(e.device)||pumpDevice(e.enteredBy)?'pump':'share'};
}
// Nightscout-Behandlungen (Careportal, tconnectsync) auf wenige Typen abbilden; Unbekanntes bleibt als Notiz erhalten.
// tconnectsync (parser/nightscout.py): enteredBy „Pump (tconnectsync)“; Temp Basal (absolute, duration), Combo Bolus
// (insulin, carbs), Site Change, Basal Suspension/Resume, Alarm, CGM Alert, Sensor Start/Stop, Sleep, Exercise.
export function mapTreatment(t){
 const time=Number(t.date??t.mills??Date.parse(t.created_at??t.timestamp));if(!Number.isFinite(time))return null;
 const ev=String(t.eventType||''),n=x=>x==null||x===''?null:Number(x);
 const out={id:String(t._id??t.identifier??`${ev}:${time}`),time,event:ev||null,notes:t.notes?String(t.notes).slice(0,500):null,
  insulin:n(t.insulin),carbs:n(t.carbs),rate:n(t.absolute??t.rate),duration:n(t.duration),source:pumpDevice(t.enteredBy)||pumpDevice(t.device)?'pump':'nightscout'};
 const has=k=>Number.isFinite(out[k])&&out[k]>0;
 let type='note';
 if(/temp basal|^basal$/i.test(ev))type='basal';
 else if(/suspen/i.test(ev))type='suspend';
 else if(/resume/i.test(ev))type='resume';
 else if(/sleep/i.test(ev)||/sleep mode/i.test(out.notes||''))type='sleep_mode';
 else if(/exercise/i.test(ev)||/exercise mode/i.test(out.notes||''))type='exercise_mode';
 else if(/site change|cannula/i.test(ev))type='site';
 else if(/cartridge|insulin change|reservoir/i.test(ev))type='cartridge';
 else if(/sensor (start|change)/i.test(ev))type='sensor_start';
 else if(/sensor stop/i.test(ev))type='sensor_stop';
 else if(/alarm|alert/i.test(ev))type='alarm';
 else if(has('insulin'))type='bolus';
 else if(has('carbs'))type='carbs';
 return {...out,type};
}
// Behandlungen, die eigentlich Geräteereignisse sind, getrennt ablegen.
export const deviceTypes=new Set(['sensor_start','sensor_stop','alarm','site','cartridge']);
export async function syncNightscout({url,token='',store,fetcher=fetch,now=Date.now(),backfillDays=180,rescanDays=3,from:forceFrom,to:forceTo,onProgress=()=>{}}){
 const root=base(url),floor=now-backfillDays*DAY,result={entries:0,treatments:0,devices:0,windows:0};
 // Werte: ab Cursor (1 h Überlappung); Behandlungen: immer die letzten Tage erneut (tconnectsync lädt verspätet hoch).
 const st=store.state('nightscout-entries'),tt=store.state('nightscout-treatments');
 const eFrom=forceFrom??Math.max(floor,(st.cursor??floor)-HOUR),tFrom=forceFrom??Math.max(floor,Math.min(tt.cursor??floor,now-rescanDays*DAY)),to=forceTo??now+HOUR;
 for(let a=eFrom;a<to;a+=DAY){
  const b=Math.min(to,a+DAY),data=await getJson(fetcher,`${root}/api/v1/entries/sgv.json?find[date][$gte]=${a}&find[date][$lt]=${b}&count=2000`,token);
  const rows=data.map(mapEntry).filter(Boolean);result.entries+=store.upsert('glucose',rows);result.windows++;
  if(forceFrom==null)store.setState('nightscout-entries',{cursor:Math.min(b,now),last_ok:Date.now(),last_error:null});
  onProgress({kind:'entries',from:a,to:b,total:to-eFrom,done:b-eFrom});
 }
 for(let a=tFrom;a<to;a+=7*DAY){
  const b=Math.min(to,a+7*DAY),data=await getJson(fetcher,`${root}/api/v1/treatments.json?find[created_at][$gte]=${new Date(a).toISOString()}&find[created_at][$lt]=${new Date(b).toISOString()}&count=10000`,token);
  const rows=data.map(mapTreatment).filter(Boolean),dev=rows.filter(r=>deviceTypes.has(r.type)).map(r=>({id:r.id,time:r.time,type:r.type,detail:r.event,source:r.source}));
  result.treatments+=store.upsert('treatment',rows.filter(r=>!deviceTypes.has(r.type)));result.devices+=store.upsert('device_event',dev);result.windows++;
  if(forceFrom==null)store.setState('nightscout-treatments',{cursor:Math.min(b,now),last_ok:Date.now(),last_error:null});
 }
 try{const profile=await getJson(fetcher,`${root}/api/v1/profile.json?count=5`,token);if(profile.length)store.putRaw('nightscout','profile','latest',profile);}catch{}
 return result;
}
