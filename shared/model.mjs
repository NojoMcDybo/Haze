export const arrows={DoubleUp:'⇈',SingleUp:'↑',FortyFiveUp:'↗',Flat:'→',FortyFiveDown:'↘',SingleDown:'↓',DoubleDown:'⇊'};
export const category=v=>v<=70?'low':v>=180?'high':'normal';
export const statusText=v=>v==null?'Kein Messwert':({low:'Niedrig',high:'Hoch',normal:'Im Bereich'})[category(v)];
export function format(v,unit='mg/dL'){if(v==null||!Number.isFinite(v))return '—';return unit==='mmol/L'?(v/18).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}):Math.round(v).toString();}
export function normalize(raw,now=Date.now()){
 const byTime=new Map();let rejected=0,future=0;
 if(!Array.isArray(raw))throw Error('Ungültige Antwort von Nightscout.');
 for(const r of raw){const t=Number(r.date??r.time??Date.parse(r.dateString));const v=Number(r.sgv??r.value);
 if(t>now){future++;continue;}
 if(!Number.isFinite(t)||t<=0||!Number.isFinite(v)||v<20||v>600||(r.type&&r.type!=='sgv')){rejected++;continue;}
 byTime.set(t,{time:t,value:v,trend:Object.hasOwn(arrows,r.direction??r.trend)?(r.direction??r.trend):null});}
 return {entries:[...byTime.values()].sort((a,b)=>a.time-b.time),rejected,future};
}
export function freshness(entries,now=Date.now(),staleMinutes=10){const last=entries.at(-1);if(!last)return {last:null,minutes:null,stale:true,text:'Noch keine Messwerte'};const age=(now-last.time)/60000,minutes=Math.max(0,Math.floor(age));return {last,minutes,stale:age>staleMinutes,text:age>staleMinutes?`Keine neue Messung seit ${minutes} Minuten`:`vor ${minutes<1?'weniger als 1':minutes} Min.`};}
export function delta(entries,unit){if(entries.length<2)return null;const a=entries.at(-2),b=entries.at(-1);const mins=(b.time-a.time)/60000;if(mins<=0||mins>20)return null;const d=b.value-a.value;return `${d>0?'+':d<0?'−':''}${format(Math.abs(d),unit)} ${unit} in ${Math.round(mins)} Min.`;}
export function widgetDelta(entries,unit,now=Date.now(),staleMinutes=10){
 if(freshness(entries,now,staleMinutes).stale||entries.length<2)return null;
 const a=entries.at(-2),b=entries.at(-1),minutes=(b.time-a.time)/60000;
 if(minutes<=0||minutes>20)return null;
 const difference=b.value-a.value,rounded=unit==='mmol/L'?Math.round(difference/18*10)/10:Math.round(difference);
 return {text:`${rounded>0?'+':rounded<0?'−':'±'}${format(Math.abs(rounded)*(unit==='mmol/L'?18:1),unit)}`,description:`${delta(entries,unit)} · zum vorherigen Messwert`};
}
export function demo(now=Date.now()){const end=Math.floor(now/300000)*300000;return Array.from({length:289},(_,i)=>{const j=i-288;return {time:end+j*300000,value:Math.round(123+49*Math.sin(i/19)+18*Math.sin(i/7)),trend:i===288?'Flat':null};});}
export function defaults(){return {configured:false,source:'demo',url:'http://127.0.0.1:1337',unit:'mg/dL',theme:'system',showDelta:true,staleMinutes:10,autoStart:false,overlayOnly:false,snap:true,shortcut:'CommandOrControl+Shift+G',profile:'Arbeit',view:'history',locked:false,clickThrough:false,bounds:null,profiles:{Arbeit:{theme:'system',view:'history',locked:false,clickThrough:false,bounds:null},Gaming:{theme:'dark',view:'minimal',locked:true,clickThrough:true,bounds:null}}};}
export function clampBounds(bounds,displays,min={width:220,height:150}){const primary=displays[0];const area=displays.find(d=>bounds&&bounds.x>=d.x&&bounds.y>=d.y&&bounds.x+40<d.x+d.width&&bounds.y+40<d.y+d.height)||primary;const width=Math.max(min.width,Math.min(bounds?.width||320,area.width)),height=Math.max(min.height,Math.min(bounds?.height||240,area.height));return {x:Math.min(Math.max(bounds?.x??area.x+area.width-width-20,area.x),area.x+area.width-width),y:Math.min(Math.max(bounds?.y??area.y+area.height-height-20,area.y),area.y+area.height-height),width,height};}
