import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {EventEmitter} from 'node:events';
const require=createRequire(import.meta.url),{createUpdater}=require('../desktop/updater.cjs');
function fake({available=null,fail=null}={}){const u=new EventEmitter();u.installed=null;
 u.checkForUpdates=async()=>{u.emit('checking-for-update');if(fail){u.emit('error',Error(fail));throw Error(fail);}u.emit(available?'update-available':'update-not-available',{version:available});};
 u.downloadUpdate=async()=>{u.emit('download-progress',{percent:42.4});u.emit('update-downloaded');};
 u.quitAndInstall=(silent,run)=>{u.installed={silent,run};};return u;}
test('Updater: nichts ungefragt, keine automatische Installation beim Beenden',()=>{const u=fake();createUpdater({updater:u,version:'1.3.0'});assert.equal(u.autoDownload,false);assert.equal(u.autoInstallOnAppQuit,false);assert.equal(u.allowDowngrade,false);});
test('Updater: neue Version wird gemeldet, Installieren lädt und startet still neu',async()=>{const u=fake({available:'1.3.1'}),seen=[];let quit=false;
 const up=createUpdater({updater:u,version:'1.3.0',onChange:s=>seen.push(s.status),beforeInstall:()=>{quit=true;}});
 const s=await up.check();assert.equal(s.status,'available');assert.equal(s.message,'Haze 1.3.1 ist verfügbar (installiert: 1.3.0).');assert.equal(u.installed,null);
 await up.install();assert.deepEqual(u.installed,{silent:true,run:true});assert.equal(quit,true);assert.ok(seen.includes('downloading'));assert.equal(up.state().status,'installing');});
test('Updater: aktuell, Fehler und Entwicklungsmodus',async()=>{
 assert.equal((await createUpdater({updater:fake(),version:'1.3.0'}).check()).message,'Haze 1.3.0 ist aktuell.');
 const e=await createUpdater({updater:fake({fail:'net::ERR_INTERNET_DISCONNECTED\nmehr'}),version:'1.3.0'}).check();assert.equal(e.status,'error');assert.equal(e.message,'Update-Prüfung fehlgeschlagen: net::ERR_INTERNET_DISCONNECTED');
 const up=createUpdater({updater:fake({available:'9.9.9'}),version:'1.3.0',packaged:false});assert.equal((await up.check()).status,'dev');assert.equal((await up.install()).error,'Kein Update zum Installieren.');});
test('Updater: Installieren ohne verfügbares Update tut nichts',async()=>{const u=fake();const up=createUpdater({updater:u,version:'1.3.0'});assert.equal((await up.install()).error,'Kein Update zum Installieren.');assert.equal(u.installed,null);});
