// Phase-0-Spike (docs/PLAN-DATENANALYSE.md): Klappt Garmin Connect über eine Chromium-Sitzung in Electron?
// Start: node_modules/electron/dist/electron.exe spikes/garmin-connect.cjs
// Anmeldung macht der Mensch im Fenster (inkl. MFA). Der Spike sieht kein Passwort und schreibt keine Header- oder Cookie-Werte.
// Rohdaten und Sitzung liegen AUSSERHALB des Repos (GARMIN_SPIKE_DIR, Standard D:\Dev\_spike-data\garmin).
const {app,BrowserWindow,session}=require('electron');
const fs=require('fs'),path=require('path');
const out=path.resolve(process.env.GARMIN_SPIKE_DIR||'D:/Dev/_spike-data/garmin');
fs.mkdirSync(path.join(out,'raw'),{recursive:true});
app.setPath('userData',path.join(out,'profile'));
const log=(...a)=>{const line=`[${new Date().toISOString()}] ${a.join(' ')}`;console.log(line);fs.appendFileSync(path.join(out,'spike.log'),line+'\n');};

const day=n=>{const d=new Date();d.setDate(d.getDate()-n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const today=day(0),yesterday=day(1);
// Pfade wie in python-garminconnect (mobile API); hier relativ zum Präfix, das die Web-App selbst benutzt.
const endpoints=dn=>[
 ['dailySummary',`usersummary-service/usersummary/daily/${dn}?calendarDate=${yesterday}`],
 ['sleep',`wellness-service/wellness/dailySleepData/${dn}?date=${today}&nonSleepBufferMinutes=60`],
 ['stress',`wellness-service/wellness/dailyStress/${yesterday}`],
 ['bodyBattery',`wellness-service/wellness/bodyBattery/reports/daily?startDate=${yesterday}&endDate=${yesterday}`],
 ['heartRate',`wellness-service/wellness/dailyHeartRate/${dn}?date=${yesterday}`],
 ['stepsChart',`wellness-service/wellness/dailySummaryChart/${dn}?date=${yesterday}`],
 ['intensityMinutes',`wellness-service/wellness/daily/im/${yesterday}`],
 ['respiration',`wellness-service/wellness/daily/respiration/${yesterday}`],
 ['spo2',`wellness-service/wellness/daily/spo2/${yesterday}`],
 ['hrv',`hrv-service/hrv/${today}`],
 ['trainingReadiness',`metrics-service/metrics/trainingreadiness/${today}`],
 ['trainingStatus',`metrics-service/metrics/trainingstatus/aggregated/${today}`],
 ['activities',`activitylist-service/activities/search/activities?startDate=${day(30)}&endDate=${today}&start=0&limit=20`],
 ['sleep180',`wellness-service/wellness/dailySleepData/${dn}?date=${day(180)}&nonSleepBufferMinutes=60`],
 ['dailySummary180',`usersummary-service/usersummary/daily/${dn}?calendarDate=${day(180)}`],
];

// Struktur statt Werte: Schlüssel, Typen, Arraylängen (Tiefe begrenzt).
function shape(v,depth=0){
 if(Array.isArray(v))return v.length?[`len ${v.length}`,depth<3?shape(v[0],depth+1):'…']:['len 0'];
 if(v&&typeof v==='object'){if(depth>=3)return `{${Object.keys(v).length} keys}`;return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,shape(x,depth+1)]));}
 return v===null?'null':typeof v;
}

const PART='persist:garmin-spike',seen=new Map(),api=[];let headers=null,prefix=null,started=false,scheduled=false,win;const prefixes=new Set(),loggedPaths=new Set();
const isApi=u=>/\/[a-z0-9-]+-service\//.test(u);

app.whenReady().then(()=>{
 const ses=session.fromPartition(PART);
 ses.webRequest.onSendHeaders({urls:['https://*.garmin.com/*']},d=>{if(isApi(d.url)||d.resourceType==='xhr'||d.resourceType==='fetch')seen.set(d.id,{url:d.url,headers:d.requestHeaders,api:isApi(d.url),resourceType:d.resourceType});});
 ses.webRequest.onCompleted({urls:['https://*.garmin.com/*']},d=>{
  const req=seen.get(d.id);seen.delete(d.id);if(!req)return;
  const u=new URL(req.url);api.push({path:u.origin+u.pathname.replace(/\/[^/]*\d{4}-\d\d-\d\d[^/]*$/,'/{date}'),query:[...u.searchParams.keys()],status:d.statusCode,headerNames:Object.keys(req.headers).filter(h=>!/^(cookie|user-agent|accept-language|sec-|referer|origin)/i.test(h))});
  // Pfade der Web-App protokollieren (ohne Query-Werte, Datumsangaben und Zahlen-IDs ersetzt).
  const shown=u.host+u.pathname.replace(/\d{4}-\d\d-\d\d/g,'{date}').replace(/\/\d{5,}/g,'/{id}');
  if(!loggedPaths.has(shown)&&loggedPaths.size<80){loggedPaths.add(shown);log('API',d.statusCode,req.resourceType||'',shown,[...u.searchParams.keys()].join(','));}
  if(d.statusCode===200&&req.api){
   const h=Object.fromEntries(Object.entries(req.headers).filter(([k])=>!/^(cookie|host|content-length|user-agent|sec-|accept-encoding|accept-language|referer|origin|baggage|sentry-trace)/i.test(k)));
   if(!headers||Object.keys(h).some(k=>/csrf|authorization/i.test(k)))headers=h;
   const pre=req.url.match(/^(https:\/\/[^?]+?\/)[a-z0-9-]+-service\//)?.[1];if(pre)prefixes.add(pre);
   if(!scheduled){scheduled=true;log('Angemeldet, sammle 10 s lang Aufrufe der Web-App …');setTimeout(run,10000);}
  }
 });
 win=new BrowserWindow({width:1100,height:850,title:'Haze – Garmin-Test: bitte bei Garmin anmelden',webPreferences:{partition:PART,contextIsolation:true,sandbox:true}});
 win.on('page-title-updated',e=>e.preventDefault());
 // Diagnose: Navigationen und Ladefehler nur als Host+Pfad (keine Query, keine Werte).
 const where=u=>{try{const x=new URL(u);return x.host+x.pathname;}catch{return '?';}};
 win.webContents.on('did-navigate',(e,u,code)=>{log('Navigation',code,where(u));
  // Auch ohne erkannten *-service-Aufruf: in der Web-App angekommen = angemeldet.
  if(/^connect\.garmin\.com\/app\//.test(where(u))&&!scheduled){scheduled=true;log('In der Web-App, sammle 12 s lang Aufrufe …');setTimeout(run,12000);}});
 win.webContents.on('did-navigate-in-page',(e,u)=>log('Seite',where(u)));
 win.webContents.on('did-fail-load',(e,code,desc,u)=>log('Ladefehler',code,desc,where(u)));
 win.once('ready-to-show',()=>{win.show();win.setAlwaysOnTop(true);win.focus();setTimeout(()=>win.setAlwaysOnTop(false),3000);});
 win.loadURL('https://connect.garmin.com/app/');
 log('Fenster offen. Warte auf Anmeldung (max. 25 min).');
 setTimeout(()=>{if(!started){log('Keine Anmeldung erkannt, Abbruch.');finish({loggedIn:false});}},25*60000);
});

// Abruf im Seitenkontext: Cookies und Browser-Fingerabdruck kommen von Chromium selbst.
async function pageFetch(url,extra){
 if(win.webContents.isLoading())await new Promise(r=>win.webContents.once('did-stop-loading',r));
 return win.webContents.executeJavaScript(`(async()=>{const t=performance.now();try{const r=await fetch(${JSON.stringify(url)},{credentials:'include',headers:${JSON.stringify(extra||{})}});const text=await r.text();return {status:r.status,type:r.headers.get('content-type'),ms:Math.round(performance.now()-t),text};}catch(e){return {status:0,error:String(e),ms:Math.round(performance.now()-t)};}})()`,true).catch(e=>({status:0,error:String(e)}));
}
const parse=t=>{try{return JSON.parse(t);}catch{return undefined;}};
const wait=ms=>new Promise(r=>setTimeout(r,ms));

async function run(){
 if(started)return;started=true;
 const report={date:new Date().toISOString(),prefix,headerNames:Object.keys(headers||{}),results:[],checks:{}};
 // Präfix finden: beobachtete Präfixe der Web-App + bekannte Kandidaten; gültig ist, was JSON mit displayName liefert.
 const candidates=[...prefixes,'https://connect.garmin.com/gc-api/','https://connect.garmin.com/modern/proxy/','https://connect.garmin.com/proxy/'].filter((v,i,a)=>a.indexOf(v)===i);
 let base=null,dn=null,plain=null;
 for(const c of candidates){
  for(const [mode,h] of [['cookies',{}],['appHeaders',headers||{}]]){
   const r=await pageFetch(c+'userprofile-service/socialProfile',h),j=parse(r.text);
   log('Probe',c,mode,r.status,(r.type||'').split(';')[0],j?.displayName?'displayName ok':'kein displayName');
   report.checks[`probe ${c} ${mode}`]=r.status+' '+(r.type||'').split(';')[0];
   if(j?.displayName){base=c;dn=j.displayName;plain=mode==='cookies'?r:{status:0};break;}
  }
  if(base)break;
 }
 report.prefix=base;report.checks.displayName=dn?'gefunden':'fehlt';
 if(!dn){log('Kein funktionierendes Präfix gefunden.');return finish({loggedIn:true,...report});}
 log('Präfix:',base,'· Header nötig:',plain.status===200?'nein':'ja');
 const useHeaders=plain.status===200?{}:headers;
 // 2) Abruf aus dem Hauptprozess (ohne sichtbare Seite) über die Chromium-Sitzung?
 try{const r=await session.fromPartition(PART).fetch(base+'userprofile-service/socialProfile',{headers:useHeaders});report.checks.mainProcessFetch=r.status;}catch(e){report.checks.mainProcessFetch='Fehler: '+e.message;}
 // 3) Die eigentlichen Datenquellen, gedrosselt
 for(const [name,rel] of endpoints(dn)){
  const r=await pageFetch(base+rel,useHeaders),json=parse(r.text);
  report.results.push({name,path:rel.replaceAll(dn,'{displayName}'),status:r.status,ms:r.ms,type:r.type,error:r.error,shape:json===undefined?undefined:shape(json)});
  if(json!==undefined)fs.writeFileSync(path.join(out,'raw',`${name}.json`),JSON.stringify(json,null,1));
  log(name.padEnd(18),r.status,`${r.ms} ms`);
  await wait(1200);
 }
 // 4) Nachholen testen: 7 Nächte Schlaf hintereinander (Tempo, 429?)
 const t0=Date.now(),statuses=[];
 for(let i=1;i<=7;i++){const r=await pageFetch(base+`wellness-service/wellness/dailySleepData/${dn}?date=${day(i)}&nonSleepBufferMinutes=60`,useHeaders);statuses.push(r.status);await wait(1200);}
 report.checks.backfill7Nights={statuses,seconds:Math.round((Date.now()-t0)/1000)};
 // 5) Details der letzten Aktivität (Puls-Zeitreihe)
 const acts=parse(fs.existsSync(path.join(out,'raw','activities.json'))?fs.readFileSync(path.join(out,'raw','activities.json'),'utf8'):'null');
 if(Array.isArray(acts)&&acts[0]?.activityId){
  const r=await pageFetch(base+`activity-service/activity/${acts[0].activityId}/details?maxChartSize=2000&maxPolylineSize=0`,useHeaders),json=parse(r.text);
  report.results.push({name:'activityDetails',path:'activity-service/activity/{id}/details',status:r.status,ms:r.ms,shape:json===undefined?undefined:shape(json)});
  if(json!==undefined)fs.writeFileSync(path.join(out,'raw','activityDetails.json'),JSON.stringify(json,null,1));
 }
 finish({loggedIn:true,...report});
}

function finish(report){
 report.observedApiCalls=api.slice(0,80);
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,1));
 log('Fertig. Bericht:',path.join(out,'report.json'));
 setTimeout(()=>app.quit(),1500);
}
app.on('window-all-closed',()=>{if(!started)log('Fenster geschlossen, bevor die Anmeldung erkannt wurde.');app.quit();});
