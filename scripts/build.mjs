import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),dist=path.join(root,'dist'),files=['index.html','orders.html','orders.js','workbook-reader.js','shipping.html','shipping.js','xlsx-reader.js','shippo-client.js'];
const assets={};
for(const f of files){const content=await fs.readFile(path.join(dist,f),'utf8');assets['/'+f]={text:content,type:f.endsWith('.html')?'text/html;charset=utf-8':'application/javascript;charset=utf-8'}}
const server=await fs.readFile(path.join(root,'worker/server.js'),'utf8');
await fs.mkdir(path.join(dist,'server'),{recursive:true});
await fs.writeFile(path.join(dist,'server/index.js'),server+'\nexport default handler('+JSON.stringify(assets)+');\n');
console.log('Built Worker with '+files.length+' static assets and test-only Shippo endpoints.');
