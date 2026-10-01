const path=require('path');
// No glucose values or credentials cross this boundary: geometry only.
module.exports=class OpticalGlass {
 constructor(win,{screen,config,highContrast,changed,load,clock=Date.now}) {
  Object.assign(this,{win,screen,config,highContrast,changed,clock});
  this.load=load||(()=>require(process.resourcesPath&&process.defaultApp!==true?path.join(process.resourcesPath,'haze-glass.node'):path.join(__dirname,'native-glass/haze-glass.node')));
  this.status={active:false,message:'Glas wartet auf das Widget.'};this.live=false;this.suspended=false;this.nextRetry=0;this.pending=null;this.lastKey='';
  this.timer=setInterval(()=>this.tick(),33);
  win.on('hide',()=>this.stop('Widget ausgeblendet.'));
  win.on('closed',()=>this.dispose());
 }
 report(active,message){if(this.status.active===active&&this.status.message===message)return;this.status={active,message};this.changed?.();}
 frame(bounds,shape){this.pending={bounds,shape};}
 stop(message){if(this.live){try{this.native.destroy();}catch{}this.live=false;}this.lastKey='';this.report(false,message);}
 fail(){this.stop('Glas vorübergehend nicht verfügbar; transparente Anzeige bleibt aktiv.');this.nextRetry=this.clock()+5000;}
 tick(){
  if(this.closed||this.win.isDestroyed())return;
  const c=this.config();
  if(this.suspended||!this.win.isVisible()||c.surface!=='glass'||!c.nativeGlass||c.glassOpacity>=1||this.highContrast()){
   this.stop(this.highContrast()?'Kontrastmodus: deckende Anzeige.':c.glassOpacity>=1?'Deckende Anzeige.':'Hintergrundbrechung ausgeschaltet.');return;
  }
  if(!this.pending||this.clock()<this.nextRetry)return;
  try{
   const {bounds,shape}=this.pending,physical=this.screen.dipToScreenRect(this.win,bounds),{x,y,width:w,height:h}=physical;
   if(w<1||h<1||w>2048||h>2048){this.stop('Glas für diese Fenstergröße nicht verfügbar.');return;}
   if(!this.native)this.native=this.load();
   if(!this.live){if(this.native.create(this.win.getNativeWindowHandle())<0){this.fail();return;}this.live=true;this.lastKey='';}
   const key=JSON.stringify([physical,shape.path,c.glassBlur,c.glassOpacity]);
   if(key!==this.lastKey){
    const polygon=shape.polygon.flatMap(([px,py])=>[px*w/shape.width,py*h/shape.height]);
    if(this.native.configure(x,y,w,h,polygon,c.glassBlur,1-c.glassOpacity)<0){this.fail();return;}
    this.lastKey=key;
   }
   const result=this.native.tick();
   if(result.error<0){this.fail();return;}
   this.report(result.frames>0,result.frames>0?'Farbloses Glas aktiv · lokale Hintergrundbrechung.':'Glas wartet auf ein Hintergrundbild.');
  }catch{this.fail();}
 }
 suspend(value){this.suspended=value;if(value)this.stop('Glas pausiert.');else this.nextRetry=0;}
 dispose(){if(this.closed)return;this.closed=true;clearInterval(this.timer);this.stop('Glas beendet.');}
};
