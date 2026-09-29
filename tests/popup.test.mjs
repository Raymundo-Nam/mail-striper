import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const html=await readFile('extension/popup.html','utf8'),source=await readFile('extension/popup.js','utf8');
test('an open popup rereads live counts even when the page URL stays the same',async()=>{
  const dom=new JSDOM(html,{url:'https://extension.example/popup.html',runScripts:'outside-only'}),win=dom.window;
  let report={scanned:20,danger:1,caution:0},poll,reads=0;
  win.setTimeout=callback=>{poll=callback;return 1;};win.clearTimeout=()=>{};
  win.chrome={permissions:{contains:async()=>true,getAll:async()=>({origins:['https://mail.example.com/*']})},tabs:{query:async()=>[{id:12,url:'https://mail.example.com/inbox'}],sendMessage:async()=>({ok:true})},runtime:{sendMessage:async message=>{assert.equal(message.type,'page-report');assert.equal(message.tabId,12);reads++;return report;}}};
  try {
    win.eval(source);await new Promise(resolve=>setImmediate(resolve));
    assert.equal(win.document.querySelector('#scanned').textContent,'20');assert.equal(win.document.querySelector('#suspicious').textContent,'1');
    report={scanned:21,danger:0,caution:0};await poll();
    assert.equal(win.document.querySelector('#scanned').textContent,'21');assert.equal(win.document.querySelector('#suspicious').textContent,'0');assert.equal(reads,2);
  } finally {win.dispatchEvent(new win.Event('pagehide'));dom.window.close();}
});
