// Garmin Connect über eine eigene Chromium-Sitzung (Partition persist:garmin). Anmeldung macht der Mensch selbst im
// Fenster (inkl. MFA); Haze sieht kein Passwort. Abrufe laufen im Seitenkontext eines versteckten Fensters, damit
// Cookies, Header der Web-App und der Browser-Fingerabdruck von Chromium selbst kommen.
// Geprüft am 7. Oktober 2026 (spikes/garmin-connect.cjs): Die Web-App läuft unter /app/, die Daten-API unter
// /gc-api/ und verlangt die Header der Web-App (u. a. Connect-Csrf-Token). Abruf aus dem Hauptprozess wird mit 403
// abgelehnt, im Seitenkontext klappt er; die Sitzung bleibt über Neustarts erhalten.
const {BrowserWindow,session}=require('electron');
const PART='persist:garmin',HOME='https://connect.garmin.com/app/',PREFIXES=['https://connect.garmin.com/gc-api/','https://connect.garmin.com/modern/proxy/'];
const IN_APP=/^https:\/\/connect\.garmin\.com\/app\//;
const isApi=u=>/\/[a-z0-9-]+-service\//.test(u);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=class GarminConnect{
 constructor(changed=()=>{}){this.changed=changed;this.state={loggedIn:false,checking:false,error:null,displayName:null};this.headers=null;this.prefix=null;this.win=null;this.watching=false;this.seen=new Set();this.arrived=0;}
 watch(){
  if(this.watching)return;this.watching=true;const ses=session.fromPartition(PART),seen=new Map();
  ses.webRequest.onSendHeaders({urls:['https://*.garmin.com/*']},d=>{if(isApi(d.url))seen.set(d.id,{url:d.url,headers:d.requestHeaders});});
  ses.webRequest.onCompleted({urls:['https://*.garmin.com/*']},d=>{const r=seen.get(d.id);seen.delete(d.id);if(!r||d.statusCode!==200)return;
   // Nur im Speicher: Header der Web-App (z. B. Autorisierung), nie auf die Platte.
   this.headers=Object.fromEntries(Object.entries(r.headers).filter(([k])=>!/^(cookie|host|content-length|user-agent|sec-|accept-encoding|accept-language|referer|origin)/i.test(k)));
   // Präfix-Kandidat merken; ob er stimmt, klärt probe().
   const pre=r.url.match(/^(https:\/\/[^?]+?\/)[a-z0-9-]+-service\//)?.[1];if(pre)this.seen.add(pre);});
 }
 window(show){
  this.watch();
  if(!this.win||this.win.isDestroyed()){
   this.win=new BrowserWindow({width:1000,height:820,show,title:'Haze · Bei Garmin anmelden',autoHideMenuBar:true,webPreferences:{partition:PART,contextIsolation:true,sandbox:true,nodeIntegration:false}});
   this.win.on('page-title-updated',e=>e.preventDefault());
   this.win.webContents.setWindowOpenHandler(({url})=>/^https:\/\/([a-z0-9-]+\.)*garmin\.com\//.test(url)?{action:'allow'}:{action:'deny'});
   this.win.on('close',e=>{if(this.win.isVisible()&&!this.quitting){e.preventDefault();this.win.hide();}});
   // In der Web-App angekommen (nicht auf der Anmeldeseite) = vermutlich angemeldet.
   this.win.webContents.on('did-navigate',(e,u)=>{if(IN_APP.test(u))this.arrived=Date.now();});
   this.win.webContents.on('did-navigate-in-page',(e,u)=>{if(IN_APP.test(u)&&!this.arrived)this.arrived=Date.now();});
   this.win.loadURL(HOME);
  }else if(show){this.win.show();this.win.focus();}
  return this.win;
 }
 openLogin(){this.window(true);}
 // Versteckt laden und warten, bis die Web-App einen API-Aufruf erfolgreich macht (= angemeldet).
 async ready(timeout=45000){
  if(this.state.loggedIn&&this.prefix&&this.headers)return true;
  this.state.checking=true;this.changed();this.window(false);
  // Warten, bis die Web-App geladen ist und eigene API-Aufrufe (mit Headern) gemacht hat, dann Präfix prüfen.
  const end=Date.now()+timeout;
  while(Date.now()<end&&!(this.arrived&&this.headers&&Date.now()-this.arrived>4000))await wait(500);
  if(this.arrived&&this.headers)await this.probe();
  this.state.checking=false;this.state.loggedIn=!!this.prefix;this.state.error=this.prefix?null:'Nicht bei Garmin angemeldet.';this.changed();
  return this.state.loggedIn;
 }
 async probe(){
  for(const c of [...this.seen,...PREFIXES].filter((v,i,a)=>a.indexOf(v)===i)){
   this.prefix=c;try{const p=await this.fetchJson('userprofile-service/socialProfile',false);if(p?.displayName){this.state.displayName=p.displayName;return true;}}catch{}
  }
  this.prefix=null;return false;
 }
 async fetchJson(rel,strict=true){
  const w=this.window(false);if(w.webContents.isLoading())await new Promise(r=>w.webContents.once('did-stop-loading',r));
  const url=(this.prefix||'https://connect.garmin.com/gc-api/')+rel;
  const r=await w.webContents.executeJavaScript(`(async()=>{try{const r=await fetch(${JSON.stringify(url)},{credentials:'include',headers:${JSON.stringify(this.headers||{})}});return {status:r.status,text:await r.text()};}catch(e){return {status:0,text:String(e)};}})()`,true);
  if(r.status===401||r.status===403){if(strict){this.state.loggedIn=false;this.headers=null;this.prefix=null;this.arrived=0;this.changed();}throw Object.assign(Error('Garmin-Anmeldung abgelaufen.'),{kind:'auth'});}
  if(r.status===429)throw Object.assign(Error('Garmin bremst Abrufe (429). Später erneut.'),{kind:'rate'});
  if(r.status===204)return null;
  if(r.status!==200)throw Object.assign(Error(`Garmin antwortet mit HTTP ${r.status}.`),{kind:'server'});
  try{return JSON.parse(r.text);}catch{if(strict)throw Object.assign(Error('Garmin liefert kein JSON (Präfix?).'),{kind:'server'});return null;}
 }
 async sync({store,gc,today,addDays,dayStart,tz,backfillDays=180,budget=30,spacing=1000,onProgress=()=>{}}){
  if(!await this.ready())throw Object.assign(Error('Nicht bei Garmin angemeldet.'),{kind:'auth'});
  if(!this.state.displayName)throw Error('Garmin-Profil nicht lesbar.');
  const dn=this.state.displayName,overlap=3;
  // Fertig = Tagesdaten wurden nach Ablauf der Überlappung abgerufen (Garmin rechnet Schlaf/Body Battery nach).
  const done=new Set(store.rawKeys('garmin','daily').filter(r=>r.fetched>=dayStart(addDays(r.key,overlap+1),tz)).map(r=>r.key));
  const days=gc.planDays({today,done,backfillDays,overlap,budget,addDays});let n=0;
  for(const d of days){
   const raw={};
   for(const [kind,path] of Object.entries(gc.ENDPOINTS)){try{raw[kind]=await this.fetchJson(path(dn,d));if(raw[kind]!=null)store.putRaw('garmin',kind,d,raw[kind]);}catch(e){if(e.kind==='auth'||e.kind==='rate')throw e;}await wait(spacing);}
   const rows=gc.normalizeDay(d,raw);
   store.upsert('daily',rows.daily);store.upsert('sleep',rows.sleep);store.upsert('sleep_stage',rows.stages);store.upsert('series',rows.series);store.upsert('hr',rows.hr);
   onProgress({day:d,done:++n,total:days.length});
  }
  // Aktivitäten: seitenweise für den gesamten Rückblick beim ersten Mal, danach die letzten 14 Tage.
  const first=!store.state('garmin-activities').last_ok,from=addDays(today,first?-backfillDays:-14);
  for(let start=0;start<2000;start+=100){const list=await this.fetchJson(gc.activitiesPath(from,today,start));const rows=gc.activities(list);store.upsert('activity',rows);if(!Array.isArray(list)||list.length<100)break;await wait(spacing);}
  store.setState('garmin-activities',{last_ok:Date.now(),last_error:null});
  return {days:n};
 }
 async logout(){this.state={loggedIn:false,checking:false,error:null,displayName:null};this.headers=null;this.prefix=null;this.arrived=0;this.seen.clear();if(this.win&&!this.win.isDestroyed()){this.quitting=true;this.win.destroy();this.quitting=false;}this.win=null;await session.fromPartition(PART).clearStorageData();this.changed();}
 dispose(){this.quitting=true;if(this.win&&!this.win.isDestroyed())this.win.destroy();}
};
