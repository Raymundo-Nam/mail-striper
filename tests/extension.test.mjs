import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile('extension/background.js','utf8');
function runtime(){
  let origins=[],scripts=[],frames=[];const events={},injections=[],messages=[];
  const event=name=>({addListener:fn=>events[name]=fn});
  const chrome={
    permissions:{getAll:async()=>({origins}),contains:async({origins:asked})=>asked.every(o=>origins.includes(o)),onAdded:event('added'),onRemoved:event('removed')},
    scripting:{getRegisteredContentScripts:async()=>scripts,registerContentScripts:async value=>scripts=value,updateContentScripts:async value=>scripts=value,unregisterContentScripts:async()=>scripts=[],executeScript:async value=>{injections.push(value);return frames;}},
    tabs:{query:async()=>[],sendMessage:async(...args)=>{messages.push(args);return {ok:true};}},
    runtime:{onInstalled:event('installed'),onStartup:event('startup'),onMessage:event('message')},
  };
  vm.runInNewContext(source,{chrome,URL});
  const message=(data,sender={})=>new Promise(resolve=>events.message(data,sender,resolve));
  return {events,message,injections,messages,setOrigins:value=>origins=value,setFrames:value=>frames=value,get scripts(){return scripts;}};
}
test('activation registers granted hosts including related mail frames',async()=>{const r=runtime();r.setOrigins(['https://mail.example.com/*']);assert.equal((await r.message({type:'activate',tabId:12})).ok,true);assert.equal(r.scripts[0].matches.length,1);assert.equal(r.scripts[0].matches[0],'https://mail.example.com/*');assert.equal(r.scripts[0].matchOriginAsFallback,true);assert.equal(r.injections[0].target.tabId,12);assert.equal(r.injections[0].target.allFrames,true);});
test('a content script cannot ask to inject another tab',()=>{const r=runtime();const kept=r.events.message({type:'activate',tabId:12},{tab:{id:3}},()=>{});assert.equal(kept,undefined);assert.equal(r.injections.length,0);});
test('host permission check rejects ungranted sites and browser settings',async()=>{const r=runtime();r.setOrigins(['https://mail.example.com/*']);assert.equal(await r.message({type:'site-enabled'},{url:'https://mail.example.com/inbox'}),true);assert.equal(await r.message({type:'site-enabled'},{url:'https://other.example.com'}),false);assert.equal(await r.message({type:'site-enabled'},{url:'chrome://extensions'}),false);});
test('revocation removes the persisted content script registration',async()=>{const r=runtime();r.setOrigins(['https://mail.example.com/*']);await r.events.installed();assert.equal(r.scripts.length,1);r.setOrigins([]);await r.events.removed();assert.equal(r.scripts.length,0);});
test('related frames require a granted sender origin, never just the top page URL',async()=>{
  const r=runtime();r.setOrigins(['https://mail.example.com/*']);
  assert.equal(await r.message({type:'site-enabled'},{url:'about:blank',origin:'https://mail.example.com',tab:{url:'https://mail.example.com'}}),true);
  assert.equal(await r.message({type:'site-enabled'},{url:'about:blank',origin:'null',tab:{url:'https://mail.example.com'}}),false);
});
test('page reports combine current frame results without carrying an old mail forward',async()=>{
  const r=runtime();const finding={url:'https://ligdaa.com',text:'https://ligdna.com',level:'danger',findings:[]};
  r.setFrames([{frameId:0,documentId:'top',result:{scanned:19,danger:0,caution:0,limited:false,findings:[]}},{frameId:4,documentId:'mail',result:{scanned:1,danger:1,caution:0,limited:false,findings:[finding]}},{frameId:8,result:null}]);
  const first=await r.message({type:'page-report',tabId:12});assert.equal(first.scanned,20);assert.equal(first.danger,1);assert.equal(first.findings[0].documentId,'mail');assert.equal(first.findings[0].frameId,4);
  r.setFrames([{frameId:0,result:{scanned:19,danger:0,caution:0,limited:false,findings:[]}},{frameId:5,result:{scanned:2,danger:0,caution:0,limited:false,findings:[]}}]);
  const second=await r.message({type:'page-report',tabId:12});assert.equal(second.scanned,21);assert.equal(second.danger,0);assert.equal(second.findings.length,0);
  assert.equal(r.injections.length,2);assert.equal(r.injections[1].target.allFrames,true);
});
test('a content script reads and locates findings only in its own tab, using the exact document',async()=>{
  const r=runtime();r.setFrames([]);await r.message({type:'page-report',tabId:99},{tab:{id:12}});assert.equal(r.injections[0].target.tabId,12);
  await r.message({type:'locate-finding',tabId:99,finding:{documentId:'mail',frameId:4,url:'https://ligdaa.com',text:'https://ligdna.com'}},{tab:{id:12}});
  assert.equal(r.messages[0][0],12);assert.equal(r.messages[0][2].documentId,'mail');assert.equal(r.messages[0][2].frameId,undefined);
});
