import { createGuard } from './guard.js';

if(!globalThis.__mailStriperLoaded) {
  globalThis.__mailStriperLoaded=true;
  let guard;
  // Only visible in this extension's isolated world, never in page scripts.
  globalThis.__mailStriperReadReport=()=>guard?.scan() || null;
  async function refresh() {
    try {
      const enabled=await chrome.runtime.sendMessage({type:'site-enabled'});
      if(enabled && !guard)guard=createGuard({
        readPageReport:()=>chrome.runtime.sendMessage({type:'page-report'}),
        onLocateFinding:finding=>chrome.runtime.sendMessage({type:'locate-finding',finding}).catch(()=>{}),
      });
      else if(!enabled && guard){guard.stop();guard=null;}
    } catch {guard?.stop();guard=null;}
  }
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(message.type==='refresh-permission'){refresh().then(()=>reply({ok:true}));return true;}
    if(message.type==='report')reply(guard?.scan() || null);
    if(message.type==='show-findings'){guard?.open();reply({ok:!!guard});}
    if(message.type==='locate-finding')reply({ok:!!guard?.locate(message.finding)});
  });
  if(document.documentElement)refresh();else document.addEventListener('DOMContentLoaded',refresh,{once:true});
}
