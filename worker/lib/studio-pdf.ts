import type { Env } from '../types';
import { all, one } from './db';
import { parseContentJson } from './question-content';

type PdfQuestion = { id:string; stem_text:string; options_json:string|null; content_mode:string; question_no:number; visual_label:string|null };

const PAGE_W = 595;
const PAGE_H = 842;
const enc = new TextEncoder();

function ascii(value: unknown): string {
  return String(value ?? '')
    .replace(/İ|ı/g,'i').replace(/Ğ|ğ/g,'g').replace(/Ş|ş/g,'s').replace(/Ü|ü/g,'u').replace(/Ö|ö/g,'o').replace(/Ç|ç/g,'c')
    .replace(/[^ -~]/g,'?');
}

function pdfEscape(value: unknown): string { return ascii(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)'); }
function wrap(value: unknown, width = 92): string[] { const words=ascii(value).split(/\s+/).filter(Boolean); const lines:string[]=[];let line='';for(const word of words){if((line?line+' ':'').length+word.length>width&&line){lines.push(line);line=word}else line=line?`${line} ${word}`:word}if(line)lines.push(line);return lines.length?lines:['']; }
function text(cmds:string[],x:number,y:number,value:unknown,size=10){cmds.push(`0 0 0 rg BT /F1 ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`)}
function rect(cmds:string[],x:number,y:number,w:number,h:number,fill=false){cmds.push(`${fill?'0.94 0.96 1 rg':'0.15 0.20 0.30 RG'} ${fill?'':'0.8 w'} ${x} ${y} ${w} ${h} re ${fill?'f':'S'}`)}
function circle(cmds:string[],x:number,y:number,r:number){const k=.5522848*r;cmds.push(`0.18 0.23 0.32 RG 0.7 w ${x+r} ${y} m ${x+r} ${y+k} ${x+k} ${y+r} ${x} ${y+r} c ${x-k} ${y+r} ${x-r} ${y+k} ${x-r} ${y} c ${x-r} ${y-k} ${x-k} ${y-r} ${x} ${y-r} c ${x+k} ${y-r} ${x+r} ${y-k} ${x+r} ${y} c S`)}

function pageForQuestions(title:string, booklet:string, questions:PdfQuestion[]): string {
  const c:string[]=[];rect(c,32,32,531,778,true);text(c,48,785,title,17);text(c,48,765,`Kitapcik ${booklet} · Soru Havuzu`,9);let y=735;
  questions.forEach((q,index)=>{if(y<120){c.push('');y=735}rect(c,48,y-76,499,72,false);text(c,60,y-18,`${index+1}.`,11);let ty=y-34;for(const line of wrap(q.stem_text,78).slice(0,3)){text(c,78,ty,line,9);ty-=12}if(q.content_mode!=='TEXT'||q.visual_label){rect(c,78,ty-30,130,24,true);text(c,87,ty-15,`Gorsel icerik${q.visual_label?`: ${q.visual_label}`:''}`,7);ty-=40}const opts=parseContentJson<any[]>(q.options_json,[]).slice(0,5);const labels=['A','B','C','D','E'];let ox=78;for(let i=0;i<opts.length;i++){const value=typeof opts[i]==='string'?opts[i]:opts[i]?.text||opts[i]?.content||'';text(c,ox,ty,`${labels[i]}) ${wrap(value,25)[0]}`,8);ox+=95}y-=92});return c.join('\n');
}

function opticalPage(title:string,booklet:string,questionCount:number,optionCount:number): {content:string;geometry:Record<string,unknown>} {
  const c:string[]=[];rect(c,32,32,531,778,true);text(c,70,770,title,16);text(c,70,750,`Telefon kamerasiyla okutulabilir optik · Kitapcik ${booklet}`,8);
  for(const [x,y] of [[42,788],[541,788],[42,42],[541,42]])rect(c,x,y,12,12,true);
  text(c,48,710,'Ogrenci No',9);for(let i=0;i<8;i++){rect(c,112+i*28,704,20,18,false)}text(c,360,710,'Kitapcik',9);['A','B'].forEach((v,i)=>{circle(c,412+i*28,711,7);text(c,408+i*28,708,v,7)});
  const options=optionCount===5?['A','B','C','D','E']:['A','B','C','D'];const cells:any[]=[];const columns=2;const rows=Math.ceil(questionCount/columns);for(let i=0;i<questionCount;i++){const col=Math.floor(i/rows),row=i%rows;const baseX=70+col*245,baseY=666-row*28;text(c,baseX,baseY,`${i+1}.`,8);options.forEach((op,j)=>{const x=baseX+28+j*29;circle(c,x,baseY+3,7);text(c,x-3,baseY,op,6);cells.push({xMm:x/2.83465,yMm:(PAGE_H-(baseY+3))/2.83465,questionNo:i+1,option:op,radiusMm:2.5})})}return {content:c.join('\n'),geometry:{version:'ANUNEX-OPTICAL-1',pageWidthMm:210,pageHeightMm:297,fiducials:{targets:[{xMm:16.9,yMm:16.9},{xMm:193.1,yMm:16.9},{xMm:16.9,yMm:274.3},{xMm:193.1,yMm:274.3}],searchRadiusRatio:.06},cameraGeometry:{regions:[{id:'answers',purpose:'answers',subjectCode:'GENEL',questionCount,options,cells,markThreshold:.48,doubleMarkDelta:.08}]}}};
}

export async function renderStudioPdf(env:Env, documentId:string, booklet:string): Promise<{bytes:ArrayBuffer; metadata:Record<string,unknown>; questionCount:number}> {
  const doc=await one<any>(env.DB.prepare('SELECT * FROM studio_documents WHERE id=?').bind(documentId));if(!doc)throw new Error('STUDIO_NOT_FOUND');
  const rows=await all<PdfQuestion>(env.DB.prepare(`SELECT q.id,q.stem_text,q.options_json,q.content_mode,i.sort_order question_no,
      (SELECT alt_text FROM question_assets a WHERE a.question_id=q.id AND a.placement='STEM' ORDER BY a.sort_order,a.id LIMIT 1) visual_label
      FROM studio_document_items i JOIN question_bank q ON q.id=i.question_id WHERE i.document_id=? AND i.booklet_code=? ORDER BY i.sort_order`).bind(documentId,booklet));
  const optionCounts=rows.map(row=>Number(parseContentJson<any[]>(row.options_json,[]).length)).filter(Boolean);const optionCount=optionCounts.some(x=>x>=5)?5:4;
  const optical=opticalPage(doc.title,booklet,rows.length,optionCount);const pageContents=[pageForQuestions(doc.title,booklet,rows),optical.content];
  const objects:string[]=[];const add=(s:string)=>{objects.push(s);return objects.length};const font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');const streams=pageContents.map(content=>add(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`));const firstPageId=objects.length+1;const pageObjectIds=streams.map((_,index)=>firstPageId+index);const pagesId=firstPageId+pageObjectIds.length;
  for(const streamId of streams) add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${streamId} 0 R >>`);
  const pages=add(`<< /Type /Pages /Kids [${pageObjectIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`);if(pages!==pagesId)throw new Error('PDF_PAGE_TREE_ERROR');const catalog=add(`<< /Type /Catalog /Pages ${pages} 0 R >>`);
  let out='%PDF-1.4\n%\xFF\xFF\xFF\xFF\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(enc.encode(out).length);out+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`}const xref=enc.encode(out).length;out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(let i=1;i<=objects.length;i++)out+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;out+=`trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return {bytes:enc.encode(out).buffer,metadata:{bookletCode:booklet,questionCount:rows.length,optionCount,optical:optical.geometry},questionCount:rows.length};
}
