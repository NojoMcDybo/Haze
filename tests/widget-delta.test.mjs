import {test} from 'node:test';
import assert from 'node:assert/strict';
import {widgetDelta} from '../shared/model.mjs';
test('Widget shows signed changes in selected units and suppresses stale or missing comparisons',()=>{
 const now=2000000, pair=(v,t=now-300000)=>[{time:t,value:100},{time:now,value:v}];
 for(const [v,text] of [[105,'+5'],[100,'±0'],[97,'−3']])assert.equal(widgetDelta(pair(v),'mg/dL',now).text,text);
 assert.equal(widgetDelta(pair(118),'mmol/L',now).text,'+1,0');
 assert.equal(widgetDelta(pair(99.9),'mmol/L',now).text,'±0,0');
 assert.equal(widgetDelta(pair(105),'mg/dL',now+600001),null);
 assert.equal(widgetDelta(pair(105,now-1200001),'mg/dL',now),null);
 assert.equal(widgetDelta(pair(105,now),'mg/dL',now),null);
 assert.equal(widgetDelta([],'mg/dL',now),null);
});
