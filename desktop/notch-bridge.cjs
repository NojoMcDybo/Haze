const http=require('http');
// Pushes the current reading to the local Notch app (http://127.0.0.1:47800), ported from the
// Widget Lab's NotchBridge. Loopback only, no proxy. If Notch is not running nothing happens.
// ttl 180 s + re-send every minute: if Haze crashes, the value disappears from the Notch by itself.
const ID='haze-bz',HOST='127.0.0.1',PORT=47800,TTL=180,REFRESH=60000;
const colors={high:'#EDBC56',low:'#FF7971',normal:'#E8EFEF',stale:'#8E9A9B'};
function icon(color){return 'data:image/svg+xml;base64,'+Buffer.from(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M12 2.5c3.2 4.3 6.5 8.2 6.5 12a6.5 6.5 0 0 1-13 0c0-3.8 3.3-7.7 6.5-12z' fill='${color}'/></svg>`).toString('base64');}
// Pure: feed + settings -> Notch activity (without the alert flag), or null when nothing is to show.
function activity(model,feed,config,now=Date.now(),open){
 const f=model.freshness(feed.entries||[],now,config.staleMinutes);if(!f.last)return null;
 const v=f.last.value,stale=f.stale,category=model.category(v),level=category==='high'?1:category==='low'?-1:0;
 const age=`vor ${f.minutes} Min.`,arrow=stale?'':(model.arrows[f.last.trend]||''),change=stale?null:model.widgetDelta(feed.entries,config.unit,now,config.staleMinutes);
 const trend=[arrow,change?.text||''].filter(Boolean).join(' '),offline=feed.error?' · offline':'';
 const color=stale?colors.stale:colors[category];
 const a={id:ID,app:'Haze',title:config.source==='demo'?'Blutzucker (Demo)':'Blutzucker',subtitle:(stale?'Messung veraltet · '+age:(trend?trend+' · ':'')+age)+offline,value:model.format(v,config.unit),unit:config.unit,color,icon:icon(color),priority:10,ttl:TTL};
 if(open)a.open=open;
 return {activity:a,level,stale};
}
class NotchBridge {
 constructor({model,request=http.request,open,setInterval:si=setInterval,clearInterval:ci=clearInterval}){Object.assign(this,{model,request,open,si,ci});this.last=null;this.lastLevel=0;this.refresh=null;}
 get active(){return this.last!==null;}
 update(feed,config,now=Date.now()){
  if(config.notch===false){if(this.active)this.remove();return;}
  const r=activity(this.model,feed,config,now,this.open);if(!r){if(this.active)this.remove();return;}
  // Alert once when the reading enters a different out-of-range band (as in the Widget Lab).
  const alert=!r.stale&&r.level!==0&&r.level!==this.lastLevel;if(!r.stale)this.lastLevel=r.level;
  const json=JSON.stringify(r.activity);if(json===this.last&&!alert)return;this.last=json;
  this.send('POST','/activity',{...r.activity,alert});
  if(!this.refresh)this.refresh=this.si(()=>{if(this.last)this.send('POST','/activity',{...JSON.parse(this.last),alert:false});},REFRESH);
 }
 remove(){if(this.refresh){this.ci(this.refresh);this.refresh=null;}const was=this.active;this.last=null;this.lastLevel=0;return was?this.send('DELETE','/activity/'+ID):Promise.resolve(false);}
 send(method,path,body){return new Promise(resolve=>{
  try{const data=body?Buffer.from(JSON.stringify(body),'utf8'):null;
   const req=this.request({host:HOST,port:PORT,path,method,timeout:1500,agent:false,headers:data?{'Content-Type':'application/json; charset=utf-8','Content-Length':data.length}:{}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode<300));});
   req.on('timeout',()=>req.destroy());req.on('error',()=>resolve(false));if(data)req.write(data);req.end();
  }catch{resolve(false);}
 });}
}
module.exports={NotchBridge,activity,ID};
