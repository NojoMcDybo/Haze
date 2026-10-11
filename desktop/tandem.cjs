// tconnectsync sicher betreiben (docs/PLAN-TANDEM-SICHER.md):
// - Installation in einen eigenen venv im Haze-Datenordner, nur feste Versionen mit SHA-256 (--require-hashes).
// - Start ohne Shell, ohne .env (leerer Arbeitsordner), Zugangsdaten nur als Umgebung des Kindprozesses, kein Token-Cache.
// - tconnectsync spricht nur mit dem Haze-Empfänger (127.0.0.1, Einmal-Geheimnis), nie mit Nightscout.
// - Protokolle werden um alle geheimen Werte bereinigt.
const {spawn}=require('child_process');
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const VERSION='3.0.3';
let sinkLib,plan;
const libs=async()=>{sinkLib??=await import('../shared/sync/tandem-sink.mjs');plan??=await import('../shared/sync/tandem.mjs');};
function exec(cmd,args,{cwd,env,timeout=10*60000,secrets=[]}={}){
 return new Promise(resolve=>{
  let out='';const keep=b=>{out=(out+b).slice(-20000);};
  let child;try{child=spawn(cmd,args,{cwd,env,windowsHide:true,shell:false});}catch(e){resolve({code:-1,log:String(e.message)});return;}
  child.stdout.on('data',keep);child.stderr.on('data',keep);
  const timer=setTimeout(()=>{child.kill();keep('\n[Zeitlimit überschritten]');},timeout);
  child.on('error',e=>keep(`\n${e.message}`));
  child.on('close',code=>{clearTimeout(timer);resolve({code:code??-1,log:sinkLib?sinkLib.mask(out,secrets):out});});
 });
}
module.exports=class Tandem{
 constructor(dir){this.root=path.join(dir,'tconnectsync');this.venv=path.join(this.root,'venv');this.work=path.join(this.root,'work');this.exe=path.join(this.venv,'Scripts','tconnectsync.exe');this.marker=path.join(this.root,'installed.json');this.busy=false;}
 info(){try{return JSON.parse(fs.readFileSync(this.marker,'utf8'));}catch{return null;}}
 installed(){const i=this.info();return !!i&&i.version===VERSION&&fs.existsSync(this.exe);}
 // Python 3.10–3.13 suchen (Windows-Launcher zuerst). Für 3.14 gibt es noch nicht alle geprüften Pakete.
 async findPython(){
  for(const [cmd,args] of [['py',['-3.13']],['py',['-3.12']],['py',['-3.11']],['py',['-3.10']],['python',[]]]){
   const r=await exec(cmd,[...args,'-I','-c','import sys;print("%d.%d"%sys.version_info[:2])'],{timeout:20000});
   const v=r.code===0&&r.log.trim().match(/^3\.(1[0-3])$/m);if(v)return {cmd,args,version:`3.${v[1]}`};
  }
  return null;
 }
 async install(onLog=()=>{}){
  if(this.busy)throw Error('tconnectsync wird gerade verwendet.');this.busy=true;
  try{
   await libs();
   const py=await this.findPython();if(!py)throw Error('Python 3.10–3.13 nicht gefunden. Bitte von python.org installieren.');
   fs.rmSync(this.venv,{recursive:true,force:true});fs.mkdirSync(this.work,{recursive:true});
   // Sperrdatei aus dem App-Paket kopieren (Python kann nicht in app.asar lesen) und Prüfsumme festhalten.
   const req=fs.readFileSync(path.join(__dirname,'tconnectsync-requirements.txt'));const reqFile=path.join(this.root,'requirements.txt');fs.writeFileSync(reqFile,req);
   onLog(`Python ${py.version} gefunden, lege Umgebung an …`);
   let r=await exec(py.cmd,[...py.args,'-I','-m','venv',this.venv],{timeout:5*60000});if(r.code!==0)throw Object.assign(Error('Python-Umgebung konnte nicht angelegt werden.'),{log:r.log});
   onLog('Installiere tconnectsync mit geprüften Prüfsummen …');
   r=await exec(path.join(this.venv,'Scripts','python.exe'),['-I','-m','pip','install','--disable-pip-version-check','--no-cache-dir','--no-input','--require-hashes','--no-deps','--only-binary=:all:','-r',reqFile],{cwd:this.root,timeout:15*60000});
   if(r.code!==0)throw Object.assign(Error('Installation fehlgeschlagen (Prüfsumme oder Netzwerk).'),{log:r.log});
   r=await exec(this.exe,['--version'],{cwd:this.work,timeout:60000});
   if(r.code!==0||!r.log.includes(VERSION))throw Object.assign(Error('tconnectsync lässt sich nicht starten.'),{log:r.log});
   fs.writeFileSync(this.marker,JSON.stringify({version:VERSION,python:py.version,requirements:crypto.createHash('sha256').update(req).digest('hex'),installed:Date.now()},null,1));
   onLog(`tconnectsync ${VERSION} eingerichtet.`);
   return this.info();
  }finally{this.busy=false;}
 }
 // Ein Lauf: Empfänger starten, tconnectsync mit Umgebung starten, Empfänger schließen.
 async run(args,{credentials,store,timeout=10*60000}){
  if(!this.installed())throw Error('tconnectsync ist nicht eingerichtet.');
  if(!credentials?.email||!credentials?.password)throw Error('Kein Tandem-Zugang gespeichert.');
  if(this.busy)throw Error('tconnectsync läuft bereits.');this.busy=true;
  await libs();let sink;
  try{
   sink=await sinkLib.startSink({store});
   fs.mkdirSync(this.work,{recursive:true});
   const env=plan.childEnv(process.env,{...credentials,url:sink.url,secret:sink.secret});
   const r=await exec(this.exe,args,{cwd:this.work,env,timeout,secrets:[credentials.email,credentials.password,sink.secret]});
   // tconnectsync legt beim Prüfen eine (bereinigte) Logdatei im Arbeitsordner ab; Haze hebt sie nicht auf.
   fs.rmSync(path.join(this.work,'tconnectsync-check-output.log'),{force:true});
   return {...r,stats:sink.stats};
  }finally{await sink?.close();this.busy=false;}
 }
 async sync(range,opts){await libs();const r=await this.run(['--start-date',range.start,'--end-date',range.end,'--features',...plan.FEATURES],opts);if(r.code!==0)throw Object.assign(Error(`tconnectsync endete mit Code ${r.code}.`),{log:r.log});return r;}
 // Prüft Tandem-Anmeldung und Empfänger; tconnectsync meldet Fehler mit „API errors occurred“.
 async checkLogin(opts){const r=await this.run(['--check-login'],{...opts,timeout:3*60000});return {ok:r.code===0&&!/API errors occurred|invalid_credentials/i.test(r.log),code:r.code,log:r.log};}
 async planRuns(args){await libs();return plan.planTandem(args);}
};
module.exports.VERSION=VERSION;
