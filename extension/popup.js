const $=id=>document.getElementById(id);
let tab,pattern,enabled=false;
let reportRequest=0,pollTimer,closed=false;
const patternFor=url=>{try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)?`${u.protocol}//${u.hostname}/*`:null;}catch{return null;}};
async function refreshCounts() {
  const request=++reportRequest;
  let report=null;
  if(enabled)try{report=await chrome.runtime.sendMessage({type:'page-report',tabId:tab.id});}catch{}
  if(request!==reportRequest || closed)return;
  $('scanned').textContent=report?.scanned??'—';$('suspicious').textContent=report?(report.danger+report.caution):'—';$('findings').disabled=!report;
}
async function pollCounts() {
  await refreshCounts();
  if(!closed)pollTimer=setTimeout(pollCounts,1000);
}
window.addEventListener('pagehide',()=>{closed=true;clearTimeout(pollTimer);});
async function refresh() {
  enabled=pattern?await chrome.permissions.contains({origins:[pattern]}):false;
  $('status').textContent=enabled?'보호 켜짐':'보호 꺼짐';$('dot').classList.toggle('on',enabled);
  $('toggle').title=enabled?'이 사이트 보호 끄기':'이 사이트 보호 켜기';$('toggle').setAttribute('aria-checked',String(enabled));$('toggle').classList.toggle('enabled',enabled);$('toggle').disabled=!pattern;
  if(!pattern){$('site').textContent='검사할 수 없는 페이지';$('status').textContent='일반 웹사이트에서 켜세요';}
  else {$('site').textContent=new URL(tab.url).hostname;$('site').title=$('site').textContent;}
  await refreshCounts();
  const {origins=[]}=await chrome.permissions.getAll();const sites=origins.filter(o=>/^https?:\/\//.test(o));$('site-count').textContent=sites.length;$('site-list').replaceChildren();
  if(!sites.length){const li=document.createElement('li');li.className='empty';li.textContent='등록된 사이트 없음';$('site-list').append(li);}
  for(const origin of sites){const li=document.createElement('li'),name=document.createElement('span'),button=document.createElement('button');name.textContent=origin.replace(/^https?:\/\//,'').replace(/\/\*$/,'');button.textContent='해제';button.addEventListener('click',async()=>{await chrome.permissions.remove({origins:[origin]});await refresh();});li.append(name,button);$('site-list').append(li);}
}
$('toggle').addEventListener('click',async()=>{
  $('message').textContent='';$('toggle').disabled=true;
  try{
    if(enabled)await chrome.permissions.remove({origins:[pattern]});
    else {
      const granted=await chrome.permissions.request({origins:[pattern]});
      if(granted){const result=await chrome.runtime.sendMessage({type:'activate',tabId:tab.id});if(!result.ok)$('message').textContent='권한이 저장되었습니다. 페이지를 새로고침하면 검사가 시작됩니다.';}
      else $('message').textContent='이 사이트 접근을 허용하면 보호가 시작됩니다.';
    }
  }catch(error){$('message').textContent='설정을 적용하지 못했습니다. 페이지를 새로고침하고 다시 시도해 주세요.';}
  await refresh();
});
$('findings').addEventListener('click',async()=>{await chrome.tabs.sendMessage(tab.id,{type:'show-findings'},{frameId:0});window.close();});
(async()=>{[tab]=await chrome.tabs.query({active:true,currentWindow:true});pattern=patternFor(tab?.url);await refresh();pollTimer=setTimeout(pollCounts,1000);})();
