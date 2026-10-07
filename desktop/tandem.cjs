// tconnectsync für einen Datumsbereich starten (Tandem Source → lokales Nightscout). Haze kennt keine Tandem-Zugangsdaten:
// tconnectsync liest sie aus seiner eigenen .env im Arbeitsordner. Kein Shell-Aufruf, feste Argumente, Zeitlimit.
const {spawn}=require('child_process');
const fs=require('fs'),path=require('path');
const DATE=/^\d{4}-\d\d-\d\d$/;
function check(cfg){
 if(!cfg?.enabled)throw Error('tconnectsync ist nicht eingerichtet.');
 if(!cfg.command)throw Error('Pfad zu tconnectsync fehlt.');
 if(!cfg.cwd||!fs.existsSync(path.join(cfg.cwd,'.env')))throw Error('Im tconnectsync-Ordner fehlt die .env mit den Tandem-Zugangsdaten.');
}
function run(cfg,args,timeout=10*60000){
 check(cfg);
 return new Promise((resolve,reject)=>{
  const child=spawn(cfg.command,[...(cfg.args||[]),...args],{cwd:cfg.cwd,windowsHide:true,shell:false,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
  let out='';const keep=b=>{out=(out+b).slice(-4000);};
  child.stdout.on('data',keep);child.stderr.on('data',keep);
  const timer=setTimeout(()=>{child.kill();reject(Object.assign(Error('tconnectsync hat das Zeitlimit überschritten.'),{log:out}));},timeout);
  child.on('error',e=>{clearTimeout(timer);reject(Object.assign(Error(`tconnectsync startet nicht: ${e.message}`),{log:out}));});
  // Protokoll nur gekürzt zurückgeben; Zugangsdaten stehen nicht darin, sicherheitshalber wird alles nach '=' in Zeilen mit PASS/SECRET entfernt.
  child.on('close',code=>{clearTimeout(timer);const log=out.replace(/^.*(PASS|SECRET|TOKEN).*$/gim,'[entfernt]');code===0?resolve({code,log}):reject(Object.assign(Error(`tconnectsync endete mit Code ${code}.`),{log}));});
 });
}
// Lücken nachholen: nur CGM-Werte, die die Pumpe empfangen hat (Feature CGM, laut tconnectsync/features.py).
exports.backfill=(cfg,{start,end})=>{if(!DATE.test(start)||!DATE.test(end))throw Error('Ungültiger Zeitraum');return run(cfg,['--start-date',start,'--end-date',end,'--features',...(cfg.gapFeatures||['CGM'])]);};
// Regulärer Abgleich eines Zeitraums mit den Standard-Features (+ CGM-Alarme).
exports.sync=(cfg,{start,end,features})=>{if(!DATE.test(start)||!DATE.test(end))throw Error('Ungültiger Zeitraum');return run(cfg,['--start-date',start,'--end-date',end,'--features',...features]);};
exports.checkLogin=cfg=>run(cfg,['--check-login'],2*60000);
exports.defaults={enabled:false,command:'',args:[],cwd:'',gapFeatures:['CGM']};
