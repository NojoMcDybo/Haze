// Datenhaltung und Hintergrund-Synchronisierung: haze.db, Nightscout-Historie, Tandem (tconnectsync → Haze-Empfänger),
// Lücken (Pumpen-CGM und Clarity-Import), Garmin, Sicherung.
// Läuft beim Start (verzögert), stündlich und nach Standby. Fehler einer Quelle stoppen die anderen nicht.
const fs=require('fs'),path=require('path');
const {Worker}=require('worker_threads');
const GarminConnect=require('./garmin-connect.cjs');
const Tandem=require('./tandem.cjs');
const DAY=86400000,HOUR=3600000;
module.exports=class DataService{
 // tandemAuth: liefert {email,password} entschlüsselt aus settings.json (DPAPI) oder null; nur im Speicher verwendet.
 constructor({dir,config,token,tandemAuth=()=>null,changed}){this.dir=dir;this.file=path.join(dir,'haze.db');this.config=config;this.token=token;this.tandemAuth=tandemAuth;this.changed=changed;this.tandem=new Tandem(dir);
  this.status={running:false,phase:null,progress:null,lastRun:null,errors:{},results:{},gaps:[],stats:null,lastBackup:null};
  this.garmin=new GarminConnect(()=>changed());this.cache=new Map();}
 async init(){
  [this.store,this.ns,this.gaps,this.gc,this.time,this.clarity]=await Promise.all(['../shared/store.mjs','../shared/sync/nightscout.mjs','../shared/sync/gaps.mjs','../shared/sync/garmin-connect.mjs','../shared/analysis/time.mjs','../shared/sync/clarity.mjs'].map(m=>import(m)));
  this.db=this.store.openStore(this.file);
  // Nach einem Update der Garmin-Aufbereitung die gespeicherten Rohdaten einmal neu auswerten (kein neuer Abruf).
  if(this.db.meta('garmin-normalizer')!==this.gc.NORMALIZER_VERSION){try{this.gc.reprocess(this.db);this.db.setMeta('garmin-normalizer',this.gc.NORMALIZER_VERSION);}catch{}}
  this.refreshStats();
 }
 tz(){return this.time.defaultZone();}
 refreshStats(){try{this.status.stats=this.db.stats();this.status.gaps=this.db.gaps().slice(-20).reverse();}catch{}}
 publicStatus(){const c=this.config(),i=this.tandem.info();return {...this.status,garmin:{...this.garmin.state,enabled:!!c.garminConnect},
  tandem:{enabled:!!c.tandem?.enabled,installed:this.tandem.installed(),version:i?.version??null,python:i?.python??null,busy:this.tandem.busy,cursor:this.cursor('tandem-sync')}};}
 // Beim Beenden ist die Datenbank zu, Statusmeldungen (z. B. vom Garmin-Fenster) dürfen dann nicht mehr auf sie zugreifen.
 cursor(source){try{return this.db?.state(source).detail??null;}catch{return null;}}
 // Fortschritt höchstens zweimal pro Sekunde melden (jede Meldung erreicht Dashboard, Webansicht und Notch).
 set(patch){Object.assign(this.status,patch);const now=Date.now();if(now-(this.emitted||0)>=500){this.emitted=now;this.changed();}else if(!this.pending)this.pending=setTimeout(()=>{this.pending=null;this.emitted=Date.now();this.changed();},500);}
 start(){this.boot=setTimeout(()=>this.run('start'),15000);this.timer=setInterval(()=>this.run('stündlich'),HOUR);}
 async step(name,fn){this.set({phase:name,progress:null});try{this.status.results[name]=await fn();delete this.status.errors[name];}catch(e){this.status.errors[name]={message:e.message,at:Date.now(),log:e.log?String(e.log).slice(-1500):undefined};}}
 async run(reason='manuell'){
  if(this.status.running||!this.db)return;const c=this.config();this.set({running:true,reason});
  const now=Date.now(),backfillDays=c.backfillDays||180,from=now-backfillDays*DAY;
  try{
   if(c.source==='nightscout'&&c.url)await this.step('nightscout',()=>this.ns.syncNightscout({url:c.url,token:this.token(),store:this.db,now,backfillDays,onProgress:p=>this.set({progress:p})}));
   if(c.tandem?.enabled&&this.tandem.installed())await this.step('tandem',()=>this.syncPump(backfillDays));
   await this.step('lücken',async()=>this.detectGaps(from,now));
   if(c.garminConnect)await this.step('garmin',()=>this.garmin.sync({store:this.db,gc:this.gc,today:this.time.dayKey(now,this.tz()),addDays:this.time.addDays,dayStart:this.time.dayStart,tz:this.tz(),backfillDays,onProgress:p=>this.set({progress:p})}));
   await this.step('sicherung',()=>this.backup());
  }finally{this.cache.clear();this.refreshStats();this.set({running:false,phase:null,progress:null,lastRun:Date.now()});}
 }
 // Pumpendaten: tconnectsync für die Tage seit dem letzten Erfolg (beim ersten Mal ab Rückblick), 3 × 7 Tage pro Lauf.
 async syncPump(backfillDays){
  const credentials=this.tandemAuth();if(!credentials)throw Error('Kein Tandem-Zugang gespeichert.');
  const tz=this.tz(),today=this.time.dayKey(Date.now(),tz),st=this.db.state('tandem-sync');
  const runs=await this.tandem.planRuns({cursor:st.detail||null,today,backfillDays,addDays:this.time.addDays});const stored={};
  for(const r of runs){
   this.set({progress:{kind:'tandem',...r}});
   const res=await this.tandem.sync(r,{credentials,store:this.db});
   for(const [k,v] of Object.entries(res.stats.stored))stored[k]=(stored[k]||0)+v;
   this.db.setState('tandem-sync',{detail:r.end,last_ok:Date.now(),last_error:null});
  }
  return {runs:runs.length,until:runs.at(-1)?.end??st.detail,stored};
 }
 async checkTandem(){const credentials=this.tandemAuth();if(!credentials)throw Error('Kein Tandem-Zugang gespeichert.');return this.tandem.checkLogin({credentials,store:this.db});}
 async installTandem(){this.set({phase:'tconnectsync einrichten'});try{return await this.tandem.install(m=>this.set({progress:{kind:'install',message:m}}));}finally{this.set({phase:this.status.running?this.status.phase:null,progress:null});}}
 detectGaps(from,to){
  const list=this.gaps.detectGaps(this.db.glucoseTimes(from,to),{from,to,now:Date.now()});
  this.db.saveGaps(list);return {open:list.length};
 }
 backup(){
  const dir=path.join(this.dir,'backups'),today=this.time.dayKey(Date.now(),this.tz()),file=path.join(dir,`haze-${today}.db`);
  if(fs.existsSync(file))return {skipped:true};fs.mkdirSync(dir,{recursive:true});this.db.backup(file);
  for(const n of this.store.backupsToDelete(fs.readdirSync(dir).filter(n=>/^haze-\d{4}-\d\d-\d\d\.db$/.test(n)),today))fs.rmSync(path.join(dir,n),{force:true});
  this.status.lastBackup=Date.now();return {file:path.basename(file)};
 }
 async importClarity(file){
  const text=fs.readFileSync(file,'utf8');if(text.length>200e6)throw Error('Datei zu groß.');
  const r=this.clarity.parseClarity(text,this.tz());
  this.db.upsert('glucose',r.glucose);this.db.upsert('treatment',r.treatments);this.db.upsert('device_event',r.deviceEvents);
  const now=Date.now();this.detectGaps(now-(this.config().backfillDays||180)*DAY,now);this.cache.clear();this.refreshStats();this.changed();
  return {glucose:r.glucose.length,treatments:r.treatments.length,events:r.deviceEvents.length,from:r.from,to:r.to,skipped:r.skipped};
 }
 // kind 'longterm': Wochen, Monate, Trends über bis zu 365 Tage (führende Tage ohne Daten schneidet die Engine ab).
 analysis({days=14,to,kind='period',recent,day}={}){
  // kind 'forecast': Prognose-Experiment, lernt auf 28 Tagen und prüft auf den 7 Tagen danach.
  // kind 'forecast-live': TTM-Pfad ab dem letzten Messwert; recent = aktuelle Nightscout-Werte (nur in den Thread, nicht gespeichert).
  // kind 'body': Schlaf und Tag für einen Tag (YYYY-MM-DD, sonst der neueste); Tageswerte 200 Tage, Verläufe nur um den Tag.
  if(kind==='body'&&day!=null&&!/^\d{4}-\d\d-\d\d$/.test(day))throw Error('Ungültiger Tag');
  if(kind==='longterm')days=365;else if(kind==='forecast')days=36;else if(kind==='forecast-live')days=2;else if(kind==='body')days=200;else if(![7,14,30,90,180].includes(days))throw Error('Ungültiger Zeitraum');
  const demo=this.config().source==='demo',end=to??Date.now(),from=end-days*DAY,key=`${kind}:${demo}:${days}:${day||''}:${kind==='forecast-live'?recent?.at(-1)?.time:Math.floor(end/(5*60000))}`;
  if(this.cache.has(key))return this.cache.get(key);
  const job=new Promise((resolve,reject)=>{
   const w=new Worker(path.join(__dirname,'analysis-worker.mjs'),{workerData:{file:this.file,from,to:end,tz:this.tz(),demo,kind,day,recent:kind==='forecast-live'?(recent||[]).map(e=>({time:e.time,value:e.value})):undefined}});
   const t=setTimeout(()=>{w.terminate();reject(Error('Analyse dauert zu lange.'));},120000);
   w.once('message',m=>{clearTimeout(t);w.terminate();m.ok?resolve(m.result):reject(Error(m.error));});
   w.once('error',e=>{clearTimeout(t);reject(e);});
  });
  this.cache.set(key,job);job.catch(()=>this.cache.delete(key));return job;
 }
 close(){clearTimeout(this.boot);clearTimeout(this.pending);clearInterval(this.timer);const db=this.db;this.db=null;this.garmin.dispose();try{db?.close();}catch{}}
};
