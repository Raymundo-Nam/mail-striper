import { analyzeLink } from './engine.js';
import guardCss from './guard.css';

export function createGuard({doc=document,win=window,demo=false,onUpdate=()=>{},onDemoOpen=()=>{},readPageReport=null,onLocateFinding=()=>{}}={}) {
  const host=doc.createElement('div');
  host.id='mail-striper-root';
  host.style.cssText='all:initial;position:fixed;z-index:2147483647;right:24px;bottom:24px;color-scheme:light;';
  const shadow=host.attachShadow({mode:'open'});
  const style=doc.createElement('style'); style.textContent=guardCss; shadow.append(style);
  const el=(tag,cls,text)=>{const node=doc.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const drawer=el('section','drawer'); drawer.hidden=true; drawer.setAttribute('aria-label','링크 검사 결과'); shadow.append(drawer);
  let records=[],scanned=0,timer,stopped=false,modal=null,modalCleanup=()=>{},previousFocus=null,lastSignature='',limited=false;
  let pageReport=null,drawerTimer,drawerReading=false,drawerSignature='';
  const marked=new Set();
  const allowedOnce=new WeakMap();
  const editorSelector='[contenteditable=""],[contenteditable="true" i],[contenteditable="plaintext-only" i],[role="textbox"],[role="toolbar"],.ck-editor,.ck-dialog,.cke,.cke_dialog,.tox,.mce-container,.note-editor,.ql-container,.fr-box';
  const editorFrame=/dext5|ckeditor|tinymce|smarteditor|summernote|froala/i;
  function editing(anchor) {
    if(String(doc.designMode).toLowerCase()==='on' || anchor.isContentEditable || anchor.closest(editorSelector))return true;
    // Editor toolbars and link dialogs may live in a separate same-origin frame.
    try {
      const frame=win.frameElement;
      if(frame && (frame.closest(editorSelector) || editorFrame.test([frame.id,frame.name,frame.title,frame.getAttribute('src')].join(' '))))return true;
      if(win!==win.top && editorFrame.test(new URL(doc.URL).pathname))return true;
    } catch { /* A cross-origin parent is not readable. */ }
    return false;
  }
  const paint=doc.createElement('style');
  paint.textContent='[data-mail-striper-level="danger"]{outline:2px solid #dc725b!important;outline-offset:4px!important;border-radius:3px!important}[data-mail-striper-level="caution"]{outline:2px dashed #b98b35!important;outline-offset:4px!important;border-radius:3px!important}';
  doc.documentElement.append(paint);
  (doc.body || doc.documentElement).append(host);

  function makeButton(text,cls,fn) { const b=el('button',cls,text);b.type='button';b.addEventListener('click',fn);return b; }
  function titleRow(label,close) { const row=el('div','title-row');const mark=el('div','wordmark');mark.append(el('span','logo small','M'),el('strong','',label));row.append(mark,makeButton('×','icon-button',close));return row; }
  function report() { return {scanned,limited,danger:records.filter(r=>r.level==='danger').length,caution:records.filter(r=>r.level==='caution').length,findings:records.map(({element,...r})=>r)}; }
  function closeDrawer() {drawer.hidden=true;win.clearTimeout(drawerTimer);pageReport=null;}
  function renderDrawer() {
    const data=pageReport || report(),findings=pageReport?data.findings:records;
    drawer.replaceChildren(titleRow('Mail Striper',()=>{closeDrawer();previousFocus?.focus?.({preventScroll:true});}));
    const summary=el('div','drawer-summary');summary.append(el('div','eyebrow','이 페이지의 링크'),el('h2','',`${findings.length}개 확인이 필요해요`),el('p','muted',`${data.scanned}개 검사 · 기기 안에서 분석${data.limited?' · 일부 링크만 검사됨':''}`));drawer.append(summary);
    if(!findings.length) drawer.append(el('p','empty','현재 규칙에서 의심 패턴을 찾지 못했습니다. 모든 링크의 안전을 보장하는 결과는 아닙니다.'));
    const list=el('div','finding-list');
    for(const record of findings.slice(0,80)) {
      const card=el('article','finding');card.append(el('span',`pill ${record.level}`,record.level==='danger'?'주의 링크':'추가 확인'),el('strong','finding-host',record.displayHostname || '특수 링크'));
      for(const f of record.findings) card.append(el('p','finding-reason',f.title));
      card.append(makeButton('링크 위치 보기 ↗','text-button',()=>{
        if(pageReport)onLocateFinding(record);
        else locate(record);
      }));list.append(card);
    }
    drawer.append(list,el('p','footnote','검사를 위해 링크에 접속하지 않습니다.'));
  }
  async function refreshDrawer() {
    if(stopped || drawer.hidden || !readPageReport || drawerReading)return;
    drawerReading=true;
    try {
      const next=await readPageReport();
      if(!stopped && !drawer.hidden){
        pageReport=next || report();
        const signature=JSON.stringify(pageReport);
        if(signature!==drawerSignature){drawerSignature=signature;renderDrawer();}
      }
    } catch { /* Keep the last result if the tab is navigating. */ }
    finally {drawerReading=false;if(!stopped && !drawer.hidden)drawerTimer=win.setTimeout(refreshDrawer,1000);}
  }
  function locate(finding) {
    scan();
    // A mail switch may have removed or replaced the element since the results were shown.
    const record=records.find(r=>r.url===finding.url && r.text===finding.text);
    if(!record)return false;
    record.element.scrollIntoView({block:'center',behavior:'smooth'});record.element.focus({preventScroll:true});return true;
  }
  function inspect(anchor) { return analyzeLink({href:anchor.href,text:anchor.innerText || anchor.textContent || anchor.getAttribute('aria-label') || '',baseUrl:doc.baseURI}); }
  function visible(node,cache=new Map()) {
    if(!node)return true;
    if(cache.has(node))return cache.get(node);
    const view=node.ownerDocument.defaultView,style=view.getComputedStyle(node);
    const result=!node.hidden && node.getAttribute('aria-hidden')!=='true' && style.display!=='none' && !['hidden','collapse'].includes(style.visibility) && style.contentVisibility!=='hidden' && visible(node.parentElement,cache);
    cache.set(node,result);return result;
  }
  function frameVisible() {
    try {
      for(let current=win;current!==current.top;current=current.parent){
        const frame=current.frameElement;
        if(!frame)break; // Cross-origin parents cannot be read.
        if(!visible(frame))return false;
      }
    } catch { /* Cross-origin frame visibility is not available. */ }
    return true;
  }
  function scan() {
    if(stopped)return;
    win.clearTimeout(timer);timer=null;
    if(doc.body && host.parentElement!==doc.body)doc.body.append(host);
    const visibility=new Map();
    const links=frameVisible()?[...doc.querySelectorAll('a[href]')].filter(anchor=>visible(anchor,visibility) && !editing(anchor)):[];
    limited=links.length>4000;scanned=0;const next=[];const nowMarked=new Set();
    for(const anchor of links.slice(0,4000)) {
      const result=inspect(anchor);if(result.level==='ignored')continue;scanned++;
      if(result.findings.length) {next.push({...result,element:anchor});anchor.setAttribute('data-mail-striper-level',result.level);nowMarked.add(anchor);}
    }
    for(const anchor of marked) if(!nowMarked.has(anchor))anchor.removeAttribute('data-mail-striper-level');
    marked.clear();for(const anchor of nowMarked)marked.add(anchor);
    const elementsChanged=next.length!==records.length || next.some((record,index)=>record.element!==records[index]?.element);
    records=next;
    const signature=JSON.stringify([scanned,limited,records.map(({element,...record})=>record)]);
    if(signature!==lastSignature) {
      lastSignature=signature;onUpdate(report());
    }
    if(!drawer.hidden && !readPageReport && (elementsChanged || signature!==drawerSignature)){drawerSignature=signature;renderDrawer();}
    return report();
  }
  function schedule() {if(timer==null)timer=win.setTimeout(scan,180);}
  function dismiss(restoreFocus=true) {if(!modal)return;modalCleanup();modalCleanup=()=>{};modal.remove();modal=null;if(restoreFocus)previousFocus?.focus?.({preventScroll:true});}
  function showWarning(result,anchor,trigger) {
    if(modal) return;
    previousFocus=doc.activeElement;closeDrawer();
    const dialog=el('section','dialog');modal=dialog;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','false');dialog.setAttribute('aria-label','링크를 열기 전 확인');
    dialog.append(titleRow('Mail Striper',()=>dismiss()),el('h2','',result.level==='danger'?'이 링크, 확인이 필요해요':'목적지를 한 번 더 확인하세요'));
    const tags=el('div','reason-tags');for(const f of result.findings)tags.append(el('span',`pill ${f.severity}`,f.title));dialog.append(tags);
    const target=el('div','destination');target.append(el('span','eyebrow',result.wrapped?'중간 링크에 포함된 목적지':'실제 연결 주소'),el('strong','destination-host',result.displayHostname || '일반 웹 주소가 아님'));dialog.append(target);
    const details=el('details','warning-details');details.append(el('summary','',`탐지 이유 보기 · ${result.findings.length}개`),el('code','full-url',result.url));
    const reasons=el('ul','reasons');for(const f of result.findings){const li=el('li');li.append(el('strong','',f.title),el('p','',f.detail));reasons.append(li);}details.append(reasons);dialog.append(details);
    const actions=el('div','dialog-actions');const back=makeButton('닫기','primary',()=>dismiss());actions.append(back);
    const webLink=/^https?:\/\//i.test(result.url);
    actions.append(makeButton(demo?'열기 동작 체험':webLink?'이번 한 번 열기':'이번 한 번 실행','secondary',()=>{
      dismiss();
      if(demo){onDemoOpen(result);return;}
      if(webLink){win.open(result.url,'_blank','noopener,noreferrer');return;}
      if(!anchor?.isConnected)return;
      // Let the page and browser perform the original action; never evaluate page code here.
      if(anchor.href!==result.url){
        const changed=inspect(anchor);
        if(changed.findings.length)showWarning(changed,anchor,trigger);
        else anchor.click();
        return;
      }
      allowedOnce.set(anchor,result.url);
      try {anchor.click();}finally{allowedOnce.delete(anchor);}
    }));
    dialog.append(actions);shadow.append(dialog);
    function place() {
      if(!anchor?.isConnected){dismiss(false);return;}
      const margin=8,gap=8;
      const viewport=win.visualViewport;
      const left=(viewport?.offsetLeft || 0)+margin,top=(viewport?.offsetTop || 0)+margin;
      const width=viewport?.width || win.innerWidth,height=viewport?.height || win.innerHeight;
      const right=left+width-margin*2,bottom=top+height-margin*2;
      dialog.style.width=`${Math.max(1,Math.min(320,width-margin*2))}px`;
      dialog.style.maxHeight=`${Math.max(1,height-margin*2)}px`;
      const box=dialog.getBoundingClientRect();
      const cardWidth=box.width || Math.min(320,width-margin*2),cardHeight=box.height || Math.min(230,height-margin*2);
      const hasPointer=Number.isFinite(trigger?.clientX) && Number.isFinite(trigger?.clientY) && (trigger.clientX!==0 || trigger.clientY!==0);
      const rects=hasPointer?[...anchor.getClientRects()]:[];
      const link=rects.find(r=>trigger.clientX>=r.left && trigger.clientX<=r.right && trigger.clientY>=r.top && trigger.clientY<=r.bottom) || anchor.getBoundingClientRect();
      const below=bottom-link.bottom-gap,above=link.top-top-gap;
      const showBelow=cardHeight<=below || below>=above;
      const x=hasPointer?trigger.clientX-12:link.left;
      const y=showBelow?link.bottom+gap:link.top-gap-cardHeight;
      dialog.style.left=`${Math.max(left,Math.min(x,right-cardWidth))}px`;
      dialog.style.top=`${Math.max(top,Math.min(y,bottom-cardHeight))}px`;
      dialog.dataset.placement=showBelow?'below':'above';
    }
    const outside=e=>{if(!e.composedPath().includes(host))dismiss(false);};
    const scrolled=e=>{if(!e.composedPath().includes(host))dismiss(false);};
    win.addEventListener('pointerdown',outside,true);win.addEventListener('scroll',scrolled,true);win.addEventListener('resize',place);
    viewportListeners(true);
    function viewportListeners(add){const viewport=win.visualViewport;if(!viewport)return;const method=add?'addEventListener':'removeEventListener';viewport[method]('resize',place);viewport[method]('scroll',place);}
    modalCleanup=()=>{win.removeEventListener('pointerdown',outside,true);win.removeEventListener('scroll',scrolled,true);win.removeEventListener('resize',place);viewportListeners(false);};
    details.addEventListener('toggle',place);place();back.focus({preventScroll:true});
    dialog.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dismiss();}
    });
  }
  function guardEvent(event) {
    if(stopped || event.composedPath().includes(host))return;
    if(event.type==='keydown' && event.key!=='Enter')return;
    if(['pointerdown','mousedown','auxclick'].includes(event.type) && event.button!==1)return;
    const anchor=event.composedPath().find(node=>node?.tagName==='A' && node.hasAttribute('href'));
    if(!anchor)return;
    if(event.type==='click' && allowedOnce.get(anchor)===anchor.href){allowedOnce.delete(anchor);return;}
    if(editing(anchor))return;
    const result=inspect(anchor); // Re-read at the moment of interaction, even before a rescan.
    if(!result.findings.length)return;
    event.preventDefault();event.stopImmediatePropagation();dismiss(false);showWarning(result,anchor,event);
  }
  const eventTypes=['click','auxclick','contextmenu','keydown','pointerdown','mousedown'];
  eventTypes.forEach(type=>win.addEventListener(type,guardEvent,true));
  const observer=new win.MutationObserver(mutations=>{
    if(mutations.some(m=>!host.contains(m.target) && m.target!==host && m.target!==paint))schedule();
  });
  observer.observe(doc.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['href','hidden','aria-hidden','contenteditable','role','class','style','src','srcdoc']});
  scan();
  return {scan,report,locate,open:()=>{scan();dismiss(false);previousFocus=doc.activeElement;drawer.hidden=false;pageReport=null;drawerSignature='';renderDrawer();drawer.querySelector('button')?.focus();refreshDrawer();},stop:()=>{stopped=true;closeDrawer();dismiss(false);observer.disconnect();win.clearTimeout(timer);eventTypes.forEach(type=>win.removeEventListener(type,guardEvent,true));for(const anchor of marked)anchor.removeAttribute('data-mail-striper-level');host.remove();paint.remove();}};
}
