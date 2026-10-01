module.exports=class Garmin {
  constructor(changed){this.changed=changed;this.state={connected:false,reading:null,devices:[],scanning:false,name:''};}
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
      this.state.reading={bpm:p.bpm,at:Date.now(),contact:typeof p.contact==='boolean'?p.contact:null,energyKj:Number.isInteger(p.energyKj)&&p.energyKj>=0&&p.energyKj<=65535?p.energyKj:null,rrMs:Array.isArray(p.rrMs)?p.rrMs.filter(n=>Number.isFinite(n)&&n>0&&n<64000).slice(0,32):[]};
    }else throw Error('Unbekannte Garmin-Nachricht');
    this.changed();
  }
  reset(){this.choose('');this.state.connected=false;this.state.reading=null;this.changed();}
};
