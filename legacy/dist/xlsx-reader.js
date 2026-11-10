// Compact, dependency-free XLSX reader for standard worksheet data.
// Reads cached formula values and shared/inline strings; never evaluates formulas.
async function readShippingXlsx(buffer){
 const data=new Uint8Array(buffer),view=new DataView(buffer),u16=p=>view.getUint16(p,true),u32=p=>view.getUint32(p,true);
 let end=-1;for(let p=data.length-22;p>=Math.max(0,data.length-65558);p--){if(u32(p)===0x06054b50){end=p;break}}
 if(end<0)throw Error('This is not a valid .xlsx ZIP file');
 const files=new Map();let pos=u32(end+16),total=u16(end+10);
 for(let i=0;i<total;i++){if(u32(pos)!==0x02014b50)throw Error('Invalid Excel ZIP directory');const method=u16(pos+10),compressed=u32(pos+20),nameLen=u16(pos+28),extra=u16(pos+30),comment=u16(pos+32),local=u32(pos+42),name=new TextDecoder().decode(data.slice(pos+46,pos+46+nameLen));files.set(name,{method,compressed,local});pos+=46+nameLen+extra+comment}
 async function content(path){const f=files.get(path);if(!f)throw Error('Missing workbook component: '+path);const start=f.local+30+u16(f.local+26)+u16(f.local+28),bytes=data.slice(start,start+f.compressed);if(f.method===0)return new TextDecoder().decode(bytes);if(f.method!==8)throw Error('Unsupported Excel compression method');const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));return new TextDecoder().decode(await new Response(stream).arrayBuffer())}
 const xml=s=>{const d=new DOMParser().parseFromString(s,'application/xml');if(d.querySelector('parsererror'))throw Error('Could not parse an Excel XML component');return d};
 const children=(node,name)=>Array.from(node?.children||[]).filter(e=>e.localName===name);
 const first=(node,name)=>children(node,name)[0];
 const w=xml(await content('xl/workbook.xml')),sheet=Array.from(w.getElementsByTagName('*')).find(e=>e.localName==='sheet'&&e.getAttribute('name')==='邮寄');
 if(!sheet)throw Error('Worksheet 邮寄 was not found');
 const rid=sheet.getAttribute('r:id')||sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
 const rel=xml(await content('xl/_rels/workbook.xml.rels')),relNode=Array.from(rel.getElementsByTagName('*')).find(e=>e.localName==='Relationship'&&e.getAttribute('Id')===rid);
 if(!relNode)throw Error('Cannot locate the 邮寄 worksheet XML');
 const target=relNode.getAttribute('Target').replace(/^\/+/,'');
 const sheetPath=target.startsWith('xl/')?target:'xl/'+target.replace(/^\.\//,'');
 let strings=[];if(files.has('xl/sharedStrings.xml')){const s=xml(await content('xl/sharedStrings.xml'));strings=Array.from(s.getElementsByTagName('*')).filter(e=>e.localName==='si').map(si=>Array.from(si.getElementsByTagName('*')).filter(e=>e.localName==='t').map(t=>t.textContent).join(''))}
 const doc=xml(await content(sheetPath)),rows=[];
 for(const r of Array.from(doc.getElementsByTagName('*')).filter(e=>e.localName==='row')){const rowNum=Number(r.getAttribute('r'));if(!rowNum||rowNum>100000)continue;const cells=[];for(const c of children(r,'c')){const ref=c.getAttribute('r')||'',letters=(ref.match(/^[A-Z]+/)||[])[0];if(!letters)continue;let col=0;for(const letter of letters)col=col*26+letter.charCodeAt(0)-64;col--;if(col>40)continue;const type=c.getAttribute('t'),v=first(c,'v'),inline=first(c,'is');let value=v?.textContent??'';if(type==='s')value=strings[Number(value)]??'';else if(type==='inlineStr')value=Array.from(inline?.getElementsByTagName('*')||[]).filter(e=>e.localName==='t').map(e=>e.textContent).join('');else if(type==='b')value=value==='1';else if(type!=='str'&&type!=='e'&&value!==''&&!Number.isNaN(Number(value)))value=Number(value);cells[col]=value}rows[rowNum-1]=cells}
 return rows;
}
