const {app,BrowserWindow,ipcMain,Tray,Menu,nativeImage,nativeTheme,safeStorage,globalShortcut,screen,powerMonitor,shell}=require('electron');
const fs=require('fs'),path=require('path'),http=require('http'),crypto=require('crypto');
const WidgetController=require('./widget-controller.cjs');
const {createUpdater}=require('./updater.cjs');let updater;
const OpticalGlass=require('./optical-glass.cjs');
const keepVisible=require('./keep-visible.cjs');
const {NotchBridge}=require('./notch-bridge.cjs');
const Garmin=require('./garmin.cjs');
const garmin=new Garmin(()=>{if(config)broadcast();});
// Preserve the 1.0 storage identity, including DPAPI secrets, despite the new product name.
app.setPath('userData',path.join(app.getPath('appData'),'nebel-glucose'));
app.setAppUserModelId('local.nebel.glucose');
const testMode=process.argv.includes('--smoke');
const webTest=process.argv.includes('--web-test');
const autoStarted=process.argv.includes('--autostart');
if(testMode)app.disableHardwareAcceleration();
if(process.env.NEBEL_DATA_DIR)app.setPath('userData',path.resolve(process.env.NEBEL_DATA_DIR));
let model,provider,config,feed={entries:[],error:null,kind:null,future:0,rejected:0,checkedAt:null},dashboard,overlay,tray,server,quitting=false,polling=false,generation=0,timer,visibilityTimer,webPort=17834,shortcutError=null,resizeStart=null;
const events=new Set(),webKey=crypto.randomBytes(32).toString('hex');
let configPath;
let notch,notchClosed=false,widget,controller,optical,taskbar,taskbarInfo={},taskbarProbe=false,taskbarChild;
function displays(){return screen.getAllDisplays().map(d=>({...d,autoHideEdges:taskbarInfo[d.id]||[]}));}
function probeTaskbars(){if(taskbarProbe||process.platform!=='win32')return;taskbarProbe=true;const data=displays().map(d=>({id:d.id,...screen.dipToScreenRect(null,d.bounds)}));taskbarChild=require('child_process').execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(fs.readFileSync(path.join(__dirname,'taskbar-info.ps1'),'utf8').replace('param([string]$Monitors)',"$Monitors='"+Buffer.from(JSON.stringify(data)).toString('base64')+"'"),'utf16le').toString('base64')],{windowsHide:true,timeout:10000},(err,out)=>{taskbarProbe=false;if(!err){try{taskbarInfo=JSON.parse(out);}catch{}}if(controller&&!controller.gesture)controller.apply();placeTaskbar();});}
function placeTaskbar(){if(!taskbar||taskbar.isDestroyed())return;const d=displays().find(d=>d.id===config.taskbarMonitor)||displays().find(d=>d.id===screen.getPrimaryDisplay().id);taskbar.setBounds(widget.taskbarBounds(d,config.unit==='mmol/L'?300:280,40));}
function syncTaskbar(){if(!config.taskbarVisible){taskbar?.hide();return;}if(!taskbar||taskbar.isDestroyed()){taskbar=new BrowserWindow({width:280,height:40,frame:false,transparent:true,hasShadow:false,roundedCorners:false,resizable:false,focusable:false,show:false,skipTaskbar:true,alwaysOnTop:true,title:'Haze · Anzeige an der Taskleiste',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});secureWindow(taskbar);taskbar.loadFile(path.join(__dirname,'../dist/index.html'),{query:{taskbar:'1'}});taskbar.once('ready-to-show',()=>{placeTaskbar();taskbar.setIgnoreMouseEvents(true);taskbar.setAlwaysOnTop(true,'screen-saver');taskbar.showInactive();broadcast();});}else{placeTaskbar();taskbar.showInactive();}}
// Fensterhintergrund passend zum Thema (gemeinsame Designsprache: Folio-Grau); Fensterknoepfe zeichnet die Seite als Glaspille
function titleTheme(){if(!dashboard||dashboard.isDestroyed())return;const dark=config.theme==='dark'||config.theme==='system'&&nativeTheme.shouldUseDarkColors;dashboard.setBackgroundColor(dark?'#1C1C1E':'#F2F2F4');}
function persist(){fs.mkdirSync(path.dirname(configPath),{recursive:true});fs.writeFileSync(configPath+'.tmp',JSON.stringify(config,null,2));fs.renameSync(configPath+'.tmp',configPath);}
function publicConfig(){const {secret,...safe}=config;return {...safe,hasToken:!!secret};}
function state(){return {config:publicConfig(),garmin:garmin.state,feed,systemDark:nativeTheme.shouldUseDarkColors,version:app.getVersion(),desktop:true,shortcutError,webPort,widgetFrame:controller?.frame,glassStatus:optical?.status,highContrast:nativeTheme.shouldUseHighContrastColors,displays:displays().map(d=>({id:d.id,label:d.label||'Monitor '+d.id})),overlayVisible:!!overlay?.isVisible(),update:updater?updater.state():{configured:false,status:'dev',message:''}};}
function broadcast(){notch?.update(feed,config);notch?.pulse(garmin.state,config);const s=state();for(const w of [dashboard,overlay,taskbar])if(w&&!w.isDestroyed())w.webContents.send('state',s);for(const res of events)res.write(`data: ${JSON.stringify(s)}\n\n`);}
function token(){if(!config.secret)return '';try{return safeStorage.decryptString(Buffer.from(config.secret,'base64'));}catch{throw Error('Lesetoken kann mit diesem Windows-Konto nicht entschlüsselt werden. Bitte neu eingeben.');}}
async function refresh(){if(polling)return;polling=true;const current=generation;try{const d=config.source==='demo'?provider.demoProvider():await provider.nightscout(config.url,token());if(current!==generation)return;feed={...d,error:null,kind:null,checkedAt:Date.now()};}catch(e){if(current===generation)feed={...feed,error:e.message,kind:e.kind||'credentials',checkedAt:Date.now()};}finally{polling=false;broadcast();if(current!==generation)refresh();}}
function areas(){const p=screen.getPrimaryDisplay();return [p,...screen.getAllDisplays().filter(d=>d.id!==p.id)].map(d=>d.workArea);}
function safeBounds(b){return model.clampBounds(b,areas(),config.view==='history'?{width:260,height:300}:{width:230,height:190});}
function secureWindow(w){w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith('file://'))e.preventDefault();});}
function openDashboard(settings=false){if(!dashboard||dashboard.isDestroyed()){
 dashboard=new BrowserWindow({width:1100,height:900,minWidth:400,minHeight:620,show:false,title:'Haze',titleBarStyle:'hidden',backgroundColor:'#1C1C1E',autoHideMenuBar:true,webPreferences:{backgroundThrottling:false,preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 titleTheme();
 secureWindow(dashboard);garmin.attach(dashboard);dashboard.loadFile(path.join(__dirname,'../dist/index.html'),{hash:settings?'settings':''});dashboard.once('ready-to-show',()=>dashboard.show());dashboard.on('close',e=>{if(!quitting){e.preventDefault();dashboard.hide();}});
 }else{if(settings)dashboard.webContents.send('open-settings');if(dashboard.isMinimized())dashboard.restore();if(dashboard.webContents.isLoading())dashboard.once('did-finish-load',()=>{dashboard.show();dashboard.focus();});else{dashboard.show();dashboard.focus();}}}
function openOverlay(){config.overlayVisible=true;if(!overlay||overlay.isDestroyed()){
 overlay=new BrowserWindow({width:250,height:140,frame:false,transparent:true,hasShadow:false,roundedCorners:false,thickFrame:false,resizable:false,maximizable:false,minimizable:false,focusable:false,show:false,skipTaskbar:true,alwaysOnTop:true,title:'Haze · Widget',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 secureWindow(overlay);overlay.setAlwaysOnTop(true,'screen-saver');optical=new OpticalGlass(overlay,{screen,config:()=>config,highContrast:()=>nativeTheme.shouldUseHighContrastColors,changed:broadcast});controller=new WidgetController(overlay,{geometry:widget,screen,config:()=>config,save:()=>{persist();broadcast();},onFrame:(b,s)=>optical?.frame(b,s),displays});overlay.loadFile(path.join(__dirname,'../dist/index.html'),{query:{overlay:'1'}});overlay.once('ready-to-show',()=>{controller.draw();overlay.showInactive();broadcast();});overlay.on('closed',()=>{overlay=null;controller=null;optical=null;});
 }else{overlay.showInactive();applyOverlay();broadcast();}persist();trayMenu();}
// Widget ein/aus: Tray-Menü und Doppelklick auf den Wert in der Notch
function toggleOverlay(){if(overlay?.isVisible()){overlay.hide();config.overlayVisible=false;persist();}else openOverlay();broadcast();trayMenu();}
function saveBounds(){controller?.record();}
function applyOverlay(){controller?.apply();titleTheme();syncTaskbar();}
function resetOverlay(){config.locked=false;config.clickThrough=false;config.dock=null;config.bounds=null;config.fontSize=48;config.alignment='auto';if(controller){controller.b=null;}openOverlay();applyOverlay();saveBounds();persist();broadcast();trayMenu();}
function registerShortcut(candidate){if(!candidate||candidate.length>100)throw Error('Bitte eine gültige Tastenkombination angeben.');if(candidate===config.shortcut&&globalShortcut.isRegistered(candidate))return;let ok=false;try{ok=globalShortcut.register(candidate,()=>toggleClick());}catch{}if(!ok)throw Error('Diese Tastenkombination ist belegt oder ungültig. Die bisherige Kombination bleibt aktiv.');if(config.shortcut!==candidate)globalShortcut.unregister(config.shortcut);shortcutError=null;}
function toggleClick(){config.clickThrough=!config.clickThrough;if(!config.clickThrough)config.locked=false;applyOverlay();persist();broadcast();trayMenu();}
function useProfile(name){if(!['Arbeit','Gaming'].includes(name))throw Error('Unbekanntes Profil');Object.assign(config,config.profiles[name],{profile:name});applyOverlay();persist();broadcast();trayMenu();}
function trayMenu(){if(!tray)return;tray.setContextMenu(Menu.buildFromTemplate([
 {label:'Dashboard öffnen',click:()=>openDashboard()},
 {label:overlay?.isVisible()?'Widget ausblenden':'Widget anzeigen',click:toggleOverlay},
 {label:'Anzeige an der Taskleiste',type:'checkbox',checked:config.taskbarVisible,click:()=>{config.taskbarVisible=!config.taskbarVisible;syncTaskbar();persist();broadcast();trayMenu();}},
 {label:'Profil',submenu:['Arbeit','Gaming'].map(n=>({label:n,type:'radio',checked:config.profile===n,click:()=>useProfile(n)}))},
 {label:'Durchklicken',type:'checkbox',checked:config.clickThrough,click:toggleClick},
 {label:'Position entsperren / Bearbeiten',click:()=>{config.locked=false;config.clickThrough=false;applyOverlay();persist();broadcast();trayMenu();}},
 {label:'Widget-Position und Größe zurücksetzen',click:resetOverlay},
 {label:'Vom Rand lösen',enabled:!!config.dock,click:()=>controller?.detach()},
 {label:'Einstellungen',click:()=>openDashboard(true)},{type:'separator'},
 {label:'Anwendung vollständig beenden',click:()=>{quitting=true;app.quit();}}
 ]));}
const allowedSettings=['unit','theme','showDelta','staleMinutes','snap','view','locked','clickThrough','overlayOnly','fontSize','alignment','surface','nativeGlass','glassBlur','glassOpacity','reduceMotion','taskbarVisible','taskbarMonitor','fluid','adhesion','detach','autoSize','widgetText','notch'];
function validateSettings(p){if('nativeGlass' in p&&typeof p.nativeGlass!=='boolean')throw Error('Ungültige Glaseinstellung');if('autoSize' in p&&typeof p.autoSize!=='boolean')throw Error('Ungültige Größeneinstellung');if('notch' in p&&typeof p.notch!=='boolean')throw Error('Ungültige Notch-Einstellung');if(p.widgetText&&!['auto','light','dark'].includes(p.widgetText))throw Error('Ungültige Schriftfarbe');if(p.detach&&!['fluid','direct','locked'].includes(p.detach))throw Error('Ungültiges Ablöseverhalten');for(const [k,lo,hi] of [['fontSize',20,120],['glassOpacity',.05,1],['glassBlur',0,18],['fluid',0,100],['adhesion',35,145]])if(k in p&&(!Number.isFinite(p[k])||p[k]<lo||p[k]>hi))throw Error('Ungültige Einstellung: '+k);if(p.alignment&&!['auto','horizontal','vertical'].includes(p.alignment))throw Error('Ungültige Ausrichtung');if(p.surface&&!['clear','glass'].includes(p.surface))throw Error('Ungültige Oberfläche');if(p.unit&&!['mg/dL','mmol/L'].includes(p.unit))throw Error('Ungültige Einheit');if(p.theme&&!['dark','light','system'].includes(p.theme))throw Error('Ungültiges Theme');if(p.view&&!['minimal','history'].includes(p.view))throw Error('Ungültige Ansicht');if(p.staleMinutes!==undefined&&(!Number.isFinite(p.staleMinutes)||p.staleMinutes<1||p.staleMinutes>60))throw Error('Frist muss zwischen 1 und 60 Minuten liegen.');}
async function action(type,p={}){switch(type){
 case 'settings':validateSettings(p);for(const k of allowedSettings)if(k in p)config[k]=p[k];if('shortcut' in p){registerShortcut(p.shortcut);config.shortcut=p.shortcut;}if('autoStart' in p){if(!app.isPackaged&&p.autoStart)throw Error('Autostart ist erst in der installierten App verfügbar.');app.setLoginItemSettings({name:'Nebel',openAtLogin:!!p.autoStart,path:process.execPath,args:['--autostart']});config.autoStart=!!p.autoStart;}applyOverlay();persist();break;
 case 'test':{if(p.source==='demo')return {ok:true,...provider.demoProvider()};try{return {ok:true,...await provider.nightscout(p.url,p.token||token())};}catch(e){return {ok:false,error:e.message,kind:e.kind};}}
 case 'connect':{if(!['demo','nightscout'].includes(p.source))throw Error('Unbekannte Quelle');let secret=config.secret;if(p.token!==undefined){if(p.token){if(!safeStorage.isEncryptionAvailable())throw Error('Windows-Schutz für Zugangsdaten ist nicht verfügbar.');secret=safeStorage.encryptString(p.token).toString('base64');}else secret=undefined;}config={...config,secret,source:p.source,url:p.url||config.url,configured:true};generation++;feed={entries:[],error:null,checkedAt:null,future:0,rejected:0};persist();refresh();break;}
 case 'refresh':refresh();break;
 case 'overlay':openOverlay();break;
 case 'hide-overlay':overlay?.hide();config.overlayVisible=false;persist();break;
 case 'dashboard':openDashboard(!!p.settings);break;
 case 'reset':resetOverlay();break;
 case 'profile':useProfile(p.name);break;
 case 'save-profile':saveBounds();config.profiles[config.profile]=Object.fromEntries(widget.profileKeys.map(k=>[k,config[k]]));persist();break;
 case 'click':toggleClick();break;
 case 'web':shell.openExternal(`http://127.0.0.1:${webPort}/`);break;
 case 'resize-start':controller?.start('resize',p.edge);return {ok:true};
 case 'drag-start':controller?.start('drag');return {ok:true};
 case 'gesture-move':controller?.move();return {ok:true};
 case 'gesture-end':controller?.end();return {ok:true};
 case 'widget-measure':controller?.measure(p);return {ok:true};
 case 'widget-motion':if(controller)controller.systemReduced=!!p.reduced;return {ok:true};
 case 'undock':controller?.detach();break;
 case 'quit':quitting=true;app.quit();break;
 case 'window':{if(!dashboard||dashboard.isDestroyed())return {ok:false};const op=p?.op;if(op==='minimize')dashboard.minimize();else if(op==='maximize'){if(dashboard.isMaximized())dashboard.unmaximize();else dashboard.maximize();}else if(op==='close')dashboard.close();return {ok:true};}
 case 'updates':return await updater.check();
 case 'install-update':return await updater.install();
 default:throw Error('Unbekannte Aktion');
 }broadcast();trayMenu();return {ok:true};}
function startWeb(){const root=path.resolve(__dirname,'../dist');server=http.createServer(async(req,res)=>{
 const host=req.headers.host;if(!host||!['127.0.0.1:'+webPort,'localhost:'+webPort].includes(host)){res.writeHead(403).end();return;}
 const origin=`http://${host}`;res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
 const u=new URL(req.url,origin);const authorized=req.headers.cookie?.split('; ').includes('nebel='+webKey);
 if(u.pathname.startsWith('/api/')){if(!authorized){res.writeHead(401).end();return;}if(req.headers.origin&&req.headers.origin!==origin){res.writeHead(403).end();return;}
 if(u.pathname==='/api/state'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(state()));return;}
 if(u.pathname==='/api/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});events.add(res);res.write(`data: ${JSON.stringify(state())}\n\n`);req.on('close',()=>events.delete(res));return;}
 if(u.pathname==='/api/action'&&req.method==='POST'){if(req.headers.origin!==origin||req.headers['content-type']!=='application/json'){res.writeHead(403).end();return;}let body='';for await(const b of req){body+=b;if(body.length>16000){res.writeHead(413).end();return;}}try{const {type,payload}=JSON.parse(body);if(['window','resize-start','drag-start','gesture-move','gesture-end','widget-measure','widget-motion','quit'].includes(type))throw Error('Diese Aktion ist hier nicht verfügbar.');const r=await action(type,payload);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(r));}catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}return;}res.writeHead(404).end();return;}
 if(req.method!=='GET'){res.writeHead(405).end();return;}if(req.headers['sec-fetch-site']==='cross-site'){res.writeHead(403).end();return;}
 if(u.pathname==='/')res.setHeader('Set-Cookie',`nebel=${webKey}; HttpOnly; SameSite=Strict; Path=/`);
 const file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
 });server.on('error',()=>{shortcutError='Lokale Webansicht konnte nicht gestartet werden (Port belegt).';broadcast();});server.listen(webPort,'127.0.0.1');}
if(!app.requestSingleInstanceLock())app.quit();else{
 app.on('second-instance',(_event,argv)=>{if(!argv.includes('--autostart'))openDashboard();});
 app.whenReady().then(async()=>{
 model=await import('../shared/model.mjs');widget=await import('../shared/widget.mjs');provider=await import('../shared/provider.mjs');configPath=path.join(app.getPath('userData'),'settings.json');updater=createUpdater({updater:app.isPackaged?require('electron-updater').autoUpdater:null,version:app.getVersion(),packaged:app.isPackaged,onChange:()=>broadcast(),beforeInstall:()=>{quitting=true;}});updater.start();let saved={};try{saved=JSON.parse(fs.readFileSync(configPath,'utf8'));}catch{}config=widget.migrate(saved,model.defaults());
 await garmin.load(path.join(app.getPath('userData'),'heart-rate.json'));
 if(testMode){config=widget.migrate({},model.defaults());config.configured=true;webPort=17835;}
 try{registerShortcut(config.shortcut);}catch(e){shortcutError=e.message;config.clickThrough=false;}
 ipcMain.handle('garmin',(e,type,p={})=>{if(e.sender!==dashboard?.webContents)throw Error('Nur im Dashboard verfügbar');if(type==='choose')garmin.choose(p.id);else if(type==='update')garmin.update(p);else throw Error('Unbekannte Aktion');return {ok:true};});
 ipcMain.handle('state',e=>{if(![dashboard?.webContents,overlay?.webContents,taskbar?.webContents].includes(e.sender))throw Error('Unbekanntes Fenster');return state();});
 ipcMain.handle('action',async(e,t,p)=>{if(![dashboard?.webContents,overlay?.webContents,taskbar?.webContents].includes(e.sender))throw Error('Unbekanntes Fenster');try{return await action(t,p);}catch(err){return {error:err.message};}});
 const icon=nativeImage.createFromPath(path.join(__dirname,'icon.png'));
 tray=new Tray(icon);tray.setToolTip('Haze · Glukose');tray.on('double-click',()=>openDashboard());trayMenu();
 nativeTheme.on('updated',()=>{titleTheme();broadcast();});
 powerMonitor.on('suspend',()=>optical?.suspend(true));powerMonitor.on('lock-screen',()=>optical?.suspend(true));powerMonitor.on('unlock-screen',()=>optical?.suspend(false));
 const updateDisplays=()=>{if(controller){controller.apply();controller.record();}placeTaskbar();probeTaskbars();broadcast();};
 screen.on('display-removed',updateDisplays);screen.on('display-added',updateDisplays);screen.on('display-metrics-changed',updateDisplays);powerMonitor.on('resume',()=>{optical?.suspend(false);updateDisplays();refresh();});
 visibilityTimer=setInterval(()=>keepVisible([overlay,taskbar]),1000);
 // Doppelklick auf den Graphen in der Notch -> Dashboard nach vorn (auch aus dem Tray oder minimiert).
 // Die Notch erlaubt diesem Prozess vorher AllowSetForegroundWindow, darum darf focus() hier wirklich nach vorn.
 if(!testMode&&!webTest){notch=new NotchBridge({model,open:app.isPackaged?process.execPath:undefined});notch.listen(()=>openDashboard(),()=>toggleOverlay());}
 startWeb();refresh();timer=setInterval(()=>{if(feed.error||!feed.checkedAt||Date.now()-feed.checkedAt>=60000)refresh();notch?.update(feed,config);notch?.pulse(garmin.state,config);},5000);
 if(!webTest){if(config.overlayOnly&&config.configured&&autoStarted)openOverlay();else openDashboard();if(config.overlayVisible||testMode)openOverlay();syncTaskbar();probeTaskbars();if(app.isPackaged&&config.autoStart)app.setLoginItemSettings({name:'Nebel',openAtLogin:true,path:process.execPath,args:['--autostart']});}
 });
 app.on('window-all-closed',()=>{});
 // Remove the value from the Notch before exiting (bounded wait; ttl cleans up otherwise).
 app.on('will-quit',e=>{if((notch?.active||notch?.pulseActive)&&!notchClosed){e.preventDefault();notchClosed=true;Promise.race([Promise.all([notch.remove(),notch.removePulse()]),new Promise(r=>setTimeout(r,800))]).finally(()=>app.exit(0));}});
 app.on('before-quit',()=>{quitting=true;garmin.save();optical?.dispose();controller?.cancel();taskbarChild?.kill();clearInterval(timer);clearInterval(visibilityTimer);globalShortcut.unregisterAll();for(const r of events)r.end();server?.close();tray?.destroy();});
}


