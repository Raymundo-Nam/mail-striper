import { createGuard } from './guard.js';
import { analyzeLink, displayedHosts } from './engine.js';
const cases=[
  {id:'mismatch',label:'표시 주소 불일치',subject:'[IT 안내] 계정 보안 설정을 확인해 주세요',sender:'Ligdna IT 지원팀',address:'helpdesk@ligdna.com',icon:'IT',category:'계정 보안',time:'09:42',href:'https://account-check.example/login',text:'https://ligdna.com/login',intro:'안녕하세요. IT 지원팀입니다.',body:'계정 보안 설정 업데이트를 위해 아래 사내 포털에서 로그인 후 설정을 확인해 주세요.',hint:'사내 포털 바로가기'},
  {id:'typo',label:'한 글자 바꾼 도메인',subject:'이번 달 급여명세서가 도착했습니다',sender:'Ligdna 인사팀',address:'payroll@ligdaa.com',icon:'HR',category:'급여 안내',time:'09:36',href:'https://ligdaa.com/payroll',text:'https://ligdna.com/payroll',intro:'안녕하세요. 인사팀입니다.',body:'이번 달 급여명세서를 확인해 주세요. 개인정보 보호를 위해 사내 계정 로그인이 필요합니다.',hint:'급여명세서 확인'},
  {id:'subdomain',label:'하위 도메인 위장',subject:'사내 문서함 접근 권한 갱신 안내',sender:'Ligdna 문서 관리',address:'docs@verify.example',icon:'DO',category:'공유 문서',time:'09:21',href:'https://ligdna.com.verify.example/docs',text:'https://ligdna.com/docs',intro:'문서함 접근 권한이 곧 만료됩니다.',body:'공유된 프로젝트 문서에 계속 접근하려면 아래 링크에서 권한을 갱신해 주세요.',hint:'문서함 열기'},
  {id:'userinfo',label:'@ 앞부분 주소 위장',subject:'사내 시스템 인증을 완료해 주세요',sender:'Ligdna 보안 알림',address:'notice@verify.example',icon:'SC',category:'인증 안내',time:'09:17',href:'https://ligdna.com@verify.example/auth',text:'https://ligdna.com/auth',intro:'사내 시스템 인증 안내입니다.',body:'새로운 기기에서 접속한 기록이 있습니다. 아래 주소에서 본인 접속 여부를 확인해 주세요.',hint:'접속 기록 확인'},
  {id:'unicode',label:'닮은 문자 위장',subject:'비밀번호 재설정 요청을 확인해 주세요',sender:'Ligdna 계정 관리',address:'accounts@lіgdna.com',icon:'ID',category:'계정 보안',time:'09:05',href:'https://lіgdna.com/reset',text:'https://ligdna.com/reset',intro:'비밀번호 재설정 요청을 받았습니다.',body:'요청하신 비밀번호 변경을 진행하려면 다음 계정 관리 페이지로 이동해 주세요.',hint:'계정 관리 바로가기'},
  {id:'short',label:'목적지가 숨겨진 링크',subject:'회의 자료를 공유합니다',sender:'프로젝트 운영팀',address:'project@ligdna.com',icon:'PM',category:'업무 공유',time:'08:53',href:'https://bit.ly/mail-striper-demo',text:'공유 문서 확인하기',intro:'오늘 회의에서 사용할 자료입니다.',body:'참석 전에 공유 문서를 확인해 주세요. 단축 주소에는 실제 목적지가 드러나지 않습니다.',hint:'회의 자료'},
  {id:'normal',label:'주소가 일치하는 링크',subject:'이번 주 사내 소식을 전합니다',sender:'Ligdna 커뮤니케이션팀',address:'news@ligdna.com',icon:'CO',category:'사내 소식',time:'08:40',href:'https://ligdna.com/news',text:'https://ligdna.com/news',intro:'이번 주 사내 소식을 확인해 보세요.',body:'새롭게 합류한 동료 소개와 팀 소식이 사내 게시판에 업데이트되었습니다.',hint:'사내 게시판'},
  {id:'wrapped',label:'정상 보안 경유 링크',subject:'보안 링크로 전달된 문서 안내',sender:'Ligdna 문서 관리',address:'docs@ligdna.com',icon:'DO',category:'업무 공유',time:'08:25',href:'https://example.safelinks.protection.outlook.com/?url=https%3A%2F%2Fligdna.com%2Fdocs&data=demo',text:'https://ligdna.com/docs',intro:'보안 서비스를 통해 전달된 문서입니다.',body:'알려진 보안 링크 형식에 포함된 주소를 접속 없이 읽어 비교합니다. 최종 이동이나 악성 여부까지 확인하는 것은 아닙니다.',hint:'공유 문서 열기'},
];
const $=id=>document.getElementById(id);let selected=cases[0],guard,toastTimer;
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3800);}
function inspector(report) {
  $('scan-count').replaceChildren(document.createTextNode(String(report.scanned)),node('small','', '개'));
  $('risk-count').replaceChildren(document.createTextNode(String(report.danger+report.caution)),node('small','','개'));
  const pane=$('inspection');pane.replaceChildren();
  const head=node('div','inspection-header','◇  Mail Striper 분석');head.append(node('span','live','ON DEVICE'));pane.append(head);
  if(!$('protection').checked){pane.append(node('h4','','보호가 꺼져 있어요'),node('p','inspection-description','보호를 켜면 현재 메일의 링크를 자동으로 검사합니다.'));return;}
  const link=$('mail-body').querySelector('a');if(!link)return;
  const result=report.findings?.[0] || analyzeLink({href:link.href,text:link.textContent,baseUrl:document.baseURI});
  const flagged=result.findings.length>0;
  pane.append(node('div',`insight-icon ${flagged?'':'clear'}`,flagged?'!':'✓'),node('h4','',flagged?(result.level==='danger'?'이 링크, 확인이 필요해요':'목적지가 보이지 않아요'):'뚜렷한 의심 징후가 없어요'),node('p','inspection-description',flagged?'주소에서 다음 패턴을 발견했습니다. 클릭하면 이동 전에 확인할 수 있어요.':'현재 규칙에서 의심 패턴이 발견되지 않았습니다. 안전을 보장하는 결과는 아닙니다.'));
  const comparison=node('div','comparison');comparison.append(node('span','','화면에 보이는 주소'),node('strong','',displayedHosts(result.text)[0] || '(주소가 표시되지 않음)'),node('span','destination-label',result.wrapped?'보안 경유 링크에 포함된 호스트':'실제 링크의 호스트'),node('strong',flagged?'risky':'',result.displayHostname));pane.append(comparison);
  result.findings.forEach((f,i)=>{const card=node('div','rule-card'),name=node('div','rule-name');name.append(node('span','',String(i+1).padStart(2,'0')),document.createTextNode(f.title));card.append(name,node('p','',f.detail));pane.append(card);});
  pane.append(node('p','inspection-footer','이 분석을 위해 외부 사이트에 접속하거나 메일 내용을 전송하지 않았습니다.'));
}
function choose(item){
  selected=item;document.querySelectorAll('.mail-item').forEach(b=>{b.classList.toggle('active',b.dataset.id===item.id);b.setAttribute('aria-current',b.dataset.id===item.id?'true':'false');});
  $('mail-subject').textContent=item.subject;$('sender-name').textContent=item.sender;$('sender-address').textContent=item.address;$('sender-avatar').textContent=item.icon;$('mail-category').textContent=item.category;$('mail-time').textContent=`오전 ${item.time}`;
  const body=$('mail-body');body.replaceChildren(node('p','',item.intro),node('p','',item.body));
  const callout=node('div','mail-callout'),link=node('a','',item.text);link.href=item.href;link.dataset.demoLink='true';callout.append(node('small','',item.hint),link);body.append(callout,node('p','mail-signature','감사합니다.\n'+item.sender));
  if(guard)guard.scan();else inspector({scanned:0,danger:0,caution:0});
}
for(const item of cases){const b=node('button','mail-item');b.dataset.id=item.id;b.type='button';const result=analyzeLink({href:item.href,text:item.text});const top=node('span','item-top'),label=node('span');label.append(node('i',`item-dot ${result.level}`),document.createTextNode(item.label));top.append(label,node('span','item-number',String(cases.indexOf(item)+1).padStart(2,'0')));b.append(top,node('strong','',item.subject),node('span','excerpt',item.address));b.addEventListener('click',()=>choose(item));$('mail-list').append(b);}
function startGuard(){guard=createGuard({demo:true,onUpdate:inspector,onDemoOpen:()=>toast('열기 동작을 체험했습니다. 외부 사이트에는 접속하지 않았어요.')});}
choose(selected);startGuard();
$('protection').addEventListener('change',()=>{const on=$('protection').checked;document.body.classList.toggle('protection-off',!on);$('protection-label').textContent=on?'보호 켜짐':'보호 꺼짐';if(on)startGuard();else{guard?.stop();guard=null;inspector({scanned:0,danger:0,caution:0});}});
$('dynamic-mail').addEventListener('click',()=>{const p=node('p'),a=node('a','','https://ligdna.com/new-document');a.href='https://ligdaa.com/new-document';a.dataset.demoLink='true';p.append(node('small','','새로 추가된 링크 · '),a);$('mail-body').append(p);toast('HTML에 새 링크를 추가했습니다. 자동으로 다시 검사합니다.');});
document.addEventListener('click',event=>{const a=event.target.closest?.('a');if(a){event.preventDefault();if(a.dataset.demoLink)toast('체험 링크입니다. 외부 사이트로 이동하지 않았어요.');}});
document.addEventListener('auxclick',event=>{if(event.target.closest?.('a'))event.preventDefault();});
document.addEventListener('contextmenu',event=>{if(event.target.closest?.('a[data-demo-link]')){event.preventDefault();toast('체험에서는 외부 링크를 열지 않습니다.');}});
for(const id of ['install-side','install-top'])$(id).addEventListener('click',()=>$('install-dialog').showModal());
$('close-install').addEventListener('click',()=>$('install-dialog').close());
$('install-dialog').addEventListener('click',e=>{if(e.target===$('install-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('view-patterns').addEventListener('click',()=>{guard?.open();$('inspection').scrollIntoView({block:'center',behavior:'smooth'});});
document.querySelector('.brand').addEventListener('click',()=>{choose(cases[0]);window.scrollTo({top:0,behavior:'smooth'});});
