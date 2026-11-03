import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {mkdtemp,writeFile,readFile,readdir,mkdir,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const temp=await mkdtemp(resolve('.cinematic-preview-'));
try {
 const entry=join(temp,'preview.tsx');
 await writeFile(entry,`
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ResultStudentEntrance} from '../src/components/ResultStudentEntrance';
import {AnunexBrand} from '../src/components/AnunexBrand';
function Preview(){
 const [run,setRun]=useState({id:0,grade:12});
 const play=(grade:number)=>setRun(x=>({id:x.id+1,grade}));
 return <><main className="preview-card"><AnunexBrand inverse tagline/><div className="preview-kicker">ÖĞRENCİ GİRİŞİ</div><h1>Açılış önizlemesi</h1><p>Başarılı öğrenci girişinde gösterilen Nibiru geçişini tekrar oynat.</p><div className="preview-actions"><button onClick={()=>play(6)}>5–7. sınıfı oynat</button><button onClick={()=>play(12)}>8–12. sınıfı oynat</button></div><small>Önizleme çevrimdışı çalışır. Öğrenci hesabı veya verisi kullanılmaz. Esc ile geçilebilir. Sistem hareketi azaltıyorsa animasyon gösterilmez.</small></main>{run.id>0&&<ResultStudentEntrance key={run.id} grade={run.grade}/>}</>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
`);
 const out=join(temp,'build');
 await build({configFile:false,define:{"process.env.NODE_ENV":JSON.stringify("production")},publicDir:false,plugins:[react()],build:{outDir:out,emptyOutDir:true,cssCodeSplit:false,minify:true,lib:{entry,formats:['iife'],name:'AnunexEntrancePreview',fileName:'preview'}}});
 const files=await readdir(out);
 const js=await readFile(join(out,files.find(x=>x.endsWith('.js'))),'utf8');
 const css=(await Promise.all(files.filter(x=>x.endsWith('.css')).map(x=>readFile(join(out,x),'utf8')))).join('\n');
 const folder=resolve('docs/design/result-student-cinematic');await mkdir(folder,{recursive:true});
 await writeFile(join(folder,'ANUNEX-ogrenci-acilis-onizlemesi.html'),`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ANUNEX · Öğrenci açılış önizlemesi</title><style>
${css}
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:20px;color:#ecf7ff;background:#081622;font-family:Inter,system-ui,sans-serif}.preview-card{width:min(100%,570px);padding:clamp(24px,6vw,52px);border:1px solid #315066;border-radius:22px;background:#10283b;box-shadow:0 30px 80px #0005}.preview-kicker{margin-top:42px;font-size:12px;letter-spacing:.18em;color:#9bd7ff}.preview-card h1{font-size:clamp(27px,5vw,40px);line-height:1.15;margin:12px 0 16px}.preview-card p,.preview-card small{color:#bdd3e3;line-height:1.6}.preview-actions{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0}.preview-actions button{cursor:pointer;min-height:46px;padding:10px 16px;border:1px solid #76bce5;border-radius:9px;background:#1a4867;color:white;font:600 14px system-ui}.preview-actions button:focus-visible{outline:3px solid #abdcff;outline-offset:3px}.preview-card small{display:block}
</style></head><body><div id="root"></div><script>${js.replaceAll('</script','<'+String.fromCharCode(92)+'/script')}</script></body></html>`);
}finally{await rm(temp,{recursive:true,force:true});}
