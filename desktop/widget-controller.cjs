const {performance}=require('perf_hooks');
// Fluid widget motion ported from the native Widget Lab (Haze.cs): spring-driven body,
// neck that stays attached to the edge until the adhesion distance is exceeded, squash on
// docking, stretch on peeling. Logical (DIP) pixels throughout; one contour drives the SVG,
// the Windows hit region and the native glass mask.
const SPRING=240,DAMP=23,BOUNCE_SPRING=240,BOUNCE_DAMP=18,ATTACH_RATE=18,RELEASE_COOLDOWN=250;
module.exports=class WidgetController {
 constructor(win,{geometry,screen,config,save,displays,onFrame,clock}){
  Object.assign(this,{win,g:geometry,screen,config,save,displays,onFrame});
  this.clock=clock||(()=>performance.now());
  this.layout='horizontal';this.measured={};this.edge=null;this.attach=1;this.bounce=0;this.bounceV=0;this.v={x:0,y:0};this.anchor=0;this.releaseUntil=0;this.dragging=false;
  this.apply();win.webContents.on('did-finish-load',()=>this.draw());win.on('closed',()=>this.cancel());
 }
 cancel(){clearTimeout(this.timer);this.timer=null;}
 get animating(){return !!this.timer;}
 // Settings
 fluid(){const v=this.config().fluid;return Number.isFinite(v)?this.g.clamp(v,0,100):55;}
 limit(){const v=this.config().adhesion;return this.g.adhesionLimit(Number.isFinite(v)?v:103,this.fluid());}
 // Detach mode: 'fluid' (neck stretches up to the adhesion distance), 'direct' (leaves the edge at once,
 // snaps on release) or 'locked' (slides along the edge, released only via "Vom Rand lösen").
 mode(){const m=this.config().detach;return ['fluid','direct','locked'].includes(m)?m:'fluid';}
 nearestEdge(){const zone=this.mode()==='fluid'?Math.min(this.g.fluidDefaults.zone,this.limit()*.8):this.g.fluidDefaults.zone;return this.g.edges.map(e=>({e,gap:this.gapTo(e)})).filter(v=>v.gap<zone&&!this.displays().some(o=>this.g.sharedEdge(this.d,o,v.e,this.b))).sort((x,y)=>x.gap-y.gap)[0]||null;}
 dockTo(e){this.edge=e;this.anchor=this.along(e);this.attach=this.reduced()?1:.1;}
 reduced(){return !!(this.config().reduceMotion||this.systemReduced);}
 // Displays
 displayFor(rect){const ds=this.displays();return ds.find(d=>d.id===this.screen.getDisplayMatching(rect).id)||ds[0];}
 display(){const ds=this.displays(),dock=this.config().dock;return (dock&&ds.find(d=>d.id===dock.monitor))||this.displayFor(this.b||this.win.getBounds());}
 area(){return this.g.boundary(this.d||this.display());}
 // Body geometry: this.b is the resting (target) body, this.c the current body centre.
 minimum(){return this.g.minimum(this.config().fontSize,this.layout,this.measured[this.config().fontSize]);}
 // Auto size: the frame hugs the text (plus padding) and follows the font size.
 fit(){const m=this.minimum();if(this.config().autoSize!==false){this.b.width=m.width;this.b.height=m.height;return;}this.b.width=Math.max(m.width,Math.min(2200,this.b.width));this.b.height=Math.max(m.height,Math.min(1800,this.b.height));}
 clamp(){const a=this.area();this.b.width=Math.min(this.b.width,a.width);this.b.height=Math.min(this.b.height,a.height);this.b.x=Math.max(a.x,Math.min(this.b.x,a.x+a.width-this.b.width));this.b.y=Math.max(a.y,Math.min(this.b.y,a.y+a.height-this.b.height));}
 target(){return {x:this.b.x+this.b.width/2,y:this.b.y+this.b.height/2};}
 along(e,p=this.c){return e==='top'||e==='bottom'?p.x:p.y;}
 gapTo(e){const a=this.area(),w=this.b.width,h=this.b.height,c=this.c;
  if(e==='top')return c.y-h/2-a.y;if(e==='right')return a.x+a.width-c.x-w/2;if(e==='bottom')return a.y+a.height-c.y-h/2;return c.x-w/2-a.x;}
 snapTarget(){if(!this.edge)return;this.b=this.g.dockTarget(this.b,this.d,this.edge);this.anchor=this.along(this.edge,this.target());}
 apply(){const c=this.config();this.cancel();this.dragging=false;this.gesture=null;
  this.b={...(c.bounds||this.b||{x:100,y:100,width:250,height:140})};this.edge=c.dock?.edge||null;this.d=this.display();
  this.layout=this.g.orientation(c,this.b,this.layout,this.edge);this.fit();
  if(c.dock){const a=this.area();if(Number.isFinite(c.dock.along)){if(['top','bottom'].includes(c.dock.edge))this.b.x=a.x+c.dock.along*Math.max(0,a.width-this.b.width);else this.b.y=a.y+c.dock.along*Math.max(0,a.height-this.b.height);}this.b=this.g.dockTarget(this.b,this.d,c.dock.edge);}
  this.clamp();this.c=this.target();this.v={x:0,y:0};this.bounce=this.bounceV=0;this.attach=1;if(this.edge)this.anchor=this.along(this.edge);
  this.win.setResizable(false);this.win.setMovable(false);this.win.setIgnoreMouseEvents(!!c.clickThrough,{forward:true});this.draw();
 }
 draw(){if(this.win.isDestroyed())return;
  const w=this.b.width,h=this.b.height,s=this.reduced()?0:this.g.clamp(this.bounce,-.1,.1),bw=w*(1-s*.5),bh=h*(1+s);
  const body={x:this.c.x-bw/2,y:this.c.y-bh/2,width:bw,height:bh},gap=this.edge?Math.max(0,this.gapTo(this.edge)):0;
  const shape=this.g.fluid(body,this.edge,this.anchor,gap,this.limit(),this.attach,this.g.fluidDefaults.radius),a=this.area(),bb=shape.bounds;
  const left=Math.floor(Math.max(a.x,bb.x-1)),top=Math.floor(Math.max(a.y,bb.y-1)),right=Math.ceil(Math.min(a.x+a.width,bb.x+bb.width+1)),bottom=Math.ceil(Math.min(a.y+a.height,bb.y+bb.height+1));
  const tight={x:left,y:top,width:Math.max(1,right-left),height:Math.max(1,bottom-top)};
  // The window is a fixed stage over the work area of the current monitor; only its region follows
  // the shape. Window geometry is applied by the OS immediately, drawing by the renderer a frame
  // later. With a stationary window the two cannot drift apart (no clipped neck, no jumping text).
  const moving=this.dragging||!!this.timer;
  this.stage={x:Math.round(a.x),y:Math.round(a.y),width:Math.round(a.width),height:Math.round(a.height)};
  const bounds=this.stage,local=this.g.place(shape,bounds.x,bounds.y,bounds.width,bounds.height),key=[bounds.x,bounds.y,bounds.width,bounds.height].join();
  if(key!==this.boundsKey){this.win.setBounds(bounds,false);this.boundsKey=key;}
  // OS region: full stage while dragging, a generous box while settling, the exact contour at rest
  // (transparent corners, the shoulders' outside and the gap pass clicks through).
  try{if(this.dragging){if(this.shapeKey!=='stage'){this.win.setShape([]);this.shapeKey='stage';}}
  else if(moving){const m=80,x=Math.max(0,tight.x-m-bounds.x),y=Math.max(0,tight.y-m-bounds.y);this.win.setShape([{x,y,width:Math.min(bounds.width-x,tight.width+2*m),height:Math.min(bounds.height-y,tight.height+2*m)}]);this.shapeKey='settle';}else{const own=this.g.place(shape,tight.x,tight.y,tight.width,tight.height),dx=tight.x-bounds.x,dy=tight.y-bounds.y;this.win.setShape(this.g.region(own.polygon,tight.width,tight.height).map(r=>({...r,x:r.x+dx,y:r.y+dy})));this.shapeKey=key;}}catch(e){this.shapeError='Windows-Fensterkontur nicht verfügbar. Durchklicken aktiv; Widget über die Haupt-App zurücksetzen.';this.win.setIgnoreMouseEvents(true,{forward:true});}
  const p=this.g.padding(w,h);
  this.frame={width:local.width,height:local.height,path:local.path,layout:this.layout,edge:this.edge,amount:this.edge?this.attach:0,body:{left:this.c.x-w/2-bounds.x+p,top:this.c.y-h/2-bounds.y+p,width:w-2*p,height:h-2*p},shapeError:this.shapeError};
  this.win.webContents.send('widget-frame',this.frame);
  // The native glass always follows the tight shape, synchronously from here (no renderer lag).
  this.onFrame?.(tight,this.g.place(shape,tight.x,tight.y,tight.width,tight.height));
 }
 // Physics (Haze.cs Tick). Returns true while anything is still moving.
 step(dt){
  if(this.reduced()){this.c=this.target();this.v={x:0,y:0};this.bounce=this.bounceV=0;this.attach=1;return false;}
  const t=this.target();
  if(!this.dragging){this.v.x+=(SPRING*(t.x-this.c.x)-DAMP*this.v.x)*dt;this.v.y+=(SPRING*(t.y-this.c.y)-DAMP*this.v.y)*dt;this.c={x:this.c.x+this.v.x*dt,y:this.c.y+this.v.y*dt};}
  this.bounceV+=(-BOUNCE_SPRING*this.bounce-BOUNCE_DAMP*this.bounceV)*dt;this.bounce+=this.bounceV*dt;this.attach+=(1-this.attach)*(1-Math.exp(-ATTACH_RATE*dt));
  const moving=(this.dragging?0:Math.abs(t.x-this.c.x)+Math.abs(t.y-this.c.y)+Math.abs(this.v.x)+Math.abs(this.v.y))>.15||Math.abs(this.bounce)>.0003||Math.abs(this.bounceV)>.001||this.attach<.999;
  if(!moving){if(!this.dragging){this.c=t;this.v={x:0,y:0};}this.bounce=this.bounceV=0;this.attach=1;}
  return moving;
 }
 tick(){const now=this.clock(),dt=Math.min(.033,Math.max(0,(now-this.last)/1000));this.last=now;const moving=this.step(dt);this.timer=moving?setTimeout(()=>this.tick(),16):null;this.draw();}
 wake(){if(this.timer||this.win.isDestroyed())return;this.last=this.clock();if(this.reduced()){this.step(0);this.draw();return;}this.timer=setTimeout(()=>this.tick(),16);}
 record(){const c=this.config();c.bounds=Object.fromEntries(Object.entries(this.b).map(([k,v])=>[k,Math.round(v)]));c.monitor=this.d.id;
  if(this.edge){const a=this.area(),horizontal=['top','bottom'].includes(this.edge);c.dock={edge:this.edge,monitor:this.d.id,along:horizontal?(this.b.x-a.x)/Math.max(1,a.width-this.b.width):(this.b.y-a.y)/Math.max(1,a.height-this.b.height)};}else c.dock=null;this.save();}
 relayout(){const c=this.config(),centre=this.target();this.layout=this.g.orientation(c,this.b,this.layout,this.edge);this.fit();this.b.x=centre.x-this.b.width/2;this.b.y=centre.y-this.b.height/2;this.clamp();}
 // Gestures, driven by the renderer's pointer events and the OS cursor position.
 start(kind,edge){const c=this.config();if(c.locked||c.clickThrough)return;const p=this.screen.getCursorScreenPoint();
  if(kind==='resize'&&c.autoSize!==false)return;
  if(kind==='resize'){this.cancel();this.c=this.target();this.v={x:0,y:0};this.gesture={kind,edge,cursor:p,start:{...this.b}};return;}
  this.gesture={kind:'drag',offset:{x:p.x-this.c.x,y:p.y-this.c.y},from:p,moved:false};this.dragging=true;this.v={x:0,y:0};this.wake();}
 move(){if(!this.gesture)return;const c=this.config(),s=this.gesture,p=this.screen.getCursorScreenPoint();
  if(s.kind==='resize'){const dx=p.x-s.cursor.x,dy=p.y-s.cursor.y,e=s.edge;let b={...s.start};if(e.includes('e'))b.width+=dx;if(e.includes('s'))b.height+=dy;if(e.includes('w')){b.x+=dx;b.width-=dx;}if(e.includes('n')){b.y+=dy;b.height-=dy;}
   this.b=b;this.layout=this.g.orientation(c,b,this.layout,this.edge);this.fit();if(e.includes('w'))this.b.x=s.start.x+s.start.width-this.b.width;if(e.includes('n'))this.b.y=s.start.y+s.start.height-this.b.height;
   if(this.edge)this.snapTarget();this.clamp();this.c=this.target();this.draw();return;}
  if(!s.moved){if(Math.hypot(p.x-s.from.x,p.y-s.from.y)<3)return;s.moved=true;}
  const d=this.displayFor({x:p.x,y:p.y,width:1,height:1});if(d.id!==this.d.id){this.d=d;if(this.edge){this.edge=null;c.dock=null;}}
  const a=this.area(),w=this.b.width,h=this.b.height,now=this.clock();
  this.c={x:this.g.clamp(p.x-s.offset.x,a.x+w/2,a.x+a.width-w/2),y:this.g.clamp(p.y-s.offset.y,a.y+h/2,a.y+a.height-h/2)};this.b.x=this.c.x-w/2;this.b.y=this.c.y-h/2;this.v={x:0,y:0};
  const mode=this.mode();
  if(this.edge&&mode==='locked'){// Slide along the edge only; the perpendicular axis stays on the edge.
   const t=this.g.dockTarget(this.b,this.d,this.edge);this.b.x=t.x;this.b.y=t.y;this.c=this.target();}
  else if(this.edge&&mode==='direct'&&this.gapTo(this.edge)>4){this.edge=null;c.dock=null;this.bounceV=.6*this.fluid()/100;}
  // Peel: the neck tears once the body is pulled further than the adhesion distance.
  else if(this.edge&&this.gapTo(this.edge)>this.limit()){this.edge=null;c.dock=null;this.bounceV=1.8*this.fluid()/100;this.releaseUntil=now+RELEASE_COOLDOWN;}
  // Attach: close to a free edge (never an edge shared with another monitor) a neck forms.
  // In direct mode nothing attaches while dragging; the edge is taken on release.
  if(!this.edge&&c.snap&&mode!=='direct'&&now>this.releaseUntil){const best=this.nearestEdge();if(best)this.dockTo(best.e);}
  this.draw();if(!this.reduced())this.wake();
 }
 end(){if(!this.gesture)return;const s=this.gesture;this.gesture=null;this.dragging=false;
  if(s.kind==='resize'){this.clamp();this.c=this.target();this.draw();this.record();return;}
  // A plain click (or the first half of a double-click) must not bounce or re-dock the widget.
  if(!s.moved){this.draw();this.wake();return;}
  const c=this.config();
  if(!this.edge&&c.snap&&this.mode()==='direct'){const best=this.nearestEdge();if(best)this.dockTo(best.e);}
  if(this.edge){c.dock={edge:this.edge,monitor:this.d.id};this.relayout();this.snapTarget();this.bounceV=-.6*this.fluid()/100;}
  else{c.dock=null;this.relayout();}
  this.record();this.wake();
 }
 detach(){if(!this.edge){this.config().dock=null;return;}const e=this.edge,off=Math.max(24,this.limit()*.6);this.edge=null;this.config().dock=null;
  if(e==='top')this.b.y+=off;if(e==='bottom')this.b.y-=off;if(e==='left')this.b.x+=off;if(e==='right')this.b.x-=off;
  this.relayout();this.bounceV=1.8*this.fluid()/100;this.record();this.wake();}
 measure(m){const font=this.config().fontSize;if(!m||!['number','trend','label'].every(k=>Number.isFinite(m[k])&&m[k]>0&&m[k]<1600))return;const old=this.measured[font];if(old&&Object.keys(m).every(k=>Math.abs(old[k]-m[k])<1))return;this.measured[font]=m;if(!this.gesture){this.apply();this.record();}}
};
