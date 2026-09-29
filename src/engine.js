import { getDomain, getPublicSuffix, parse } from 'tldts';
import punycode from 'punycode/punycode.js';
const { toUnicode } = punycode;

export const RULES = {
  TYPO: '유사 도메인', HOMOGLYPH: '닮은 문자 위장', BRAND: '도메인 변형',
  SUBDOMAIN: '하위 도메인 위장', PATH: '주소 위치 위장', USERINFO: '@ 앞 주소 위장',
  MISMATCH: '표시 주소 불일치', REDIRECT: '목적지 확인 필요', SCHEME: '특수 링크',
};
const confusables = { 'а':'a', 'ɑ':'a', 'α':'a', 'е':'e', 'ε':'e', 'і':'i', 'ι':'i', 'ı':'i', 'ј':'j', 'ο':'o', 'о':'o', 'р':'p', 'ρ':'p', 'с':'c', 'ϲ':'c', 'ѕ':'s', 'τ':'t', 'т':'t', 'υ':'u', 'ν':'v', 'х':'x', 'χ':'x', 'у':'y', 'ү':'y', 'ӏ':'l', 'ⅼ':'l', 'ԁ':'d', 'ԛ':'q', 'ɡ':'g', '0':'o', '1':'l' };
const shorteners = new Set(['bit.ly','t.co','tinyurl.com','is.gd','ow.ly','rebrand.ly','buff.ly','goo.gl']);
const redirectKeys = new Set(['url','target','redirect','redirect_url','redirect_uri','next','continue','destination']);
const psl = { allowPrivateDomains: true };
const knownDomains = ['google.com','google.co.kr','gmail.com','microsoft.com','office.com','office365.com','outlook.com','live.com','sharepoint.com','naver.com','daum.net','kakao.com','github.com','dropbox.com','docusign.com','adobe.com','zoom.us','slack.com'];
export const unicodeHost = host => toUnicode(host).toLowerCase().replace(/\.$/, '');
export const domainOf = host => getDomain(host, psl) || host;
const skeleton = value => [...unicodeHost(value)].map(c => confusables[c] || c).join('').replace(/rn/g,'m');
const sameSite = (a,b) => domainOf(a) === domainOf(b);
const belongsTo = (host,base) => host === base || host.endsWith('.' + base);

export function automaticReferences(pageUrl) {
  let current;
  try { current=normalizeDomain(domainOf(new URL(pageUrl).hostname)); } catch { /* Invalid page URL. */ }
  return [...new Set([...knownDomains,...(current?[current]:[])])];
}

export function normalizeDomain(input) {
  const value = String(input).trim();
  if (!value || /[\s@?#]/.test(value)) return null;
  try {
    const url = new URL(value.includes('://') ? value : 'https://' + value);
    if (!['http:','https:'].includes(url.protocol) || url.port || url.pathname !== '/' || !url.hostname.includes('.')) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!/^[a-z0-9.-]+$/.test(host) || host.split('.').some(l => !l || l.startsWith('-') || l.endsWith('-') || l.length > 63)) return null;
    if (/^[\d.]+$/.test(host) || !getDomain(host,psl)) return null;
    return host;
  } catch { return null; }
}

export function editDistance(a,b) {
  const d = Array.from({length:a.length+1},(_,i) => [i]);
  for(let j=0;j<=b.length;j++) d[0][j]=j;
  for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++) {
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
    if(i>1 && j>1 && a[i-1]===b[j-2] && a[i-2]===b[j-1]) d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);
  }
  return d[a.length][b.length];
}

export function displayedHosts(text) {
  const tokens = String(text || '').match(/(?:https?:\/\/|www\.)[^\s<>"'\u200b]+|[\p{L}\p{N}](?:[\p{L}\p{N}-]*\.)+[\p{L}]{2,}(?:\/[^\s<>"']*)?/gu) || [];
  return [...new Set(tokens.slice(0,20).flatMap(token => {
    try {
      token = token.replace(/[.,;!?)\]}>。]+$/u,'');
      const u = new URL(/^https?:\/\//i.test(token) ? token : 'https://' + token);
      const parsed = parse(u.hostname, psl);
      if(!/^https?:\/\//i.test(token) && !parsed.isIcann && !parsed.isPrivate) return [];
      return u.username ? [] : [u.hostname.toLowerCase().replace(/\.$/,'')];
    } catch { return []; }
  }))];
}

function wrappedTarget(url) {
  let current = url;
  let wrapped = false;
  for(let depth=0;depth<3;depth++) {
    let target;
    if(belongsTo(current.hostname,'safelinks.protection.outlook.com')) target=current.searchParams.get('url');
    else if(['www.google.com','google.com'].includes(current.hostname) && current.pathname==='/url') target=current.searchParams.get('q') || current.searchParams.get('url');
    if(!target) break;
    try { const next=new URL(target); if(!['http:','https:'].includes(next.protocol)) break; current=next; wrapped=true; }
    catch { break; }
  }
  return {target:current,wrapped};
}

export function analyzeLink({href,text='',baseUrl='https://example.invalid/',protectedDomains=automaticReferences(baseUrl)}) {
  const findings=[];
  const add=(id,severity,detail) => { if(!findings.some(f=>f.id===id)) findings.push({id,title:RULES[id],severity,detail}); };
  let original;
  try { original=new URL(href,baseUrl); } catch { return {level:'unknown',findings:[],url:String(href),hostname:'',text,reason:'주소를 해석할 수 없습니다.'}; }
  if(!['http:','https:'].includes(original.protocol)) {
    const script=original.pathname.replace(/\s+/g,'').replace(/;+$/,'').toLowerCase();
    if(original.protocol==='javascript:' && !original.search && !original.hash && ['', 'void(0)', 'void0'].includes(script))return {level:'ignored',findings:[],url:original.href,hostname:'',text};
    if(['javascript:','data:','file:'].includes(original.protocol)) add('SCHEME','caution','일반 웹 주소가 아닌 링크입니다. 실행하면 페이지 기능이나 파일 열기 등의 동작이 진행될 수 있습니다.');
    return {level:findings.length?'caution':'ignored',findings,url:original.href,hostname:'',text};
  }
  const {target,wrapped}=wrappedTarget(original);
  const host=target.hostname.toLowerCase().replace(/\.$/,'');
  const domain=domainOf(host);
  const shown=displayedHosts(text);
  const bases=[...new Set(protectedDomains.map(normalizeDomain).filter(Boolean))];
  if(shown.some(display => !sameSite(display,host))) add('MISMATCH','danger',`표시된 주소 ${shown.map(unicodeHost).join(', ')}와 실제 링크 도메인 ${unicodeHost(host)}이 다릅니다.${wrapped?' 알려진 중간 링크에 포함된 주소를 비교했습니다.':''}`);
  if(original.username || target.username) add('USERINFO','danger',`@ 앞부분은 목적지 도메인이 아닙니다. 실제 호스트는 ${unicodeHost((original.username?original:target).hostname)}입니다.`);
  const references=[...new Set([...bases,...shown])];
  for(const ref of references) {
    if(sameSite(host,ref)) continue;
    if(knownDomains.includes(domain) && !shown.includes(ref)) continue;
    const referenceDomain=domainOf(ref), refUnicode=unicodeHost(referenceDomain), actualUnicode=unicodeHost(domain);
    if(host.includes(referenceDomain+'.')) add('SUBDOMAIN','danger',`${unicodeHost(referenceDomain)}이 주소 앞부분에 들어 있지만 실제 등록 도메인은 ${unicodeHost(domain)}입니다.`);
    if(skeleton(domain)===skeleton(referenceDomain) && domain!==referenceDomain) add('HOMOGLYPH','danger',`${actualUnicode}은 ${refUnicode}과 모양이 비슷한 다른 문자를 사용합니다.`);
    const refSuffix=getPublicSuffix(referenceDomain,psl), actualSuffix=getPublicSuffix(domain,psl);
    const refStem=refUnicode.slice(0,-(refSuffix?.length+1 || 0));
    const actualStem=actualUnicode.slice(0,-(actualSuffix?.length+1 || 0));
    if(refStem.length>=4 && actualStem.length>=3) {
      const distance=editDistance(actualStem,refStem);
      if(distance>0 && distance<=(refStem.length>=9?2:1)) add('TYPO','danger',`${actualUnicode}은 기준 도메인 ${refUnicode}에서 글자 ${distance}개를 바꾸거나 순서를 바꾸면 같아집니다.`);
      if(actualStem===refStem && actualSuffix!==refSuffix) add('BRAND','caution',`${refStem} 이름은 같지만 도메인 끝부분이 ${refSuffix}에서 ${actualSuffix}로 다릅니다.`);
      else if(actualStem!==refStem && actualStem.includes(refStem)) add('BRAND','caution',`${refUnicode} 이름에 다른 단어가 붙은 별도 도메인 ${actualUnicode}입니다.`);
    }
    let remainder=target.pathname+target.search+target.hash;
    try { remainder=decodeURIComponent(remainder); } catch { /* Keep malformed input as text. */ }
    if(remainder.toLowerCase().includes(referenceDomain)) add('PATH','caution',`${refUnicode}은 실제 호스트가 아닌 경로 또는 매개변수에 들어 있습니다. 실제 호스트는 ${unicodeHost(host)}입니다.`);
  }
  const redirectEntry=[...target.searchParams].find(([key,value])=>redirectKeys.has(key.toLowerCase()) && /^https?:\/\//i.test(value));
  if(shorteners.has(domain) || redirectEntry) add('REDIRECT','caution','중간 경유 주소일 수 있습니다. 자동 접속하지 않으므로 최종 목적지는 확인하지 않았습니다.');
  const level=findings.some(f=>f.severity==='danger')?'danger':findings.length?'caution':'clear';
  return {url:original.href,hostname:host,domain,displayHostname:unicodeHost(host),targetUrl:target.href,wrapped,text,findings,level};
}
