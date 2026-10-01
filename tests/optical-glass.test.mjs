import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Glass=require('../desktop/optical-glass.cjs');
test('Native glass lifecycle: geometry only, retries, off, hide, contrast, dispose',()=>{
 let visible=true,contrast=false,now=0,creates=0,destroys=0,sets=0,fail=false,last;
 const config={surface:'glass',nativeGlass:true,glassOpacity:.05,glassBlur:3};
 const native={create:()=>{creates++;return 0},configure:(...args)=>{sets++;last=args;return 0},tick:()=>({error:fail?-1:0,frames:3}),destroy:()=>destroys++};
 const g=new Glass({isDestroyed:()=>false,isVisible:()=>visible,on:()=>{},getNativeWindowHandle:()=>Buffer.alloc(8)},{screen:{dipToScreenRect:(_,b)=>({...b,width:b.width*2,height:b.height*2})},config:()=>config,highContrast:()=>contrast,load:()=>native,clock:()=>now});
 try{
 g.frame({x:10,y:10,width:100,height:100},{width:100,height:100,path:'test',polygon:[[0,0],[100,0],[100,100],[0,100]]});g.tick();
 assert.equal(g.status.active,true);assert.deepEqual(last.slice(4,5),[[0,0,200,0,200,200,0,200]]);g.tick();assert.equal(sets,1);
 config.glassBlur=4;g.tick();assert.equal(sets,2);
 fail=true;g.tick();assert.equal(g.status.active,false);assert.equal(destroys,1);g.tick();assert.equal(creates,1);
 now=5001;fail=false;g.tick();assert.equal(creates,2);
 visible=false;g.tick();assert.equal(destroys,2);visible=true;g.tick();
 contrast=true;g.tick();assert.equal(destroys,3);contrast=false;config.glassOpacity=1;g.tick();assert.equal(creates,3);
 config.glassOpacity=.05;g.tick();g.suspend(true);assert.equal(g.status.active,false);g.suspend(false);g.tick();
 config.nativeGlass=false;g.tick();assert.equal(g.status.active,false);
 }finally{g.dispose();}assert.equal(g.closed,true);
});
