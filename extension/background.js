const scriptId='mail-striper-guard';
let syncQueue=Promise.resolve();
const patternFor=url=>{try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?`${u.protocol}//${u.hostname}/*`:null;}catch{return null;}};

async function sync() {
  const {origins=[]}=await chrome.permissions.getAll();
  const matches=origins.filter(o=>/^https?:\/\//.test(o));
  const scripts=await chrome.scripting.getRegisteredContentScripts({ids:[scriptId]});
  if(!matches.length){if(scripts.length)await chrome.scripting.unregisterContentScripts({ids:[scriptId]});return;}
  const config={id:scriptId,matches,js:['content.js'],runAt:'document_start',allFrames:true,matchOriginAsFallback:true,persistAcrossSessions:true};
  if(scripts.length)await chrome.scripting.updateContentScripts([config]);else await chrome.scripting.registerContentScripts([config]);
}
function syncScripts(){syncQueue=syncQueue.catch(()=>{}).then(sync);return syncQueue;}
async function pageReport(tabId) {
  // Read current documents on demand; no cached mail results survive a view switch.
  let frames;
  try {
    frames=await chrome.scripting.executeScript({target:{tabId,allFrames:true},func:()=>globalThis.__mailStriperReadReport?.() || null});
  } catch {
    const result=await chrome.tabs.sendMessage(tabId,{type:'report'},{frameId:0}).catch(()=>null);
    frames=[{frameId:0,result}];
  }
  const active=frames.filter(frame=>frame.result);
  if(!active.length)return null;
  const total={scanned:0,danger:0,caution:0,limited:false,findings:[]};
  for(const {frameId,documentId,result} of active){
    total.scanned+=result.scanned;total.danger+=result.danger;total.caution+=result.caution;total.limited ||= result.limited;
    total.findings.push(...result.findings.map(finding=>({...finding,frameId,documentId})));
  }
  return total;
}
async function refreshOpenTabs(){for(const tab of await chrome.tabs.query({})){if(tab.id)chrome.tabs.sendMessage(tab.id,{type:'refresh-permission'}).catch(()=>{});}}
chrome.runtime.onInstalled.addListener(()=>syncScripts());
chrome.runtime.onStartup.addListener(()=>syncScripts());
chrome.permissions.onAdded.addListener(()=>syncScripts().then(refreshOpenTabs));
chrome.permissions.onRemoved.addListener(()=>syncScripts().then(refreshOpenTabs));
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message.type==='site-enabled') {
    const origin=patternFor(sender.url || sender.tab?.url) || patternFor(sender.origin);
    if(!origin){reply(false);return;}
    chrome.permissions.contains({origins:[origin]}).then(reply,()=>reply(false));return true;
  }
  if(message.type==='activate' && !sender.tab) {
    (async()=>{
      await syncScripts();
      await chrome.scripting.executeScript({target:{tabId:message.tabId,allFrames:true},files:['content.js']});
      await chrome.tabs.sendMessage(message.tabId,{type:'refresh-permission'}).catch(()=>{});
      reply({ok:true});
    })().catch(error=>reply({ok:false,error:error.message}));return true;
  }
  if(message.type==='page-report') {
    const tabId=sender.tab?.id ?? message.tabId;
    if(!Number.isInteger(tabId)){reply(null);return;}
    pageReport(tabId).then(reply,()=>reply(null));return true;
  }
  if(message.type==='locate-finding' && sender.tab && message.finding) {
    const finding=message.finding;
    const target=finding.documentId?{documentId:finding.documentId}:{frameId:finding.frameId};
    chrome.tabs.sendMessage(sender.tab.id,{type:'locate-finding',finding},target).then(reply,()=>reply({ok:false}));return true;
  }
});
