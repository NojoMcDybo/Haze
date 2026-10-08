// Glukose-Lücken erkennen (Datenstatus in Einstellungen › Daten). Nachgeholt wird per Clarity-Import;
// danach verschwindet die Lücke beim nächsten Abgleich von selbst.
const MIN=60000;
export function detectGaps(times,{from,to,minGap=15*MIN,minLength=30*MIN,now=Date.now()}){
 const found=[];let last=from;
 for(const t of times){if(t-last>minGap&&t-last>=minLength)found.push({start:last,end:t});last=t;}
 if(Math.min(to,now)-last>=minLength)found.push({start:last,end:Math.min(to,now)});
 return found.map(g=>({...g,minutes:Math.round((g.end-g.start)/MIN),tries:0,status:'offen',updated:now}));
}
