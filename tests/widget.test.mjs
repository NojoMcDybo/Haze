import {test} from 'node:test';import assert from 'node:assert/strict';
import * as g from '../shared/widget.mjs';import {defaults} from '../shared/model.mjs';import Controller from '../desktop/widget-controller.cjs';
const display={id:1,bounds:{x:0,y:0,width:1920,height:1080},workArea:{x:0,y:0,width:1920,height:1040}};
test('Migration ist idempotent und erhält Secret, Profile, Grenzen und Kennungen',()=>{const saved={secret:'encrypted-example',autoStart:true,bounds:{x:200,y:40,width:300,height:180},profiles:{Gaming:{locked:true,theme:'light',bounds:{x:80,y:20,width:220,height:190}}}};const c=g.migrate(saved,defaults());assert.equal(c.secret,saved.secret);assert.equal(c.autoStart,true);assert.deepEqual(c.bounds,saved.bounds);assert.equal(c.profiles.Gaming.theme,'light');assert.equal(c.profiles.Gaming.fontSize,48);assert.deepEqual(g.migrate(c,defaults()),c);});
test('Andockzone, Monitorübergänge, Taskleisten- und Auto-Hide-Abstand',()=>{let b={x:500,y:15,width:250,height:140};assert.equal(g.nearest(b,display,[display]).edge,'top');assert.equal(g.nearest({...b,y:17},display,[display]),null);const peer={id:2,bounds:{x:1920,y:0,width:1920,height:1080},workArea:{x:1920,y:0,width:1920,height:1040}};assert.equal(g.nearest({x:1670,y:500,width:250,height:140},display,[display,peer]),null);const t=g.dockTarget(b,display,'bottom');assert.equal(t.y+t.height,1040);const hidden={...display,workArea:display.bounds,autoHideEdges:['bottom']};assert.equal(g.boundary(hidden).height,1078);const bar=g.taskbarBounds(hidden);assert.ok(bar.y+bar.height<1078);});
test('Ausrichtung nutzt Hysterese; gemessene Schrift bestimmt Mindestmaß',()=>{const c={alignment:'auto'};assert.equal(g.orientation(c,{width:100,height:100},'horizontal'),'horizontal');assert.equal(g.orientation(c,{width:100,height:100},'vertical'),'vertical');assert.equal(g.orientation(c,{width:80,height:100},'horizontal'),'vertical');assert.equal(g.orientation(c,{width:120,height:100},'vertical'),'horizontal');for(const layout of ['horizontal','vertical']){const min=g.minimum(48,layout,{number:120,trend:40,label:170});assert.ok(min.width>=214);assert.ok(min.height>=120);}});

const area=display.workArea;
test('Fluide Kontur: an allen Kanten bündig, Schultern breiter als der Körper, Region ohne Ecken',()=>{for(const e of g.edges){const side=e==='left'||e==='right',w=side?140:260,h=side?240:120;
 const body={x:e==='right'?area.width-w:e==='left'?0:600,y:e==='bottom'?area.height-h:e==='top'?0:400,width:w,height:h},anchor=side?body.y+h/2:body.x+w/2;
 const s=g.fluid(body,e,anchor,0,100,1),b=s.bounds;
 const touch=e==='top'?b.y:e==='bottom'?area.height-(b.y+b.height):e==='left'?b.x:area.width-(b.x+b.width);assert.ok(Math.abs(touch)<1e-6,e+' touches edge');
 const span=side?b.height:b.width,along=side?h:w;assert.ok(span>along+10,e+' has concave shoulders');
 const local=g.place(s,Math.floor(b.x),Math.floor(b.y),Math.ceil(b.width)+1,Math.ceil(b.height)+1);assert.ok(local.path.startsWith('M ')&&local.path.includes(' C ')&&local.path.includes(' Q '));
 const rects=g.region(local.polygon,local.width,local.height);assert.ok(rects.length>0);
 const free=g.fluid(body,null),fl=g.place(free,body.x,body.y,w,h),fr=g.region(fl.polygon,w,h);assert.ok(!fr.some(r=>r.x===0&&r.y===0),'free corner transparent');
 assert.ok(s.polygon.length<2048);}});
test('Hals verjüngt sich mit dem Abstand und bleibt am Körper',()=>{const body=w=>({x:600,y:w,width:260,height:120});const width=gap=>{const s=g.fluid(body(gap),'top',730,gap,100,1);const xs=s.polygon.filter(p=>Math.abs(p[1])<1e-6).map(p=>p[0]);return Math.max(...xs)-Math.min(...xs);};
 const a=width(0),b=width(40),c=width(100);assert.ok(a>b&&b>c,`${a} ${b} ${c}`);assert.ok(c<=2.5);
 const far=g.fluid(body(10),'top',5000,10,100,1);assert.ok(Math.max(...far.polygon.map(p=>p[0]))<=860+130+.9*25+1,'anchor clamped to body footprint');});
function fixture(edge,{reduce=false,fluid=55,adhesion=103,extra=[]}={}){let cursor={x:0,y:0},now=1000;const c=g.migrate({},defaults());c.reduceMotion=reduce;c.fluid=fluid;c.adhesion=adhesion;c.snap=true;
 c.bounds={x:800,y:400,width:260,height:150};if(edge){c.bounds=g.dockTarget(c.bounds,display,edge);c.dock={edge,monitor:1};}
 const frames=[],ds=[display,...extra];const win={webContents:{on(){},send(t,f){frames.push(f);}},on(){},isDestroyed(){return false},getBounds(){return c.bounds},setBounds(b){win.bounds=b},setShape(r){win.shape=r},setResizable(){},setMovable(){},setIgnoreMouseEvents(){}};
 const w=new Controller(win,{geometry:g,screen:{getCursorScreenPoint:()=>cursor,getDisplayMatching:r=>ds.find(d=>r.x>=d.bounds.x&&r.x<d.bounds.x+d.bounds.width)||display},config:()=>c,save(){},displays:()=>ds,clock:()=>now});
 return {c,w,win,frames,cursor:p=>{cursor=p},time:ms=>{now+=ms}};}
const out={top:[0,1],bottom:[0,-1],left:[1,0],right:[-1,0]};
function settle(w,ms=3000){w.cancel();for(let t=0;t<ms;t+=16)if(!w.step(.016))return t;return ms;}
test('Alle vier Kanten: Hals dehnt sich, reißt nach der Haftstrecke, haftet wieder an',()=>{for(const edge of g.edges){const f=fixture(edge),w=f.w,[ux,uy]=out[edge],L=w.limit(),c0={...w.c};
 f.cursor(c0);w.start('drag');
 f.cursor({x:c0.x+ux*L*.45,y:c0.y+uy*L*.45});w.move();assert.equal(w.edge,edge,'still attached');assert.ok(w.gapTo(edge)>0);assert.ok(f.win.bounds.width>0);
 const shape=f.frames.at(-1);assert.ok(shape.path.includes(' C '));
 f.cursor({x:c0.x+ux*(L+35),y:c0.y+uy*(L+35)});w.move();assert.equal(w.edge,null,'peeled');assert.equal(f.c.dock,null);assert.ok(w.bounceV>0,'stretch kick');
 f.cursor({x:c0.x+ux*10,y:c0.y+uy*10});w.move();assert.equal(w.edge,null,'cooldown prevents instant re-attach');
 f.time(300);w.move();assert.equal(w.edge,edge,'re-attached');assert.ok(w.attach<.2,'neck grows in');
 w.end();assert.equal(f.c.dock.edge,edge);assert.ok(w.bounceV<0,'squash kick');
 const t=settle(w);assert.ok(t<3000,'settles');assert.ok(Math.abs(w.gapTo(edge))<.01,'rests on edge');assert.equal(w.attach,1);w.cancel();}});
test('Freies Ziehen bleibt im Arbeitsbereich; Loslassen ohne Kante federt nicht an den Rand',()=>{const f=fixture(null),w=f.w,c0={...w.c};f.cursor(c0);w.start('drag');f.cursor({x:c0.x-5000,y:c0.y});w.move();assert.equal(w.edge,'left','pulled into zone');f.cursor({x:c0.x-200,y:c0.y});f.time(400);w.move();assert.equal(w.edge,null);w.end();assert.equal(f.c.dock,null);settle(w);assert.ok(w.b.x>=area.x&&w.b.x+w.b.width<=area.x+area.width);w.cancel();});
test('Reduzierte Bewegung: gleiche Endform ohne Federn und ohne Timer',()=>{for(const edge of g.edges){const f=fixture(edge,{reduce:true}),w=f.w,[ux,uy]=out[edge],L=w.limit(),c0={...w.c};f.cursor(c0);w.start('drag');f.cursor({x:c0.x+ux*(L+40),y:c0.y+uy*(L+40)});w.move();assert.equal(w.edge,null);f.time(300);f.cursor({x:c0.x+ux*5,y:c0.y+uy*5});w.move();assert.equal(w.attach,1);w.end();assert.equal(w.animating,false);assert.ok(Math.abs(w.gapTo(edge))<.01);assert.equal(w.bounce,0);}});
test('Haftstrecke und Flüssigkeit bestimmen die Abrissdistanz',()=>{const a=fixture('top',{adhesion:35,fluid:0}).w.limit(),b=fixture('top',{adhesion:145,fluid:100}).w.limit();assert.equal(a,17.5);assert.equal(b,174);});
test('Keine Andockkante zwischen zwei Monitoren',()=>{const peer={id:2,bounds:{x:1920,y:0,width:1920,height:1080},workArea:{x:1920,y:0,width:1920,height:1040}};const f=fixture(null,{extra:[peer]}),w=f.w,c0={...w.c};f.cursor(c0);w.start('drag');f.cursor({x:1919-(w.b.width/2-c0.x+c0.x)+ (c0.x-c0.x),y:c0.y});f.cursor({x:c0.x+(1920-w.b.width/2-c0.x)-5,y:c0.y});w.move();assert.equal(w.edge,null);w.end();w.cancel();});
test('Schriftgröße ändert die Mindestgröße, angedockte Kante bleibt',()=>{for(const edge of g.edges){const f=fixture(edge,{reduce:true}),w=f.w;f.c.fontSize=110;w.apply();assert.ok(Math.abs(w.gapTo(edge))<.01);assert.ok(w.b.width>=g.minimum(110,w.layout).width-1);}});
test('Fenster bleibt eine feste Bühne; die Region folgt der Kontur',()=>{const f=fixture('top'),w=f.w,c0={...w.c},shapes=[];f.win.setShape=r=>shapes.push(r);f.cursor(c0);w.start('drag');
 const stage=[];for(const dy of [10,30,60,80]){f.cursor({x:c0.x+dy,y:c0.y+dy});w.move();stage.push(JSON.stringify(f.win.bounds));}
 assert.equal(new Set(stage).size,1,'no window moves during drag');assert.deepEqual(JSON.parse(stage[0]),area);assert.deepEqual(shapes.at(-1),[]);
 w.end();settle(w);w.draw();assert.deepEqual(f.win.bounds,area,'window stays');const r=shapes.at(-1);assert.ok(r.length>0);const xs=r.map(q=>q.x),ys=r.map(q=>q.y);assert.ok(Math.max(...r.map(q=>q.x+q.width))-Math.min(...xs)<area.width/2,'region hugs shape');w.cancel();});
test('Kurze Haftstrecke: kein Abreißen-Andocken-Flattern',()=>{const f=fixture('top',{adhesion:35,fluid:0}),w=f.w,c0={...w.c};f.cursor(c0);w.start('drag');let flips=0,last=w.edge;for(let i=1;i<=60;i++){f.time(50);f.cursor({x:c0.x,y:c0.y+i*.5});w.move();if(w.edge!==last){flips++;last=w.edge;}}assert.ok(flips<=1,'flips '+flips);w.cancel();});
test('Textfeld liegt auf der Bühne und in Ruhe an derselben Bildschirmstelle',()=>{const f=fixture(null),w=f.w,c0={...w.c};const abs=()=>{const fr=f.frames.at(-1),b=f.win.bounds;return [Math.round(b.x+fr.body.left),Math.round(b.y+fr.body.top)];};const rest=abs();f.cursor(c0);w.start('drag');w.move();assert.deepEqual(abs(),rest);w.cancel();});
test('Ablösemodus Direkt: löst sofort ohne Hals, dockt erst beim Loslassen',()=>{for(const edge of g.edges){const f=fixture(edge),w=f.w,[ux,uy]=out[edge],c0={...w.c};f.c.detach='direct';f.cursor(c0);w.start('drag');
 f.cursor({x:c0.x+ux*8,y:c0.y+uy*8});w.move();assert.equal(w.edge,null,edge+' leaves at once');f.time(400);
 f.cursor({x:c0.x+ux*5,y:c0.y+uy*5});w.move();assert.equal(w.edge,null,'no neck while dragging');
 w.end();assert.equal(f.c.dock?.edge,edge,'snaps on release');settle(w);assert.ok(Math.abs(w.gapTo(edge))<.01);w.cancel();}});
test('Ablösemodus Gesperrt: gleitet am Rand, reißt nie ab, löst per Befehl',()=>{for(const edge of g.edges){const f=fixture(edge),w=f.w,[ux,uy]=out[edge],c0={...w.c};f.c.detach='locked';f.cursor(c0);w.start('drag');
 f.cursor({x:c0.x+ux*400+uy*60,y:c0.y+uy*400+ux*60});w.move();assert.equal(w.edge,edge);assert.ok(Math.abs(w.gapTo(edge))<.01,'stays on edge');
 const along=edge==='top'||edge==='bottom'?w.c.x-c0.x:w.c.y-c0.y;assert.ok(Math.abs(Math.abs(along)-60)<.01,'slides along');
 w.end();assert.equal(f.c.dock.edge,edge);w.detach();assert.equal(f.c.dock,null);w.cancel();}});
test('Rahmen folgt der Schriftgröße (automatische Größe), manuell bleibt die eigene Größe',()=>{const f=fixture(null,{reduce:true}),w=f.w;const sizes=[];for(const font of [30,48,90]){f.c.fontSize=font;w.apply();sizes.push(w.b.width);assert.deepEqual([w.b.width,w.b.height],[g.minimum(font,w.layout).width,g.minimum(font,w.layout).height]);}assert.ok(sizes[0]<sizes[1]&&sizes[1]<sizes[2]);
 const before=w.gesture;w.start('resize','se');assert.equal(w.gesture,before,'resize ignored with auto size');f.c.autoSize=false;f.c.bounds={x:800,y:400,width:600,height:300};w.apply();assert.equal(w.b.width,600);});
test('Einfacher Klick auf das angedockte Widget federt nicht und löst nicht',()=>{const f=fixture('top'),w=f.w,c0={...w.c};f.cursor({x:c0.x+1,y:c0.y+1});w.start('drag');w.move();w.end();assert.equal(w.bounceV,0);assert.equal(f.c.dock.edge,'top');assert.deepEqual(w.c,c0);w.cancel();});
