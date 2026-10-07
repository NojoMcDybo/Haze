// Datenhaltung und Hintergrund-Synchronisierung: haze.db, Nightscout-Historie, Lücken (Tandem/Clarity), Garmin, Sicherung.
// Läuft beim Start (verzögert), stündlich und nach Standby. Fehler einer Quelle stoppen die anderen nicht.
const fs=require('fs'),path=require('path');
const {Worker}=require('worker_threads');
const tandem=require('./tandem.cjs');
const GarminConnect=require('./garmin-connect.cjs');
const DAY=86400000,HOUR=3600000;
module.exports=class DataService{
 constructor({dir,config,token,changed}){this.dir=dir;this.file=path.join(dir,'haze.db');this.config=config;this.token=token;this.changed=changed;
  this.status={running:false,phase:null,progress:null,lastRun:null,errors:{},results:{},gaps:[],stats:null,lastBackup:null};
  this.garmin=new GarminConnect(()=>changed());this.cache=new Map();}
 async init(){
  [this.store,this.ns,this.gaps,this.gc,this.time,this.clarity,this.tplan]=await Promise.all(['../shared/store.mjs','../shared/sync/nightscout.mjs','../shared/sync/gaps.mjs','../shared/sync/garmin-connect.mjs','../shared/analysis/time.mjs','../shared/sync/clarity.mjs','../shared/sync/tandem.mjs'].map(m=>import(m)));
  this.db=this.store.openStore(this.file);this.refreshStats();
 }
 tz(){return this.time.defaultZone();}
 refreshStats(){try{this.status.stats=this.db.stats();this.status.gaps=this.db.gaps().slice(-20).reverse();}catch{}}
 publicStatus(){const c=this.config(),t=c.tandem||{};return {...this.status,tandem:{enabled:!!t.enabled,configured:!!(t.command&&t.cwd)},garmin:{...this.garmin.state,enabled:!!c.garminConnect}};}
 // Fortschritt höchstens zweimal pro Sekunde melden (jede Meldung erreicht Dashboard, Webansicht und Notch).
 set(patch){Object.assign(this.status,patch);const now=Date.now();if(now-(this.emitted||0)>=500){this.emitted=now;this.changed();}else if(!this.pending)this.pending=setTimeout(()=>{this.pending=null;this.emitted=Date.now();this.changed();},500);}
 start(){this.boot=setTimeout(()=>this.run('start'),15000);this.timer=setInterval(()=>this.run('stündlich'),HOUR);}
 async step(name,fn){this.set({phase:name,progress:null});try{this.status.results[name]=await fn();delete this.status.errors[name];}catch(e){this.status.errors[name]={message:e.message,at:Date.now(),log:e.log?String(e.log).slice(-1500):undefined};}}
 async run(reason='manuell'){
  if(this.status.running||!this.db)return;const c=this.config();this.set({running:true,reason});
  const now=Date.now(),backfillDays=c.backfillDays||180,from=now-backfillDays*DAY;
  try{
   if(c.source==='nightscout'&&c.url)await this.step('nightscout',()=>this.ns.syncNightscout({url:c.url,token:this.token(),store:this.db,now,backfillDays,onProgress:p=>this.set({progress:p})}));
   await this.step('lücken',async()=>this.detectGaps(from,now));
   if(c.tandem?.enabled){await this.step('tandem',()=>this.syncPump(c,backfillDays));await this.step('lücken',async()=>this.detectGaps(from,now));await this.step('tandem-lücken',()=>this.fillGaps(c));}
   if(c.garminConnect)await this.step('garmin',()=>this.garmin.sync({store:this.db,gc:this.gc,today:this.time.dayKey(now,this.tz()),addDays:this.time.addDays,dayStart:this.time.dayStart,tz:this.tz(),backfillDays,onProgress:p=>this.set({progress:p})}));
   await this.step('sicherung',()=>this.backup());
  }finally{this.cache.clear();this.refreshStats();this.set({running:false,phase:null,progress:null,lastRun:Date.now()});}
 }
 detectGaps(from,to){
  const list=this.gaps.detectGaps(this.db.glucoseTimes(from,to),{from,to,tz:this.tz(),tried:this.tried(),now:Date.now()});
  this.db.saveGaps(list);return {open:list.filter(g=>g.status!=='nicht verfügbar').length,unavailable:list.filter(g=>g.status==='nicht verfügbar').length};
 }
 // Pumpendaten regulär: tconnectsync für die Tage seit dem letzten Erfolg, danach Nightscout dort neu einlesen.
 async syncPump(c,backfillDays){
  const tz=this.tz(),today=this.time.dayKey(Date.now(),tz),st=this.db.state('tandem-sync');
  const runs=this.tplan.planTandem({cursor:st.detail||null,today,backfillDays,addDays:this.time.addDays});
  for(const r of runs){
   this.set({progress:{kind:'tandem',...r}});
   await tandem.sync(c.tandem,{...r,features:this.tplan.FEATURES});
   await this.ns.syncNightscout({url:c.url,token:this.token(),store:this.db,from:this.time.dayStart(r.start,tz)-HOUR,to:this.time.dayStart(this.time.addDays(r.end,1),tz)+HOUR});
   this.db.setState('tandem-sync',{detail:r.end,last_ok:Date.now(),last_error:null});
  }
  return {runs:runs.length,until:runs.at(-1)?.end??st.detail};
 }
 tried(){try{return JSON.parse(this.db.state('tandem').detail||'{}');}catch{return {};}}
 // Lücken über Tandem Source schließen: tconnectsync für die betroffenen Tage, danach Nightscout dort neu einlesen.
 async fillGaps(c){
  const tz=this.tz(),runs=this.gaps.planBackfill(this.db.gaps(),{tz,tried:this.tried()});if(!runs.length)return {runs:0};
  for(const r of runs){
   this.set({progress:{kind:'tandem',...r}});
   // Versuch zählen, auch wenn tconnectsync scheitert; Einträge älter als 400 Tage verwerfen.
   try{await tandem.backfill(c.tandem,r);}finally{const old=this.time.dayKey(Date.now()-400*DAY,tz),t=Object.fromEntries(Object.entries(this.gaps.markTried(this.tried(),[r])).filter(([d])=>d>=old));this.db.setState('tandem',{detail:t,last_ok:Date.now()});}
   await this.ns.syncNightscout({url:c.url,token:this.token(),store:this.db,from:this.time.dayStart(r.start,tz)-HOUR,to:this.time.dayStart(this.time.addDays(r.end,1),tz)+HOUR});
  }
  const now=Date.now();this.detectGaps(now-(c.backfillDays||180)*DAY,now);return {runs:runs.length};
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
 analysis({days=14,to}={}){
  if(![7,14,30,90,180].includes(days))throw Error('Ungültiger Zeitraum');
  const demo=this.config().source==='demo',end=to??Date.now(),from=end-days*DAY,key=`${demo}:${days}:${Math.floor(end/(5*60000))}`;
  if(this.cache.has(key))return this.cache.get(key);
  const job=new Promise((resolve,reject)=>{
   const w=new Worker(path.join(__dirname,'analysis-worker.mjs'),{workerData:{file:this.file,from,to:end,tz:this.tz(),demo}});
   const t=setTimeout(()=>{w.terminate();reject(Error('Analyse dauert zu lange.'));},120000);
   w.once('message',m=>{clearTimeout(t);w.terminate();m.ok?resolve(m.result):reject(Error(m.error));});
   w.once('error',e=>{clearTimeout(t);reject(e);});
  });
  this.cache.set(key,job);job.catch(()=>this.cache.delete(key));return job;
 }
 checkTandem(){return tandem.checkLogin(this.config().tandem);}
 close(){clearTimeout(this.boot);clearTimeout(this.pending);clearInterval(this.timer);this.garmin.dispose();try{this.db?.close();}catch{}}
};
