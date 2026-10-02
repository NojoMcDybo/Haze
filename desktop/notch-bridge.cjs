const http=require('http');
// Pushes the current reading plus the last 24 h to the local Notch app (http://127.0.0.1:47800).
// Loopback only, no proxy. If Notch is not running nothing happens.
// Contract (Notch README, "Verlaufs-Activities"): value, trend (up2|up|up45|flat|down45|down|down2),
// delta to the previous reading, chart {low,high,points:[[ms,value]],ranges,range}, pid.
// ttl 900 s + re-send every minute: if Haze crashes, the Notch greys the value out and finally shows
// "keine Daten" (it does not just vanish). Staleness is judged by the Notch from the last point's time.
// Alarm logic stays here and in the sensor: the Notch only shows `alert`.
// Double-click on the graph in the Notch -> event "open" in GET /events -> listen() calls onOpen.
const ID='haze:bg',OLD_ID='haze-bz',HOST='127.0.0.1',PORT=47800,TTL=900,REFRESH=60000,DAY=86400000;
const colors={high:'#EDBC56',low:'#FF7971',normal:'#E8EFEF',stale:'#8E9A9B'};
const directions={DoubleUp:'up2',SingleUp:'up',FortyFiveUp:'up45',Flat:'flat',FortyFiveDown:'down45',SingleDown:'down',DoubleDown:'down2'};
function icon(color){return 'data:image/svg+xml;base64,'+Buffer.from(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M12 2.5c3.2 4.3 6.5 8.2 6.5 12a6.5 6.5 0 0 1-13 0c0-3.8 3.3-7.7 6.5-12z' fill='${color}'/></svg>`).toString('base64');}
// Sensor trend if present; otherwise Dexcom style from the rate over the last ~15 min (1/2/3 mg/dL per minute).
function trend(entries){
 const last=entries.at(-1);if(!last)return null;if(directions[last.trend])return directions[last.trend];
 const ref=[...entries].reverse().find(e=>last.time-e.time>=10*60000&&last.time-e.time<=20*60000)||entries.at(-2);
 if(!ref||ref===last)return null;const minutes=(last.time-ref.time)/60000;if(minutes<=0||minutes>20)return null;
 const rate=(last.value-ref.value)/minutes,a=Math.abs(rate),s=rate>0?'up':'down';
 return a<1?'flat':a<2?s+'45':a<3?s:s+'2';
}
// Pure: feed + settings -> Notch activity (without the alert flag), or null when nothing is to show.
function activity(model,feed,config,now=Date.now(),open){
 const entries=feed.entries||[],f=model.freshness(entries,now,config.staleMinutes);if(!f.last)return null;
 const v=f.last.value,stale=f.stale,category=model.category(v),level=category==='high'?1:category==='low'?-1:0;
 const mmol=config.unit==='mmol/L',k=mmol?1/18:1,round=x=>mmol?Math.round(x*k*10)/10:Math.round(x);
 const age=`vor ${f.minutes} Min.`,arrow=stale?'':(model.arrows[f.last.trend]||''),change=stale?null:model.widgetDelta(entries,config.unit,now,config.staleMinutes);
 const text=[arrow,change?.text||''].filter(Boolean).join(' '),offline=feed.error?' · offline':'';
 const color=stale?colors.stale:colors[category];
 const a={id:ID,app:'Haze',title:config.source==='demo'?'Blutzucker (Demo)':'Blutzucker',subtitle:(stale?'Messung veraltet · '+age:(text?text+' · ':'')+age)+offline,
  value:mmol?model.format(v,config.unit):Math.round(v),unit:config.unit,color,icon:icon(color),priority:10,ttl:TTL,pid:process.pid,
  chart:{low:mmol?3.9:70,high:mmol?10:180,points:entries.filter(e=>e.time>=f.last.time-DAY).map(e=>[e.time,round(e.value)]),ranges:[3,6,12,24],range:3}};
 if(!stale){const t=trend(entries);if(t)a.trend=t;const p=entries.at(-2);if(p&&(f.last.time-p.time)<=20*60000&&f.last.time>p.time)a.delta=round(v-p.value);}
 if(open)a.open=open;
 return {activity:a,level,stale};
}
class NotchBridge {
 constructor({model,request=http.request,open,setInterval:si=setInterval,clearInterval:ci=clearInterval,setTimeout:st=setTimeout,clearTimeout:ct=clearTimeout}){Object.assign(this,{model,request,open,si,ci,st,ct});this.last=null;this.lastLevel=0;this.refresh=null;this.poll=null;this.seen=-1;this.cleaned=false;}
 get active(){return this.last!==null;}
 update(feed,config,now=Date.now()){
  if(config.notch===false){if(this.active)this.remove();return;}
  const r=activity(this.model,feed,config,now,this.open);if(!r){if(this.active)this.remove();return;}
  // older Haze versions used another id: take that entry down once
  if(!this.cleaned){this.cleaned=true;this.send('DELETE','/activity/'+OLD_ID);}
  // Alert once when the reading enters a different out-of-range band (as in the Widget Lab).
  const alert=!r.stale&&r.level!==0&&r.level!==this.lastLevel;if(!r.stale)this.lastLevel=r.level;
  const json=JSON.stringify(r.activity);if(json===this.last&&!alert)return;this.last=json;
  this.send('POST','/activity',{...r.activity,alert});
  if(!this.refresh)this.refresh=this.si(()=>{if(this.last)this.send('POST','/activity',{...JSON.parse(this.last),alert:false});},REFRESH);
 }
 remove(){this.stop();if(this.refresh){this.ci(this.refresh);this.refresh=null;}const was=this.active;this.last=null;this.lastLevel=0;return was?this.send('DELETE','/activity/'+ID):Promise.resolve(false);}
 // Polls GET /events every 200 ms (2 s while the Notch is not reachable). Always reads the whole small
 // queue (max. 100) so a restarted Notch (sequence starts at 1 again) is noticed: then only the baseline is reset.
 listen(onOpen){
  if(this.poll)return;this.onOpen=onOpen;
  const tick=()=>this.get('/events?after=0').then(list=>{
   if(!Array.isArray(list))return 2000;
   const max=list.reduce((m,e)=>Math.max(m,Number(e.seq)||0),0);
   if(this.seen<0||max<this.seen){this.seen=max;return 200;}
   for(const e of list)if(e.seq>this.seen&&e.activity===ID&&e.action==='open')this.onOpen?.();
   this.seen=Math.max(this.seen,max);return 200;
  }).then(wait=>{if(this.poll)this.poll=this.st(tick,wait);});
  this.poll=this.st(tick,0);
 }
 stop(){if(this.poll){this.ct(this.poll);this.poll=null;}}
 get(path){return new Promise(resolve=>{
  try{const req=this.request({host:HOST,port:PORT,path,method:'GET',timeout:1500,agent:false},res=>{let body='';res.setEncoding?.('utf8');res.on('data',d=>body+=d);res.on('end',()=>{try{resolve(res.statusCode<300?JSON.parse(body):null);}catch{resolve(null);}});});
   req.on('timeout',()=>req.destroy());req.on('error',()=>resolve(null));req.end();
  }catch{resolve(null);}
 });}
 send(method,path,body){return new Promise(resolve=>{
  try{const data=body?Buffer.from(JSON.stringify(body),'utf8'):null;
   const req=this.request({host:HOST,port:PORT,path,method,timeout:1500,agent:false,headers:data?{'Content-Type':'application/json; charset=utf-8','Content-Length':data.length}:{}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode<300));});
   req.on('timeout',()=>req.destroy());req.on('error',()=>resolve(false));if(data)req.write(data);req.end();
  }catch{resolve(false);}
 });}
}
module.exports={NotchBridge,activity,trend,ID};
