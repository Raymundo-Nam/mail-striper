import { build } from 'esbuild';
import { mkdir,copyFile,writeFile,readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
await mkdir('dist',{recursive:true});await mkdir('extension/icons',{recursive:true});
await build({entryPoints:['src/content.js'],bundle:true,outfile:'extension/content.js',format:'iife',target:'chrome120',loader:{'.css':'text'},legalComments:'eof'});
await build({entryPoints:['src/demo.js'],bundle:true,outfile:'dist/demo.js',format:'iife',target:'chrome120',loader:{'.css':'text'},legalComments:'eof'});
await copyFile('demo/index.html','dist/index.html');await copyFile('demo/demo.css','dist/demo.css');
let notices='Mail Striper third-party notices\n\n';
for(const [name,path] of [['tldts','node_modules/tldts/LICENSE'],['tldts-core','node_modules/tldts-core/LICENSE'],['Punycode.js','node_modules/punycode/LICENSE-MIT.txt']])notices+=`${name}\n${await readFile(path,'utf8')}\n\n`;
notices+='Public Suffix List data is included through tldts.\nSource: https://publicsuffix.org/list/public_suffix_list.dat\nLicense: Mozilla Public License 2.0, https://mozilla.org/MPL/2.0/\n';
await writeFile('extension/THIRD_PARTY_NOTICES.txt',notices);await copyFile('README.md','extension/README.md');
// Small code-drawn extension icon, generated without a graphics dependency.
function crc32(buf){let crc=0xffffffff;for(const b of buf){crc^=b;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([len,name,data,crc]);}
const glyph=['1100011','1110111','1111111','1101011','1100011','1100011','1100011'];
for(const size of [16,48,128]){const raw=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const ix=y*(size*4+1)+1+x*4;const xx=Math.floor((x/size-.23)/.54*7),yy=Math.floor((y/size-.25)/.5*7);const mark=xx>=0&&xx<7&&yy>=0&&yy<7&&glyph[yy][xx]==='1';const corner=Math.hypot(Math.max(.17*size-x,0,x-.83*size),Math.max(.17*size-y,0,y-.83*size))>.17*size;raw.set(mark?[249,251,242,255]:[41,85,65,corner?0:255],ix);}const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;await writeFile(`extension/icons/${size}.png`,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));}
console.log('Built extension/ and dist/.');
