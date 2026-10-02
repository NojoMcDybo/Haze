const fs=require('fs');
// Same logic as shared/garmin.mjs (ESM); loaded lazily because this file is CommonJS.
let heart;import('../shared/garmin.mjs').then(m=>{heart=m;});
module.exports=class Garmin {
  constructor(changed){this.changed=changed;this.history=[];this.state={connected:false,reading:null,devices:[],scanning:false,name:'',history:[]};}
  // Pulse history is kept for 24 hours in the local user data folder and never leaves the PC.
  async load(file){this.file=file;heart??=await import('../shared/garmin.mjs');try{this.history=heart.restoreHeartHistory(JSON.parse(fs.readFileSync(file,'utf8')));}catch{this.history=[];}this.publish();this.timer=setInterval(()=>this.save(),60000);this.timer.unref?.();}
  save(){if(!this.file||!this.dirty)return;try{fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.history.map(({time,bpm,n})=>({time,bpm,n}))));fs.renameSync(this.file+'.tmp',this.file);this.dirty=false;}catch{}}
  publish(){this.state.history=heart?heart.publicHeartHistory(this.history):[];}
  attach(win){
    win.webContents.on('select-bluetooth-device',(event,devices,callback)=>{
      event.preventDefault();this.select=callback;this.state.scanning=true;
      this.state.devices=devices.map(d=>({id:d.deviceId,name:d.deviceName||'Unbenannter Pulssensor'}));
      if(!this.timeout)this.timeout=setTimeout(()=>this.choose(''),30000);
      this.changed();
    });
    win.webContents.on('render-process-gone',()=>this.reset());
    win.on('closed',()=>this.reset());
  }
  choose(id){
    if(id&&!this.state.devices.some(d=>d.id===id))throw Error('Gerät nicht mehr verfügbar');
    const cb=this.select;this.select=null;clearTimeout(this.timeout);this.timeout=null;
    this.state.devices=[];this.state.scanning=false;cb?.(id||'');this.changed();
  }
  update(p){
    if(p.kind==='status'){
      this.state.connected=p.connected===true;this.state.name=String(p.name||'').slice(0,100);
      this.state.reading=null;
    }else if(p.kind==='reading'){
      if(!this.state.connected||!Number.isInteger(p.bpm)||p.bpm<1||p.bpm>300)throw Error('Ungültige Pulsmessung');
      const at=Date.now();if(heart){heart.recordHeartRate(this.history,p.bpm,at,typeof p.contact==='boolean'?p.contact:null);this.dirty=true;this.publish();}
      this.state.reading={bpm:p.bpm,at,contact:typeof p.contact==='boolean'?p.contact:null,energyKj:Number.isInteger(p.energyKj)&&p.energyKj>=0&&p.energyKj<=65535?p.energyKj:null,rrMs:Array.isArray(p.rrMs)?p.rrMs.filter(n=>Number.isFinite(n)&&n>0&&n<64000).slice(0,32):[]};
    }else throw Error('Unbekannte Garmin-Nachricht');
    this.changed();
  }
  reset(){this.choose('');this.state.connected=false;this.state.reading=null;this.changed();}
};
