const BASE=(process.env.SMOKE_BASE_URL||'https://yildiz-sinav-v1.rtsgida.workers.dev').replace(/\/$/,'');
const PASSWORD=process.env.SMOKE_DEMO_PASSWORD||'Demo123!';const TOKEN='XXXX.DUMMY.TOKEN.XXXX';
function assert(v,m,d){if(!v)throw new Error(`${m}${d===undefined?'':`\n${JSON.stringify(d,null,2)}`}`)}
function minimalPdf(label){
 const safe=String(label).replace(/[()\\]/g,' ').replace(/[^\x20-\x7E]/g,' ');
 const stream=`BT\n/F1 18 Tf\n72 760 Td\n(${safe}) Tj\n0 -32 Td\n/F1 11 Tf\n(Synthetic staging acceptance document - not production content.) Tj\nET\n`;
 const objs=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
 ];
 let out='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objs.length;i++){offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${objs[i]}\nendobj\n`;}
 const xref=Buffer.byteLength(out);out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;for(let i=1;i<offsets.length;i++)out+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;out+=`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(out,'ascii');
}
async function login(){const r=await fetch(`${BASE}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:'super',password:PASSWORD,remember:false,turnstileToken:TOKEN}),redirect:'manual'});const p=await r.json();assert(r.ok&&p?.ok===true,'super login failed',p);const cookie=(r.headers.get('set-cookie')||'').match(/(yildiz_session=[^;]+)/)?.[1];assert(cookie,'session cookie missing');return cookie;}
async function list(cookie){const r=await fetch(`${BASE}/api/worksheets`,{headers:{cookie}});const p=await r.json();assert(r.ok&&p?.ok===true,'worksheet list failed',p);return p.worksheets||[];}
async function upload(cookie,worksheetId,assetType,fileName,label){const form=new FormData();form.append('assetType',assetType);form.append('file',new Blob([minimalPdf(label)],{type:'application/pdf'}),fileName);const r=await fetch(`${BASE}/api/worksheets/${encodeURIComponent(worksheetId)}/assets`,{method:'POST',headers:{cookie},body:form});const p=await r.json();assert(r.ok&&p?.ok===true,`${assetType} upload failed`,p);}

const cookie=await login();let rows=await list(cookie);let worksheet=rows.find(x=>x.id==='ws_num_1');assert(worksheet,'ws_num_1 fixture missing',rows.map(x=>x.id));
if(!worksheet.pdf_asset_id)await upload(cookie,'ws_num_1','PDF','standard-demo-foy.pdf','Standard Demo Worksheet');
if(!worksheet.answer_key_asset_id)await upload(cookie,'ws_num_1','ANSWER_KEY','standard-demo-cevap-anahtari.pdf','Standard Demo Answer Key');
rows=await list(cookie);worksheet=rows.find(x=>x.id==='ws_num_1');assert(worksheet?.pdf_asset_id&&worksheet?.answer_key_asset_id,'Standard worksheet R2 assets were not persisted',worksheet);console.log(`✓ Standard worksheet R2 fixture — PDF ${worksheet.pdf_asset_id} · answer key ${worksheet.answer_key_asset_id}`);
