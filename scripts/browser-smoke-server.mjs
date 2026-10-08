import {createServer} from 'node:http';
import {readFile,stat,realpath} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';

export async function startBrowserSmokeServer(directory){
 const root=await realpath(resolve(directory));await stat(resolve(root,'index.html'));
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
 const server=createServer(async(request,response)=>{
  try{
   const url=new URL(request.url,'http://localhost');
   if(url.pathname.startsWith('/api/')){response.writeHead(501,{'content-type':'application/json'});response.end(JSON.stringify({ok:false,error:{code:'FIXTURE_REQUIRED',message:'This server does not connect to a backend.'}}));return}
   if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return}
   const pathname=decodeURIComponent(url.pathname),requested=resolve(root,'.'+pathname);
   if(requested!==root&&!requested.startsWith(root+sep)){response.writeHead(403);response.end();return}
   let file=requested;
   try{if(!(await stat(file)).isFile())throw new Error('not file')}catch{
    if(pathname.startsWith('/assets/')||extname(pathname)){response.writeHead(404);response.end();return}
    file=resolve(root,'index.html');
   }
   const actual=await realpath(file);if(!actual.startsWith(root+sep)){response.writeHead(403);response.end();return}
   const body=await readFile(actual);response.writeHead(200,{'content-type':types[extname(actual)]||'application/octet-stream','cache-control':'no-store'});response.end(request.method==='HEAD'?undefined:body);
  }catch{response.writeHead(400);response.end()}
 });
 await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok)});
 return {origin:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise((ok,no)=>server.close(e=>e?no(e):ok()))};
}
