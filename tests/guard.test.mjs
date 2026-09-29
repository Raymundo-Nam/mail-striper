import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
const built=await build({entryPoints:['src/guard.js'],bundle:true,write:false,format:'iife',globalName:'GuardModule',loader:{'.css':'text'}});
const code=built.outputFiles[0].text;
function setup(html='<a id="link" href="https://ligdaa.com/login">https://ligdna.com/login</a>',options={}) {
  const dom=new JSDOM(`<!doctype html><body>${html}</body>`,{url:'https://mail.ligdna.com',runScripts:'outside-only',pretendToBeVisual:true});
  let root;const original=dom.window.Element.prototype.attachShadow;dom.window.Element.prototype.attachShadow=function(options){const shadow=original.call(this,options);if(this.id==='mail-striper-root')root=shadow;return shadow;};
  dom.window.eval(code);const reports=[];const guard=dom.window.GuardModule.createGuard({doc:dom.window.document,win:dom.window,onUpdate:r=>reports.push(r),...options});
  return {dom,guard,reports,root,link:dom.window.document.querySelector('#link'),close:()=>{guard.stop();dom.window.close();}};
}
test('dangerous click is cancelled before downstream handlers run',()=>{const s=setup();let invoked=false;s.link.addEventListener('click',()=>invoked=true);const evt=new s.dom.window.MouseEvent('click',{bubbles:true,cancelable:true});s.link.dispatchEvent(evt);assert.equal(evt.defaultPrevented,true);assert.equal(invoked,false);assert.ok(s.root.querySelector('[role="dialog"]'));s.close();});
test('normal links are not blocked',()=>{const s=setup('<a id="link" href="https://ligdna.com">https://ligdna.com</a>');const evt=new s.dom.window.MouseEvent('click',{bubbles:true,cancelable:true});s.dom.window.addEventListener('click',e=>e.preventDefault());s.link.dispatchEvent(evt);assert.equal(s.guard.report().danger,0);assert.equal(s.root.querySelector('[role="dialog"]'),null);s.close();});
test('middle mouse, right click and Enter are protected',()=>{for(const type of ['auxclick','mousedown','pointerdown','contextmenu','keydown']){const s=setup();const evt=type==='keydown'?new s.dom.window.KeyboardEvent(type,{key:'Enter',bubbles:true,cancelable:true}):new s.dom.window.MouseEvent(type,{button:1,bubbles:true,cancelable:true});s.link.dispatchEvent(evt);assert.equal(evt.defaultPrevented,true,type);s.close();}});
test('href replacement is checked immediately, before the observer runs',()=>{const s=setup('<a id="link" href="https://ligdna.com">https://ligdna.com</a>');s.link.href='https://ligdaa.com';const evt=new s.dom.window.MouseEvent('click',{bubbles:true,cancelable:true});s.link.dispatchEvent(evt);assert.equal(evt.defaultPrevented,true);s.close();});
test('new HTML links are scanned after a page update',async()=>{const s=setup('<div></div>');const a=s.dom.window.document.createElement('a');a.href='https://ligdaa.com';a.textContent='https://ligdna.com';s.dom.window.document.body.append(a);await new Promise(r=>setTimeout(r,280));assert.equal(s.guard.report().danger,1);assert.equal(a.getAttribute('data-mail-striper-level'),'danger');s.close();});
test('switching mails at the same URL excludes ancestors hidden by class or style',async()=>{
  const s=setup('<style>.inactive{display:none}</style><section id="old"><a id="link" href="https://ligdaa.com">https://ligdna.com</a></section><section id="new" class="inactive"><a href="https://ligdna.com">https://ligdna.com</a><a href="https://ligdna.com/docs">資料</a></section>');
  assert.equal(s.guard.report().scanned,1);assert.equal(s.guard.report().danger,1);
  const before=s.dom.window.location.href,doc=s.dom.window.document;
  doc.querySelector('#old').style.display='none';doc.querySelector('#new').classList.remove('inactive');
  await new Promise(r=>setTimeout(r,280));
  assert.equal(s.dom.window.location.href,before);assert.equal(s.guard.report().scanned,2);assert.equal(s.guard.report().danger,0);assert.equal(s.link.hasAttribute('data-mail-striper-level'),false);
  doc.querySelector('#old').style.display='';doc.querySelector('#new').className='inactive';
  await new Promise(r=>setTimeout(r,280));assert.equal(s.guard.report().scanned,1);assert.equal(s.guard.report().danger,1);s.close();
});
test('opening results rescans immediately and identical replacements point to the current element',()=>{
  const s=setup();s.guard.open();const replacement=s.link.cloneNode(true);let located=false;replacement.scrollIntoView=()=>located=true;
  s.link.replaceWith(replacement);s.guard.scan();
  [...s.root.querySelectorAll('button')].find(b=>b.textContent==='링크 위치 보기 ↗').click();assert.equal(located,true);
  replacement.remove();s.guard.open();assert.equal(s.guard.report().scanned,0);assert.equal(s.root.querySelectorAll('.finding').length,0);s.close();
});
test('a hidden same-origin mail frame is excluded from fresh reports',()=>{
  const s=setup('<section id="panel"><iframe></iframe></section>');const frame=s.dom.window.document.querySelector('iframe'),doc=frame.contentDocument;
  doc.body.innerHTML='<a href="https://ligdaa.com">https://ligdna.com</a>';
  const guard=s.dom.window.GuardModule.createGuard({doc,win:frame.contentWindow});
  assert.equal(guard.scan().danger,1);s.dom.window.document.querySelector('#panel').hidden=true;assert.equal(guard.scan().scanned,0);
  s.dom.window.document.querySelector('#panel').hidden=false;assert.equal(guard.scan().danger,1);guard.stop();s.close();
});
test('continuous unrelated changes do not postpone scanning indefinitely',async()=>{
  const s=setup('<a id="link" href="https://ligdna.com">https://ligdna.com</a><span id="ticker"></span>');s.link.href='https://ligdaa.com';
  const ticker=s.dom.window.document.querySelector('#ticker');const interval=setInterval(()=>ticker.textContent=String(Date.now()),30);
  try {await new Promise(r=>setTimeout(r,280));assert.equal(s.guard.report().danger,1);}finally{clearInterval(interval);s.close();}
});
test('the results drawer shows frame findings, locates them and refreshes while open',async()=>{
  const finding={url:'https://ligdaa.com',text:'https://ligdna.com',displayHostname:'ligdaa.com',level:'danger',findings:[{title:'표시 주소와 다름'}],frameId:4,documentId:'mail'};
  let page={scanned:20,danger:1,caution:0,findings:[finding]},located,poll;
  const s=setup('<p>본문은 프레임에 있음</p>',{readPageReport:async()=>page,onLocateFinding:record=>located=record});
  const original=s.dom.window.setTimeout.bind(s.dom.window);s.dom.window.setTimeout=(callback,delay)=>delay===1000?(poll=callback,100):original(callback,delay);
  try {
    s.guard.open();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(s.root.querySelectorAll('.finding').length,1);assert.match(s.root.querySelector('.drawer-summary').textContent,/20개 검사/);
    [...s.root.querySelectorAll('button')].find(b=>b.textContent==='링크 위치 보기 ↗').click();assert.equal(located.documentId,'mail');
    page={scanned:21,danger:0,caution:0,findings:[]};await poll();assert.equal(s.root.querySelectorAll('.finding').length,0);assert.match(s.root.querySelector('.drawer-summary').textContent,/21개 검사/);
  } finally {s.close();}
});
test('stop removes highlights and restores normal event propagation',()=>{const s=setup();s.guard.stop();assert.equal(s.link.hasAttribute('data-mail-striper-level'),false);let called=false;s.link.addEventListener('click',e=>{e.preventDefault();called=true;});s.link.dispatchEvent(new s.dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));assert.equal(called,true);assert.equal(s.dom.window.document.querySelector('#mail-striper-root'),null);s.dom.window.close();});
test('confirmation opens the original URL and isolates the opener',()=>{const s=setup();let opened; s.dom.window.open=(...args)=>opened=args;s.link.dispatchEvent(new s.dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));[...s.root.querySelectorAll('button')].find(b=>b.textContent==='이번 한 번 열기').click();assert.deepEqual(opened,['https://ligdaa.com/login','_blank','noopener,noreferrer']);s.close();});
test('untrusted link text is rendered as text, never markup',()=>{const s=setup('<a id="link" href="https://ligdaa.com">https://ligdna.com &lt;img src=x onerror=alert(1)&gt;</a>');s.guard.open();assert.equal(s.root.querySelector('img'),null);s.close();});
test('links in editable content and editor controls do not warn or get highlighted',()=>{
  for(const wrapper of ['contenteditable="true"','role="textbox"','role="toolbar"','class="cke_dialog"']){
    const s=setup(`<div ${wrapper}><a id="link" href="https://ligdaa.com">https://ligdna.com</a></div>`);
    let invoked=false;s.link.addEventListener('click',e=>{e.preventDefault();invoked=true;});
    s.link.dispatchEvent(new s.dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));
    assert.equal(invoked,true,wrapper);assert.equal(s.guard.report().scanned,0,wrapper);assert.equal(s.root.querySelector('[role="dialog"]'),null);assert.equal(s.link.hasAttribute('data-mail-striper-level'),false);s.close();
  }
});
test('designMode documents and DEXT5 dialog frames are excluded',()=>{
  const s=setup('<iframe title="DEXT5 hyperlink dialog"></iframe>');
  const frame=s.dom.window.document.querySelector('iframe'),doc=frame.contentDocument,win=frame.contentWindow;
  doc.body.innerHTML='<a id="link" href="javascript:openEditorDialog()">링크 수정</a>';
  const frameGuard=s.dom.window.GuardModule.createGuard({doc,win});
  assert.equal(frameGuard.report().scanned,0);let invoked=false;doc.querySelector('a').addEventListener('click',e=>{e.preventDefault();invoked=true;});
  doc.querySelector('a').click();assert.equal(invoked,true);assert.equal(doc.querySelector('#mail-striper-root').shadowRoot.querySelector('[role="dialog"]'),null);frameGuard.stop();
  s.close();const editing=setup();editing.dom.window.document.designMode='on';editing.guard.scan();assert.equal(editing.guard.report().scanned,0);editing.close();
});
test('there is no persistent launcher; results open only when requested',()=>{const s=setup();assert.equal(s.root.querySelector('.launcher'),null);assert.equal(s.root.querySelector('.drawer').hidden,true);assert.equal(s.root.querySelector('[role="dialog"]'),null);s.guard.open();assert.equal(s.root.querySelector('.drawer').hidden,false);s.close();});
test('special link confirmation resumes its original handler exactly once',()=>{
  const s=setup('<a id="link" href="javascript:openDocument()">문서 열기</a>');let calls=0;
  s.link.addEventListener('click',e=>{e.preventDefault();calls++;});s.link.click();assert.equal(calls,0);
  [...s.root.querySelectorAll('button')].find(b=>b.textContent==='이번 한 번 실행').click();
  assert.equal(calls,1);assert.equal(s.root.querySelector('[role="dialog"]'),null);
  s.link.click();assert.equal(calls,1);assert.ok(s.root.querySelector('[role="dialog"]'));s.close();
});
test('changing a special link after the warning requires a new confirmation',()=>{
  const s=setup('<a id="link" href="javascript:openDocument()">문서 열기</a>');let calls=0;s.link.addEventListener('click',e=>{e.preventDefault();calls++;});
  s.link.click();s.link.href='javascript:changedAction()';[...s.root.querySelectorAll('button')].find(b=>b.textContent==='이번 한 번 실행').click();
  assert.equal(calls,0);assert.ok(s.root.querySelector('[role="dialog"]'));assert.match(s.root.querySelector('.full-url').textContent,/changedAction/);s.close();
});
test('warning appears beside the clicked link with collapsed explanations and no backdrop',()=>{
  const s=setup();s.link.getBoundingClientRect=()=>({left:180,right:350,top:120,bottom:140,width:170,height:20});
  s.link.dispatchEvent(new s.dom.window.MouseEvent('click',{clientX:230,clientY:130,bubbles:true,cancelable:true}));
  const popup=s.root.querySelector('.dialog');assert.equal(popup.style.left,'218px');assert.equal(popup.style.top,'148px');assert.equal(popup.style.width,'320px');assert.equal(s.root.querySelector('.backdrop'),null);assert.equal(popup.querySelector('details').open,false);s.close();
});
test('keyboard warning uses the link position and screen-edge warnings stay in view',()=>{
  const s=setup();s.link.getBoundingClientRect=()=>({left:990,right:1024,top:740,bottom:760,width:34,height:20});
  s.link.dispatchEvent(new s.dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  const popup=s.root.querySelector('.dialog');assert.equal(popup.dataset.placement,'above');assert.ok(parseFloat(popup.style.left)+320<=s.dom.window.innerWidth-8);assert.ok(parseFloat(popup.style.top)>=8);s.close();
});
test('clicking outside closes the compact popup',()=>{
  const s=setup();s.link.click();s.dom.window.document.body.dispatchEvent(new s.dom.window.MouseEvent('pointerdown',{bubbles:true}));assert.equal(s.root.querySelector('.dialog'),null);s.close();
});
