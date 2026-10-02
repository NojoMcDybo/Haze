'use strict';
// Updates aus den GitHub-Releases (electron-updater, latest.yml). Nichts passiert ungefragt:
// automatisch wird nur geprüft (15 s nach dem Start, dann alle 6 h); Laden und Installieren
// erst nach Klick. Die Datei wird gegen die SHA-512-Summe aus latest.yml geprüft.
const FIRST_CHECK=15000,INTERVAL=6*3600000;
function createUpdater({updater,version,packaged=true,onChange=()=>{},beforeInstall=()=>{},timers={setTimeout,setInterval}}){
 const st={configured:packaged,status:packaged?'idle':'dev',version:null,percent:null,message:packaged?'Noch nicht geprüft.':'Updates gibt es nur in der installierten App.'};
 const set=(patch)=>{Object.assign(st,patch);onChange({...st});};
 if(packaged){updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowPrerelease=false;updater.allowDowngrade=false;
  updater.on('checking-for-update',()=>set({status:'checking',message:'Suche nach Updates …'}));
  updater.on('update-available',i=>set({status:'available',version:i.version,message:`Haze ${i.version} ist verfügbar (installiert: ${version}).`}));
  updater.on('update-not-available',()=>set({status:'none',version:null,message:`Haze ${version} ist aktuell.`}));
  updater.on('download-progress',p=>set({status:'downloading',percent:Math.round(p.percent||0),message:`Lade Haze ${st.version} … ${Math.round(p.percent||0)} %`}));
  updater.on('update-downloaded',()=>{set({status:'installing',percent:100,message:`Installiere Haze ${st.version} – Haze startet danach neu.`});beforeInstall();updater.quitAndInstall(true,true);});
  updater.on('error',e=>{const busy=['downloading','installing'].includes(st.status);set({status:busy?'available':'error',percent:null,message:(busy?'Update fehlgeschlagen: ':'Update-Prüfung fehlgeschlagen: ')+String(e?.message||e).split('\n')[0].slice(0,160)});});}
 async function check(){if(!packaged||['checking','downloading','installing'].includes(st.status))return {...st};try{await updater.checkForUpdates();}catch{/* kommt auch als 'error' */}return {...st};}
 async function install(){if(st.status!=='available')return {...st,error:'Kein Update zum Installieren.'};set({status:'downloading',percent:0,message:`Lade Haze ${st.version} …`});try{await updater.downloadUpdate();}catch{/* kommt auch als 'error' */}return {...st};}
 function start(){if(!packaged)return;timers.setTimeout(check,FIRST_CHECK);timers.setInterval(check,INTERVAL);}
 return {state:()=>({...st}),check,install,start};}
module.exports={createUpdater};
