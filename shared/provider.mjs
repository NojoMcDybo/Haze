import {normalize,demo} from './model.mjs';
export async function nightscout(url,token='',fetcher=fetch){
 let base;try{base=new URL(url);if(base.username||base.password||base.search||base.hash)throw Error();if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(base.hostname)))throw Error();}catch{throw Object.assign(Error('Bitte HTTPS verwenden; HTTP ist nur für localhost erlaubt.'),{kind:'address'});}
 const endpoint=new URL(base.toString().replace(/\/$/,'')+'/api/v1/entries/sgv.json');endpoint.searchParams.set('count','600');
 const headers={Accept:'application/json'};if(token)endpoint.searchParams.set('token',token);
 let r;try{r=await fetcher(endpoint,{headers,signal:AbortSignal.timeout(12000),redirect:'error',cache:'no-store'});}catch{throw Object.assign(Error('Nightscout nicht erreichbar. Adresse, Netzwerk und laufenden Server prüfen.'),{kind:'network'});}
 if([401,403].includes(r.status))throw Object.assign(Error('Zugang abgelehnt. Lesetoken und Rechte prüfen.'),{kind:'auth'});
 if(!r.ok)throw Object.assign(Error(`Nightscout antwortet mit HTTP ${r.status}.`),{kind:'server'});
 let data;try{data=await r.json();}catch{throw Object.assign(Error('Nightscout liefert keine gültigen JSON-Daten.'),{kind:'data'});}
 return normalize(data);
}
export const demoProvider=()=>({entries:demo(),future:0,rejected:0});
