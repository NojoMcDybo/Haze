// Haze-Empfänger für tconnectsync: ein winziger, Nightscout-kompatibler Server nur auf 127.0.0.1 und nur für die
// Dauer eines Laufs. tconnectsync schreibt dorthin statt nach Nightscout, die Daten landen direkt in haze.db.
// Sicherheit: zufälliger Port, Einmal-Geheimnis pro Lauf (zeitkonstant verglichen), nur Loopback, nur bekannte Pfade,
// Größenlimit, nur JSON. Das Nightscout-API_SECRET wird nie gebraucht; Nightscout bleibt unberührt.
// Formate und Pfade aus tconnectsync 3.0.3 (nightscout.py, parser/nightscout.py).
import http from 'node:http';
import crypto from 'node:crypto';
import {mapTreatment,mapEntry,deviceTypes} from './nightscout.mjs';
const MAX_BODY=10*1024*1024;
const COLLECTIONS=new Set(['treatments','entries','activity','devicestatus','profile']);
const sha1=s=>crypto.createHash('sha1').update(s).digest('hex');
const same=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);};
// Pfad → {collection, sub}; alles andere ist kein gültiger Endpunkt.
export function route(method,pathname){
 const m=pathname.match(/^\/api\/v1\/([a-z]+)(?:\.json)?(?:\/([A-Za-z0-9:._-]{1,200}))?$/);if(!m)return null;
 const [,name,sub]=m;
 if(name==='status'&&method==='GET'&&!sub)return {collection:'status'};
 if(!COLLECTIONS.has(name))return null;
 if(method==='GET'&&(!sub||(name==='profile'&&sub==='current')))return {collection:name,sub};
 if(method==='POST'&&!sub)return {collection:name};
 if(method==='PUT'&&name==='profile'&&!sub)return {collection:name};
 if(method==='DELETE'&&name==='treatments'&&sub)return {collection:name,sub};
 return null;
}
export function authorized(headers,query,secret){
 const h=headers['api-secret'],q=query.get('api_secret');
 return (h!=null&&same(h,sha1(secret)))||(q!=null&&same(q,secret));
}
// find[feld][$gte]=…/$lte=… aus der Abfrage (ISO-Datum oder Zahl) → ms.
function range(query,field){const t=v=>v==null?null:(/^\d+$/.test(v)?Number(v):Date.parse(v));return {from:t(query.get(`find[${field}][$gte]`)),to:t(query.get(`find[${field}][$lte]`))};}
export const docTime=d=>{const t=Number(d.date??Date.parse(d.created_at??d.dateString??d.startDate));return Number.isFinite(t)?t:null;};
export function docId(collection,d){
 if(collection==='entries')return `tandem:sgv:${docTime(d)}`;
 const ev=d.eventType??d.activityType??collection;
 return d.pump_event_id?`tandem:${ev}:${d.pump_event_id}`:`tandem:${ev}:${d.created_at??docTime(d)}`;
}
// Ein empfangenes Dokument speichern: Rohdokument für spätere Abfragen + normalisierte Zeilen für die Analyse.
export function ingest(store,collection,doc){
 if(!doc||typeof doc!=='object'||Array.isArray(doc))return false;
 const time=collection==='profile'?(docTime(doc)??Date.now()):docTime(doc);if(time==null)return false;
 const id=collection==='profile'?'tandem:profile:current':docId(collection,doc),stored={...doc,_id:id};
 store.putDoc(collection,id,time,doc.eventType??doc.activityType??null,stored);
 if(collection==='treatments'){
  const row=mapTreatment(stored);if(row){const r={...row,source:'pump'};if(deviceTypes.has(r.type))store.upsert('device_event',[{id:r.id,time:r.time,type:r.type,detail:r.notes||r.event,source:'pump'}]);else store.upsert('treatment',[r]);}
 }else if(collection==='entries'){
  const row=mapEntry({...doc,type:doc.type||'sgv'});if(row)store.upsert('glucose',[{...row,source:'pump'}]);
 }else if(collection==='devicestatus'){
  const p=Number(doc.pump?.battery?.percent);if(Number.isFinite(p))store.upsert('series',[{kind:'pump_battery',time,value:p,source:'pump'}]);
 }else if(collection==='profile')store.putRaw('tandem','profile','current',stored);
 return true;
}
function latest(store,collection,query){
 if(collection==='entries'){const r=range(query,'dateString');return store.latestDoc('entries',{from:r.from,to:r.to});}
 const r=range(query,'created_at'),event=query.get('find[eventType]')??query.get('find[activityType]');
 return store.latestDoc(collection,{event,from:r.from,to:r.to});
}
export function deleteTreatment(store,id){
 const n=store.deleteDoc('treatments',id);store.db.prepare('delete from treatment where id=?').run(id);store.db.prepare('delete from device_event where id=?').run(id);return n;
}
// Server starten. Gibt URL und Einmal-Geheimnis für die Umgebung von tconnectsync zurück.
export function startSink({store,secret=crypto.randomBytes(32).toString('hex'),onRequest=()=>{}}={}){
 const stats={requests:0,rejected:0,stored:{}};let port;
 const server=http.createServer(async(req,res)=>{
  stats.requests++;
  const reply=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(body===undefined?'':JSON.stringify(body));};
  const reject=(code)=>{stats.rejected++;onRequest({method:req.method,path:req.url?.split('?')[0],code});reply(code,{status:code});};
  try{
   const remote=req.socket.remoteAddress;
   if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote))return reject(403);
   if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`)return reject(403);
   const u=new URL(req.url,`http://127.0.0.1:${port}`),r=route(req.method,u.pathname);
   if(!r)return reject(404);
   if(!authorized(req.headers,u.searchParams,secret))return reject(401);
   onRequest({method:req.method,path:u.pathname,code:200});
   if(r.collection==='status')return reply(200,{status:'ok',name:'Haze',version:'haze-tandem-sink',serverTime:new Date().toISOString(),apiEnabled:true,careportalEnabled:true,settings:{units:'mg/dl'}});
   if(req.method==='GET'){
    if(r.collection==='profile'){const p=store.latestDoc('profile');return reply(200,r.sub==='current'?(p||{}):(p?[p]:[]));}
    const d=latest(store,r.collection,u.searchParams);return reply(200,d?[d]:[]);
   }
   if(req.method==='DELETE')return reply(200,{n:deleteTreatment(store,r.sub)});
   let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>MAX_BODY)return reject(413);chunks.push(c);}
   if(!/application\/json/i.test(req.headers['content-type']||''))return reject(415);
   let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reject(400);}
   const docs=Array.isArray(body)?body:[body];let n=0;for(const d of docs)if(ingest(store,r.collection,d))n++;
   stats.stored[r.collection]=(stats.stored[r.collection]||0)+n;
   return reply(200,docs.map(d=>({...d,_id:r.collection==='profile'?'tandem:profile:current':docId(r.collection,d)})));
  }catch(e){return reject(500);}
 });
 return new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>{port=server.address().port;resolve({url:`http://127.0.0.1:${port}/`,port,secret,stats,close:()=>new Promise(r=>{server.closeAllConnections?.();server.close(()=>r());})});});
 });
}
// Alle Vorkommen geheimer Werte (und das Einmal-Geheimnis in URLs) aus Protokollen entfernen.
export function mask(text,secrets){
 let out=String(text||'');
 // Auch URL-kodiert: JavaScript- und Python-Variante (urllib.quote kodiert z. B. auch „!“).
 const py=s=>[...new TextEncoder().encode(s)].map(b=>/[A-Za-z0-9_.~-]/.test(String.fromCharCode(b))?String.fromCharCode(b):'%'+b.toString(16).toUpperCase().padStart(2,'0')).join('');
 for(const s of secrets.filter(x=>typeof x==='string'&&x.length>=3).sort((a,b)=>b.length-a.length))for(const v of new Set([s,encodeURIComponent(s),py(s)]))out=out.split(v).join('***');
 return out.replace(/(api_secret=)[^&\s"']+/gi,'$1***').replace(/(api-secret['"]?\s*[:=]\s*['"]?)[0-9a-f]{40}/gi,'$1***');
}
