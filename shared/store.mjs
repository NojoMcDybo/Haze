// haze.db: lokale SQLite-Datenbank (node:sqlite, in Electron 44 / Node 24 eingebaut, kein natives Modul).
// Alle Zeiten UTC-ms, Glukose ungerundet in mg/dL. Rohantworten (z. B. Garmin) bleiben erhalten, damit sich
// verbesserte Auswertungen später ohne erneuten Abruf neu berechnen lassen.
import {DatabaseSync} from 'node:sqlite';
const SCHEMA=[`
create table glucose(time integer not null,source text not null,value real not null,trend text,device text,primary key(time,source)) without rowid;
create table treatment(id text primary key,time integer not null,type text not null,insulin real,carbs real,rate real,duration real,event text,notes text,source text);
create index treatment_time on treatment(time);
create table device_event(id text primary key,time integer not null,type text not null,detail text,source text);
create index device_event_time on device_event(time);
create table hr(time integer not null,source text not null,bpm real not null,primary key(time,source)) without rowid;
create table series(kind text not null,time integer not null,source text not null,value real not null,primary key(kind,time,source)) without rowid;
create table sleep(night text primary key,start integer,end integer,score real,deep real,light real,rem real,awake real,hrv real,rhr real,source text,updated integer);
create table sleep_stage(night text not null,start integer not null,end integer not null,stage text not null,primary key(night,start)) without rowid;
create table activity(id text primary key,start integer not null,end integer not null,type text,avg_hr real,max_hr real,kcal real,load real,training_effect real,source text,updated integer);
create index activity_start on activity(start);
create table daily(date text primary key,steps real,intensity_minutes real,rhr real,stress_avg real,bb_min real,bb_max real,source text,updated integer);
create table raw(source text not null,kind text not null,key text not null,fetched integer not null,json text not null,primary key(source,kind,key)) without rowid;
create table sync_state(source text primary key,cursor integer,last_ok integer,last_error text,detail text);
create table gap(start integer not null,end integer not null,status text not null,tries integer not null default 0,updated integer,primary key(start));
create table meta(key text primary key,value text);
`];
const cols={
 glucose:['time','source','value','trend','device'],
 treatment:['id','time','type','insulin','carbs','rate','duration','event','notes','source'],
 device_event:['id','time','type','detail','source'],
 hr:['time','source','bpm'],series:['kind','time','source','value'],
 sleep:['night','start','end','score','deep','light','rem','awake','hrv','rhr','source','updated'],
 sleep_stage:['night','start','end','stage'],
 activity:['id','start','end','type','avg_hr','max_hr','kcal','load','training_effect','source','updated'],
 daily:['date','steps','intensity_minutes','rhr','stress_avg','bb_min','bb_max','source','updated'],
};
const camel=k=>k.replace(/_(\w)/g,(_,c)=>c.toUpperCase());
const val=v=>v===undefined||(typeof v==='number'&&!Number.isFinite(v))?null:v;
export function openStore(file){
 const db=new DatabaseSync(file);
 db.exec('pragma journal_mode=wal;pragma synchronous=normal;pragma foreign_keys=on;');
 const version=db.prepare('pragma user_version').get().user_version;
 for(let v=version;v<SCHEMA.length;v++){db.exec('begin');try{db.exec(SCHEMA[v]);db.exec(`pragma user_version=${v+1}`);db.exec('commit');}catch(e){db.exec('rollback');throw e;}}
 const stmts=new Map();const prep=sql=>{let s=stmts.get(sql);if(!s){s=db.prepare(sql);stmts.set(sql,s);}return s;};
 const tx=fn=>{db.exec('begin');try{const r=fn();db.exec('commit');return r;}catch(e){db.exec('rollback');throw e;}};
 // Upsert: vorhandene Zeilen werden ersetzt (gleiche Quelle, gleicher Schlüssel).
 function upsert(table,rows){
  const c=cols[table],s=prep(`insert or replace into ${table}(${c.map(k=>`"${k}"`).join(',')}) values(${c.map(()=>'?').join(',')})`);
  return tx(()=>{let n=0;for(const r of rows){s.run(...c.map(k=>val(r[k]??r[camel(k)])));n++;}return n;});
 }
 const all=(sql,...a)=>prep(sql).all(...a),get=(sql,...a)=>prep(sql).get(...a);
 const state=source=>get('select * from sync_state where source=?',source)||{source,cursor:null,last_ok:null,last_error:null,detail:null};
 return {db,upsert,all,get,
  putRaw(source,kind,key,json,fetched=Date.now()){prep('insert or replace into raw values(?,?,?,?,?)').run(source,kind,key,fetched,JSON.stringify(json));},
  getRaw(source,kind,key){const r=get('select json,fetched from raw where source=? and kind=? and key=?',source,kind,key);return r?{json:JSON.parse(r.json),fetched:r.fetched}:null;},
  rawKeys(source,kind){return all('select key,fetched from raw where source=? and kind=? order by key',source,kind);},
  state,
  setState(source,patch){const s={...state(source),...patch};prep('insert or replace into sync_state values(?,?,?,?,?)').run(source,val(s.cursor),val(s.last_ok),val(s.last_error),s.detail==null?null:typeof s.detail==='string'?s.detail:JSON.stringify(s.detail));},
  glucoseTimes(from,to){return all('select time from glucose where time>=? and time<? order by time',from,to).map(r=>r.time);},
  gaps(){return all('select * from gap order by start');},
  saveGaps(list){tx(()=>{prep('delete from gap').run();const s=prep('insert into gap values(?,?,?,?,?)');for(const g of list)s.run(g.start,g.end,g.status,g.tries||0,g.updated||Date.now());});},
  // Eingabe für die Analyse-Engine (shared/analysis/index.mjs).
  load(from,to){
   const pad=86400000;
   return {
    glucose:all('select time,value,source,trend from glucose where time>=? and time<? order by time',from-pad,to+pad),
    treatments:all('select time,type,insulin,carbs,rate,duration,event,source from treatment where time>=? and time<? order by time',from-pad,to+pad),
    deviceEvents:all('select time,type,detail from device_event where time>=? and time<? order by time',from-pad,to+pad),
    activities:all('select id,start,end,type,avg_hr as avgHr,max_hr as maxHr,kcal,load,training_effect as trainingEffect from activity where start>=? and start<? order by start',from,to),
    sleeps:all('select night,start,end,score,deep,light,rem,awake,hrv,rhr from sleep where end>? and start<? order by start',from,to),
    daily:all('select date,steps,intensity_minutes as intensityMinutes,rhr,stress_avg as stressAvg,bb_min as bbMin,bb_max as bbMax from daily order by date'),
   };
  },
  stats(){
   const range=t=>get(`select count(*) n,min(${t==='activity'?'start':'time'}) first,max(${t==='activity'?'start':'time'}) last from ${t}`);
   return {glucose:range('glucose'),treatment:range('treatment'),activity:range('activity'),hr:range('hr'),
    sleep:get('select count(*) n,min(night) first,max(night) last from sleep'),daily:get('select count(*) n,min(date) first,max(date) last from daily'),
    sources:all('select source,count(*) n from glucose group by source')};
  },
  backup(target){db.exec(`vacuum into '${target.replaceAll("'","''")}'`);},
  close(){db.close();},
 };
}
// Sicherungen: die letzten 7 Tage täglich, dazu 8 Wochen lang je eine (die jüngste) pro Woche.
export function backupsToDelete(names,today){
 const dated=names.map(n=>({n,d:n.match(/(\d{4}-\d\d-\d\d)/)?.[1]})).filter(x=>x.d).sort((a,b)=>b.d.localeCompare(a.d));
 const keep=new Set(),age=d=>(Date.parse(today)-Date.parse(d))/86400000,week=d=>Math.floor(age(d)/7);
 const weeks=new Set();
 for(const x of dated){if(age(x.d)<7)keep.add(x.n);else if(week(x.d)<=8&&!weeks.has(week(x.d))){weeks.add(week(x.d));keep.add(x.n);}}
 return dated.filter(x=>!keep.has(x.n)).map(x=>x.n);
}
