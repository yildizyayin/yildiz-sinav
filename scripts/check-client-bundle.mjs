import {readFileSync,statSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {resolve,sep} from 'node:path';
import assert from 'node:assert/strict';

const root=resolve('dist/client');
const manifest=JSON.parse(readFileSync(resolve(root,'.vite/manifest.json'),'utf8'));
const entry=Object.entries(manifest).find(([,chunk])=>chunk.isEntry);
assert(entry,'Build the client before checking its bundle.');
const initial=new Set();
function visit(key){
 if(initial.has(key))return;
 assert(manifest[key],`Missing static import: ${key}`);
 initial.add(key);
 for(const dependency of manifest[key].imports||[])visit(dependency);
}
visit(entry[0]);
let bytes=0,gzipBytes=0;
for(const key of initial){
 const chunk=manifest[key];
 assert(!key.startsWith('src/pages/'),`A page was bundled into startup: ${key}`);
 assert(!/xlsx/i.test(key+' '+chunk.file),'Excel must remain outside startup.');
 const path=resolve(root,chunk.file);
 assert(path.startsWith(root+sep),'Unexpected asset path.');
 bytes+=statSync(path).size;gzipBytes+=gzipSync(readFileSync(path)).length;
}
for(const page of ['Login','MarketingHome','ResultPortal','ExamDefinitions','ResultNetworkAdmin','Reports']){
 const key=`src/pages/${page}.tsx`;
 assert(manifest[key]?.isDynamicEntry,`${page} must load on demand.`);
 assert(!initial.has(key),`${page} was preloaded into startup.`);
}
assert(bytes<400_000,`Startup JavaScript exceeds its 400 kB budget: ${bytes} bytes.`);
console.log(JSON.stringify({startupJavaScriptBytes:bytes,startupGzipBytes:gzipBytes,staticChunkCount:initial.size,dynamicPageCount:Object.keys(manifest).filter(key=>key.startsWith('src/pages/')&&manifest[key].isDynamicEntry).length},null,2));
