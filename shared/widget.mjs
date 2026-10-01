// Logical pixels throughout. One cubic contour drives SVG and the native hit region.
export const edges=['top','right','bottom','left'];
export const mix=(a,b,t)=>a+(b-a)*t;
export const ease=t=>t*t*(3-2*t);
export const widgetDefaults={fontSize:48,alignment:'auto',surface:'clear',nativeGlass:true,glassBlur:3,glassOpacity:.88,reduceMotion:false,dock:null,taskbarVisible:false,taskbarMonitor:null,overlayVisible:false};
export const profileKeys=['theme','locked','clickThrough','bounds','monitor','fontSize','alignment','surface','nativeGlass','glassBlur','glassOpacity','snap','dock'];
export function migrate(saved,base){const c={...base,...widgetDefaults,...saved};c.schema=2;c.view='minimal';c.profiles=Object.fromEntries(['Arbeit','Gaming'].map(n=>[n,{...widgetDefaults,...base.profiles[n],...(saved.profiles?.[n]||{}),view:'minimal'}]));return c;}
export function orientation(c,b,previous='horizontal',edge=null){if(c.alignment!=='auto')return c.alignment;if(edge)return ['left','right'].includes(edge)?'vertical':'horizontal';const ratio=b.width/b.height;return previous==='horizontal'?(ratio<.92?'vertical':'horizontal'):(ratio>1.18?'horizontal':'vertical');}
export function padding(w,h){return Math.max(6,Math.min(22,Math.min(w,h)*.13));}
export function minimum(font=48,layout='horizontal',measured=null){
 const time=Math.max(11,font*.22),p=22;
 const number=measured?.number||font*2.75,trend=measured?.trend||font*.85,label=measured?.label||time*14;
 return layout==='vertical'?{width:Math.ceil(Math.max(number,label)+p*2),height:Math.ceil(font*1.1+font*.55+time*2.4+p*2+8)}:{width:Math.ceil(Math.max(number+trend+8,label)+p*2),height:Math.ceil(font*1.12+time*2.4+p*2+4)};
}
function canonical(w,h,t,gap){
 const p=padding(w,h),r=Math.min(22,(w-2*p)/3,(h-2*p)/3),k=.55228475;
 const free=[[p+r,p+gap],[p+r-k*r,p+gap],[p,p+r-k*r+gap],[p,p+r+gap],[p,h-p-r+gap],[p,h-p-r+k*r+gap],[p+r-k*r,h-p+gap],[p+r,h-p+gap],[w-p-r,h-p+gap],[w-p-r+k*r,h-p+gap],[w-p,h-p-r+k*r+gap],[w-p,h-p-r+gap],[w-p,p+r+gap],[w-p,p+r-k*r+gap],[w-p-r+k*r,p+gap],[w-p-r,p+gap]];
 // Concave shoulders: horizontal tangent at the screen, vertical at the body.
 const dock=free.map(a=>[...a]);dock[0]=[0,0];dock[1]=[p,0];dock[2]=[p,gap];dock[3]=[p,p+gap];dock[12]=[w-p,p+gap];dock[13]=[w-p,gap];dock[14]=[w-p,0];dock[15]=[w,0];
 return free.map((pt,i)=>pt.map((v,j)=>mix(v,dock[i][j],t)));
}
export function contour(width,height,edge='top',amount=0,gap=0){
 const side=['left','right'].includes(edge),w=side?height:width,h=side?width:height;
 const points=canonical(w,h,Math.max(0,Math.min(1,amount)),Math.max(0,gap));
 const transform=([x,y])=>edge==='bottom'?[x,h+gap-y]:edge==='left'?[y,x]:edge==='right'?[h+gap-y,x]:[x,y];
 const p=points.map(transform),pair=i=>p[i].map(n=>+n.toFixed(3)).join(' ');
 const path=`M ${pair(0)} C ${pair(1)} ${pair(2)} ${pair(3)} L ${pair(4)} C ${pair(5)} ${pair(6)} ${pair(7)} L ${pair(8)} C ${pair(9)} ${pair(10)} ${pair(11)} L ${pair(12)} C ${pair(13)} ${pair(14)} ${pair(15)} Z`;
 const polygon=[p[0]];for(const [a,b,c,d] of [[0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15]]){if(a)polygon.push(p[a]);for(let i=1;i<=24;i++){const t=i/24,u=1-t;polygon.push([0,1].map(j=>u*u*u*p[a][j]+3*u*u*t*p[b][j]+3*u*t*t*p[c][j]+t*t*t*p[d][j]));}}
 return {path,points:p,polygon,width:width+(side?gap:0),height:height+(side?0:gap)};
}
export function region(polygon,width,height){
 const rects=[];for(let y=0;y<Math.ceil(height);y++){const crossings=[],scan=y+.5;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[j],b=polygon[i];if((a[1]<=scan&&b[1]>scan)||(b[1]<=scan&&a[1]>scan))crossings.push(a[0]+(scan-a[1])*(b[0]-a[0])/(b[1]-a[1]));}crossings.sort((a,b)=>a-b);for(let i=0;i+1<crossings.length;i+=2){const x=Math.max(0,Math.floor(crossings[i])),right=Math.min(Math.ceil(width),Math.ceil(crossings[i+1]));if(right>x){const last=rects.at(-1);if(last&&last.x===x&&last.width===right-x&&last.y+last.height===y)last.height++;else rects.push({x,y,width:right-x,height:1});}}}return rects;
}
export function boundary(display){const a={...display.workArea};
 for(const e of display.autoHideEdges||[]){if(e==='left'){a.x+=2;a.width-=2;}if(e==='top'){a.y+=2;a.height-=2;}if(e==='right')a.width-=2;if(e==='bottom')a.height-=2;}return a;
}
export function sharedEdge(d,other,e,b){if(d.id===other.id)return false;const a=d.bounds,o=other.bounds;const overlap=(s,n,x,m)=>s<x+m&&s+n>x;
 if(e==='left'||e==='right')return Math.abs((e==='left'?a.x:a.x+a.width)-(e==='left'?o.x+o.width:o.x))<2&&overlap(b.y,b.height,o.y,o.height);
 return Math.abs((e==='top'?a.y:a.y+a.height)-(e==='top'?o.y+o.height:o.y))<2&&overlap(b.x,b.width,o.x,o.width);
}
export function dockTarget(b,d,edge){const a=boundary(d),n={...b};if(edge==='left')n.x=a.x;if(edge==='right')n.x=a.x+a.width-b.width;if(edge==='top')n.y=a.y;if(edge==='bottom')n.y=a.y+a.height-b.height;n.x=Math.max(a.x,Math.min(n.x,a.x+a.width-n.width));n.y=Math.max(a.y,Math.min(n.y,a.y+a.height-n.height));return n;}
export function nearest(b,d,displays,zone=16){return edges.map(edge=>{const target=dockTarget(b,d,edge),dist=Math.abs(['left','right'].includes(edge)?target.x-b.x:target.y-b.y);return {edge,dist,target,monitor:d.id};}).filter(v=>v.dist<=zone&&!displays.some(o=>sharedEdge(d,o,v.edge,b))).sort((a,b)=>a.dist-b.dist)[0]||null;}
export function taskbarBounds(d,width=260,height=38){const a=boundary(d),b=d.bounds;const insets={top:a.y-b.y,left:a.x-b.x,right:b.x+b.width-a.x-a.width,bottom:b.y+b.height-a.y-a.height};const edge=Object.entries(insets).sort((a,b)=>b[1]-a[1])[0];const e=d.autoHideEdges?.[0]||(edge[1]>2?edge[0]:'bottom');const r={width:Math.min(width,a.width-8),height,x:a.x+a.width-Math.min(width,a.width-8)-8,y:a.y+a.height-height-4};if(e==='top')r.y=a.y+4;if(e==='left')r.x=a.x+4;if(e==='right')r.x=a.x+a.width-r.width-4;return r;}
