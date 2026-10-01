// Logical pixels throughout. One cubic contour drives SVG and the native hit region.
export const edges=['top','right','bottom','left'];
export const mix=(a,b,t)=>a+(b-a)*t;
export const ease=t=>t*t*(3-2*t);
export const widgetDefaults={fontSize:48,alignment:'auto',surface:'clear',nativeGlass:true,glassBlur:3,glassOpacity:.88,reduceMotion:false,dock:null,taskbarVisible:false,taskbarMonitor:null,overlayVisible:false,fluid:55,adhesion:103,detach:'fluid',widgetText:'auto',notch:true};
export const profileKeys=['theme','locked','clickThrough','bounds','monitor','fontSize','alignment','surface','nativeGlass','glassBlur','glassOpacity','snap','dock','fluid','adhesion','detach','widgetText'];
export function migrate(saved,base){const c={...base,...widgetDefaults,...saved};c.schema=2;c.view='minimal';c.profiles=Object.fromEntries(['Arbeit','Gaming'].map(n=>[n,{...widgetDefaults,...base.profiles[n],...(saved.profiles?.[n]||{}),view:'minimal'}]));return c;}
export function orientation(c,b,previous='horizontal',edge=null){if(c.alignment!=='auto')return c.alignment;if(edge)return ['left','right'].includes(edge)?'vertical':'horizontal';const ratio=b.width/b.height;return previous==='horizontal'?(ratio<.92?'vertical':'horizontal'):(ratio>1.18?'horizontal':'vertical');}
export function padding(w,h){return Math.max(6,Math.min(22,Math.min(w,h)*.13));}
export function minimum(font=48,layout='horizontal',measured=null){
 const time=Math.max(11,font*.22),p=22;
 const number=measured?.number||font*2.75,trend=measured?.trend||font*.85,label=measured?.label||time*14;
 return layout==='vertical'?{width:Math.ceil(Math.max(number,label)+p*2),height:Math.ceil(font*1.1+font*.55+time*2.4+p*2+8)}:{width:Math.ceil(Math.max(number+trend+8,label)+p*2),height:Math.ceil(font*1.12+time*2.4+p*2+4)};
}
// Fluid contour from the native Widget Lab (Haze.cs, Contour.Make), in DIP screen coordinates.
// Canonical frame: x runs along the docking edge, y points away from it (0 = screen edge).
// The neck stays attached at `anchor`, tapers with the gap and peels once gap > limit.
const K=.55228475;
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const fluidDefaults={fluid:55,adhesion:103,radius:25,zone:20};
export function adhesionLimit(adhesion=103,fluid=55){return clamp(adhesion,35,145)*(.5+.7*clamp(fluid,0,100)/100);}
function roundedRect(b,radius){const r=Math.min(radius,b.width/2,b.height/2),x=b.x,y=b.y,R=x+b.width,B=y+b.height,k=K*r;
 return [['M',[x+r,y]],['L',[R-r,y]],['C',[R-r+k,y],[R,y+r-k],[R,y+r]],['L',[R,B-r]],['C',[R,B-r+k],[R-r+k,B],[R-r,B]],['L',[x+r,B]],['C',[x+r-k,B],[x,B-r+k],[x,B-r]],['L',[x,y+r]],['C',[x,y+r-k],[x+r-k,y],[x+r,y]]];}
export function fluid(body,edge=null,anchor=0,gap=0,limit=100,amount=1,radius=25){
 let segments;
 if(!edge)segments=roundedRect(body,radius);
 else{
  const side=edge==='left'||edge==='right',a=side?body.height:body.width,b=side?body.width:body.height,u=side?body.y+body.height/2:body.x+body.width/2;
  const c=Math.min(radius,b*.35,a*.22);let t=clamp(gap/Math.max(1e-6,limit),0,1);t=t*t*(3-2*t);
  // Keep the root on the body's footprint so sliding along an edge cannot tear the neck off.
  anchor=clamp(anchor,u-a/2,u+a/2);
  const root=((a/2+c*.9)*(1-t)+1.2*t)*amount,neck=((a/2)*(1-t)+.5*t)*amount;
  const center=anchor+(u-anchor)*.52,nl=center-neck,nr=center+neck,l=u-a/2,r=u+a/2,ny=c*.55+gap*.5,jy=gap+c,bt=gap+b;
  const canonical=[['M',[anchor-root,0]],
   ['C',[(anchor-root)*.35+nl*.65,0],[nl,ny*.48],[nl,ny]],
   ['C',[nl,ny+(jy-ny)*.65],[l,jy-c*.55],[l,jy]],
   ['L',[l,bt-c]],['Q',[l,bt],[l+c,bt]],['L',[r-c,bt]],['Q',[r,bt],[r,bt-c]],['L',[r,jy]],
   ['C',[r,jy-c*.55],[nr,ny+(jy-ny)*.65],[nr,ny]],
   ['C',[nr,ny*.48],[(anchor+root)*.35+nr*.65,0],[anchor+root,0]]];
  const map=edge==='top'?([x,y])=>[x,y+body.y-gap]:edge==='bottom'?([x,y])=>[x,body.y+body.height+gap-y]:edge==='left'?([x,y])=>[y+body.x-gap,x]:([x,y])=>[body.x+body.width+gap-y,x];
  segments=canonical.map(([type,...pts])=>[type,...pts.map(map)]);
 }
 const polygon=flatten(segments),xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1]);
 return {segments,polygon,bounds:{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}};
}
function flatten(segments){const out=[];let cur=null;
 for(const [type,...p] of segments){
  if(type==='M'||type==='L'){out.push(p[0]);cur=p[0];continue;}
  const n=type==='C'?16:10;
  for(let i=1;i<=n;i++){const t=i/n,u=1-t;out.push(type==='C'?[0,1].map(j=>u*u*u*cur[j]+3*u*u*t*p[0][j]+3*u*t*t*p[1][j]+t*t*t*p[2][j]):[0,1].map(j=>u*u*cur[j]+2*u*t*p[0][j]+t*t*p[1][j]));}
  cur=p.at(-1);
 }
 return out;
}
// Translate a screen-space shape into window-local coordinates.
export function place(shape,left,top,width,height){
 const f=([x,y])=>[x-left,y-top],n=v=>+v.toFixed(3);
 const path=shape.segments.map(([type,...p])=>type+' '+p.map(f).map(q=>q.map(n).join(' ')).join(' ')).join(' ')+' Z';
 return {path,polygon:shape.polygon.map(f),width,height};
}
// Static shape for previews: body of width×height, optionally fully attached to an edge.
export function contour(width,height,edge=null,amount=1){
 const body={x:0,y:0,width,height},side=edge==='left'||edge==='right';
 const shape=fluid(body,amount>0?edge:null,side?height/2:width/2,0,100,amount);
 const b=shape.bounds;return {...place(shape,b.x,b.y,b.width,b.height),offset:{x:-b.x,y:-b.y}};
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
