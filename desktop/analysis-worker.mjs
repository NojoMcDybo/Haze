// Analyse im eigenen Thread, damit Dashboard, Widget und Notch flüssig bleiben.
// Liest haze.db selbst (WAL erlaubt parallele Leser) oder erzeugt im Demo-Modus künstliche Daten.
import {parentPort,workerData} from 'node:worker_threads';
import {analyze} from '../shared/analysis/index.mjs';
import {synthetic} from '../shared/analysis/synthetic.mjs';
import {openStore} from '../shared/store.mjs';
const {file,from,to,tz,demo}=workerData;
try{
 let data;
 if(demo)data=synthetic({days:Math.ceil((to-from)/86400000)+2,end:to,tz});
 else{const s=openStore(file);try{data=s.load(from,to);}finally{s.close();}}
 parentPort.postMessage({ok:true,result:analyze(data,{from,to,tz})});
}catch(e){parentPort.postMessage({ok:false,error:e.message});}
