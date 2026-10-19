import {useId} from 'react';
/** Exact vector geometry and escaped text; never execute model-provided SVG/HTML. */
export function wrapVisualLabel(text:string,limit=22):string[]{
 const lines:string[]=[];let line='';for(const word of text.split(/\s+/).filter(Boolean)){
  if(line.length+word.length+1>limit&&line){lines.push(line);line=''}
  let rest=word;while(rest.length>limit){if(line){lines.push(line);line=''}lines.push(rest.slice(0,limit));rest=rest.slice(limit)}
  line+=(line?' ':'')+rest;
 }if(line)lines.push(line);return lines.length?lines:[''];
}
export function chartAxisMax(value:number){const raw=Math.max(value,1)/4,unit=10**Math.floor(Math.log10(raw));return ([1,2,2.5,5,10].find(n=>n*unit>=raw)??10)*unit*4;}
export function QuestionDataVisual({blocks=[]}:{blocks?:any[]}){
 const id=useId();
 return <>{blocks.filter(b=>b.placement==='STEM'&&b.payload?.schemaVersion===1).map((b,i)=>{const v=b.payload;
 const caption=<figcaption style={{fontWeight:700,fontSize:16,lineHeight:1.5,marginBottom:12,color:'#173b48'}}>{v.title}{v.unit?<span style={{fontSize:13,fontWeight:400}}> · {v.unit}</span>:null}</figcaption>;
 if(v.kind==='TABLE'&&Array.isArray(v.columns)&&v.columns.length>=2&&v.columns.length<=5&&v.columns.every((c:any)=>typeof c==='string')&&Array.isArray(v.rows)&&v.rows.length<=8&&v.rows.every((r:any)=>Array.isArray(r)&&r.length===v.columns.length&&r.every((c:any)=>typeof c==='string')))return <figure key={b.id||i} style={{margin:'22px 0',overflowX:'auto'}}>{caption}<table aria-label={v.title||'Soru verileri'} style={{borderCollapse:'collapse',width:'100%',fontSize:15,lineHeight:1.6,fontVariantNumeric:'tabular-nums'}}><thead><tr>{v.columns.map((c:string,j:number)=><th scope="col" style={{borderBottom:'2px solid #24596a',padding:'12px 14px',textAlign:'left',background:'#eaf2f4',color:'#173b48',overflowWrap:'anywhere'}} key={j}>{c}</th>)}</tr></thead><tbody>{v.rows.map((r:string[],j:number)=><tr key={j} style={{background:j%2?'#f4f8fa':'#fff'}}>{r.map((c,k)=><td style={{borderBottom:'1px solid #ccdadd',padding:'12px 14px',color:'#173b48',overflowWrap:'anywhere'}} key={k}>{c}</td>)}</tr>)}</tbody></table></figure>;
 if(v.kind==='BAR_CHART'&&Array.isArray(v.categories)&&v.categories.every((c:any)=>typeof c==='string'&&c.length<=60)&&Array.isArray(v.values)&&v.categories.length===v.values.length&&v.values.every((n:any)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e9)){
 const max=chartAxisMax(Math.max(...v.values,1)),n=v.categories.length;if(n<2||n>8)return null;
 const labels=v.categories.map((c:string)=>wrapVisualLabel(c));
 // Column chart retained: each category gets an unclipped label below its bar,
 // and the canvas grows horizontally rather than shrinking or dropping text.
 const step=150,width=Math.max(720,160+n*step),plotHeight=220,labelHeight=Math.max(...labels.map((l:string[])=>l.length))*18+30,totalHeight=plotHeight+labelHeight+65;
 return <figure key={b.id||i} style={{margin:'22px 0'}}>{caption}<div style={{overflowX:'auto',paddingBottom:8}}><svg viewBox={`0 0 ${width} ${totalHeight}`} width={width} height={totalHeight} role="img" aria-labelledby={id+'-'+i} style={{display:'block',maxWidth:'none',fontFamily:'inherit'}}><title id={id+'-'+i}>{b.alt_text||v.categories.map((c:string,j:number)=>`${c}: ${v.values[j]}`).join('; ')}</title>{[0,.25,.5,.75,1].map(t=><g key={t}><line x1="140" y1={plotHeight+30-t*plotHeight} x2={width-12} y2={plotHeight+30-t*plotHeight} stroke={t===0?'#365865':'#dce6e6'} strokeWidth={t===0?1.5:1}/><text x="131" y={plotHeight+34-t*plotHeight} textAnchor="end" fontSize="12" fill="#365865">{Number((max*t).toPrecision(4)).toLocaleString('tr-TR')}</text></g>)}{v.categories.map((c:string,j:number)=>{const barWidth=65,h=v.values[j]/max*plotHeight,x=165+j*step;return <g key={j}><rect x={x} y={plotHeight+30-h} width={barWidth} height={h} fill="#18706d"/><text x={x+barWidth/2} y={plotHeight+20-h} textAnchor="middle" fontSize="13" fontWeight="700" fill="#173b48">{v.values[j].toLocaleString('tr-TR')}</text><text x={x+barWidth/2} y={plotHeight+54} textAnchor="middle" fontSize="12" fill="#173b48">{labels[j].map((line:string,k:number)=><tspan x={x+barWidth/2} dy={k===0?0:18} key={k}>{line}</tspan>)}</text></g>})}</svg></div><details><summary>Grafik verilerini metin olarak göster</summary><table><thead><tr><th>Kategori</th><th>Değer{v.unit?' · '+v.unit:''}</th></tr></thead><tbody>{v.categories.map((c:string,j:number)=><tr key={j}><th scope="row">{c}</th><td>{v.values[j].toLocaleString('tr-TR')}</td></tr>)}</tbody></table><ul style={{position:'absolute',width:1,height:1,overflow:'hidden',clipPath:'inset(50%)'}}>{v.categories.map((c:string,j:number)=><li key={j}>{c}: {v.values[j].toLocaleString('tr-TR')} {v.unit}</li>)}</ul></details></figure>;
 }
 return null;})}</>;
}
