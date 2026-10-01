const {performance}=require('perf_hooks');
module.exports=class WidgetController {
 constructor(win,{geometry,screen,config,save,displays,onFrame}){Object.assign(this,{win,g:geometry,screen,config,save,displays,onFrame});this.layout='horizontal';this.amount=0;this.edge='top';this.gap=0;this.measured={};this.apply();win.webContents.on('did-finish-load',()=>this.draw());win.on('closed',()=>this.cancel());}
 cancel(){clearTimeout(this.animation);this.animation=null;}
 display(){const ds=this.displays();return ds.find(d=>d.id===this.config().dock?.monitor)||ds.find(d=>d.id===this.screen.getDisplayMatching(this.b||this.win.getBounds()).id)||ds[0];}
 minimum(){return this.g.minimum(this.config().fontSize,this.layout,this.measured[this.config().fontSize]);}
 apply(){const c=this.config();this.cancel();this.b={...(c.bounds||this.b||{x:100,y:100,width:250,height:140})};this.layout=this.g.orientation(c,this.b,this.layout,c.dock?.edge);this.fit();this.edge=c.dock?.edge||this.edge;this.amount=c.dock?1:0;this.gap=0;
  if(c.dock){const d=this.display(),a=this.g.boundary(d);if(Number.isFinite(c.dock.along)){if(['top','bottom'].includes(c.dock.edge))this.b.x=a.x+c.dock.along*Math.max(0,a.width-this.b.width);else this.b.y=a.y+c.dock.along*Math.max(0,a.height-this.b.height);}this.b=this.g.dockTarget(this.b,d,c.dock.edge);}this.clamp();
  this.win.setResizable(false);this.win.setMovable(false);this.win.setIgnoreMouseEvents(!!c.clickThrough,{forward:true});this.draw();
 }
 fit(){const m=this.minimum();this.b.width=Math.max(m.width,Math.min(2200,this.b.width));this.b.height=Math.max(m.height,Math.min(1800,this.b.height));}
 clamp(){const a=this.g.boundary(this.display());this.b.width=Math.min(this.b.width,a.width);this.b.height=Math.min(this.b.height,a.height);this.b.x=Math.max(a.x,Math.min(this.b.x,a.x+a.width-this.b.width));this.b.y=Math.max(a.y,Math.min(this.b.y,a.y+a.height-this.b.height));}
 draw(){if(this.win.isDestroyed())return;const side=['left','right'].includes(this.edge),shape=this.g.contour(this.b.width,this.b.height,this.edge,this.amount,this.gap);const bounds={...this.b,width:shape.width,height:shape.height};if(this.edge==='top')bounds.y-=this.gap;if(this.edge==='left')bounds.x-=this.gap;
  const integer=Object.fromEntries(Object.entries(bounds).map(([k,v])=>[k,Math.round(v)]));this.win.setBounds(integer,false);
  // Explicit OS hit region: transparent padding and shoulder cut-outs pass through.
  try{this.win.setShape(this.g.region(shape.polygon,shape.width,shape.height));}catch(e){this.shapeError='Windows-Fensterkontur nicht verfügbar. Durchklicken aktiv; Widget über die Haupt-App zurücksetzen.';this.win.setIgnoreMouseEvents(true,{forward:true});}
  const p=this.g.padding(this.b.width,this.b.height);this.frame={...shape,polygon:undefined,points:undefined,layout:this.layout,edge:this.edge,amount:this.amount,offered:!!this.offer,body:{left:p+(this.edge==='left'?this.gap:0),top:p+(this.edge==='top'?this.gap:0),width:this.b.width-2*p,height:this.b.height-2*p},shapeError:this.shapeError};
  this.win.webContents.send('widget-frame',this.frame);this.onFrame?.(integer,shape);
 }
 reduced(){return this.config().reduceMotion||this.systemReduced;}
 animate(target,amount,edge,done){this.cancel();const start={...this.b},from=this.amount,fromGap=this.gap,t0=performance.now();this.edge=edge||this.edge;
  const tick=()=>{const t=this.reduced()?1:Math.min(1,(performance.now()-t0)/260),v=this.g.ease(t);for(const k of ['x','y','width','height'])this.b[k]=this.g.mix(start[k],target[k],v);this.amount=this.g.mix(from,amount,v);this.gap=this.g.mix(fromGap,0,v);this.draw();if(t<1)this.animation=setTimeout(tick,16);else{this.animation=null;done?.();}};tick();
 }
 record(){const c=this.config();c.bounds=Object.fromEntries(Object.entries(this.b).map(([k,v])=>[k,Math.round(v)]));c.monitor=this.screen.getDisplayMatching(c.bounds).id;if(c.dock){const d=this.display(),a=this.g.boundary(d),horizontal=['top','bottom'].includes(c.dock.edge);c.dock={edge:c.dock.edge,monitor:d.id,along:horizontal?(this.b.x-a.x)/Math.max(1,a.width-this.b.width):(this.b.y-a.y)/Math.max(1,a.height-this.b.height)};}this.save();}
 start(kind,edge){const c=this.config();if(c.locked||c.clickThrough)return;this.cancel();this.offer=null;const target=c.dock?this.g.dockTarget(this.b,this.display(),c.dock.edge):this.b;this.gesture={kind,edge,cursor:this.screen.getCursorScreenPoint(),start:{...this.b},attached:c.dock?{...c.dock}:null,fromAmount:this.amount,fromGap:this.gap,initialDistance:Math.abs(['left','right'].includes(this.edge)?target.x-this.b.x:target.y-this.b.y),fromEdge:this.edge};}
 move(){if(!this.gesture)return;const c=this.config(),s=this.gesture,p=this.screen.getCursorScreenPoint(),dx=p.x-s.cursor.x,dy=p.y-s.cursor.y;
  if(s.kind==='resize'){let b={...s.start},e=s.edge;if(e.includes('e'))b.width+=dx;if(e.includes('s'))b.height+=dy;if(e.includes('w')){b.x+=dx;b.width-=dx;}if(e.includes('n')){b.y+=dy;b.height-=dy;}
   this.b=b;this.layout=this.g.orientation(c,b,this.layout,c.dock?.edge);this.fit();if(e.includes('w'))this.b.x=s.start.x+s.start.width-this.b.width;if(e.includes('n'))this.b.y=s.start.y+s.start.height-this.b.height;
   if(c.dock)this.b=this.g.dockTarget(this.b,this.display(),c.dock.edge);this.gap=0;this.draw();return;
  }
  this.b={...s.start,x:s.start.x+dx,y:s.start.y+dy};const d=this.displays().find(v=>v.id===this.screen.getDisplayMatching(this.b).id)||this.displays()[0];
  const offer=c.snap?this.g.nearest(this.b,d,this.displays()):null;this.offer=offer;
  if(s.attached){const old=this.displays().find(v=>v.id===s.attached.monitor)||d,target=this.g.dockTarget(this.b,old,s.attached.edge),dist=Math.abs(['left','right'].includes(s.attached.edge)?target.x-this.b.x:target.y-this.b.y);
   this.edge=s.attached.edge;this.amount=Math.max(0,Math.min(1,s.fromAmount-(dist-s.initialDistance)/36));this.gap=dist<36?Math.max(0,s.fromGap+dist-s.initialDistance):0;
   // All body movement is immediate. Only the connecting neck is stretched.
   if(dist>=36){s.attached=null;c.dock=null;this.amount=0;this.gap=0;}
  }else{this.gap=0;const travelled=Math.hypot(dx,dy);this.amount=offer?(this.reduced()?0:.32*(1-offer.dist/16)):Math.max(0,s.fromAmount*(1-travelled/36));if(offer)this.edge=offer.edge;}
  this.draw();
 }
 end(){if(!this.gesture)return;const s=this.gesture;this.gesture=null;const c=this.config();if(s.kind==='resize'){this.clamp();this.draw();this.record();return;}
  const d=this.displays().find(v=>v.id===this.screen.getDisplayMatching(this.b).id)||this.displays()[0],off=c.snap?this.g.nearest(this.b,d,this.displays()):null;this.offer=null;
  if(off){c.dock={edge:off.edge,monitor:d.id};const start={...this.b},oldLayout=this.layout;this.layout=this.g.orientation(c,this.b,this.layout,off.edge);const targetLayout=this.layout;this.fit();const target=this.g.dockTarget(this.b,d,off.edge);this.b=start;this.layout=oldLayout;this.animate(target,1,off.edge,()=>{this.layout=targetLayout;this.draw();this.record();});}
  else{c.dock=null;this.animate({...this.b},0,this.edge,()=>{this.clamp();this.draw();this.record();});}
 }
 detach(){this.config().dock=null;const b={...this.b};const v=24;if(this.edge==='top')b.y+=v;if(this.edge==='bottom')b.y-=v;if(this.edge==='left')b.x+=v;if(this.edge==='right')b.x-=v;this.animate(b,0,this.edge,()=>this.record());}
 measure(m){const font=this.config().fontSize;if(!m||!['number','trend','label'].every(k=>Number.isFinite(m[k])&&m[k]>0&&m[k]<1600))return;const old=this.measured[font];if(old&&Object.keys(m).every(k=>Math.abs(old[k]-m[k])<1))return;this.measured[font]=m;if(!this.gesture){this.apply();this.record();}}
};
