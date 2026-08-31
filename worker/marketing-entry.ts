export default {
  async fetch(request:Request):Promise<Response>{
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/'))return new Response(JSON.stringify({ok:false,error:{code:'NOT_AVAILABLE',message:'Bu alan adı ANUNEX tanıtım sitesidir. Sistem girişi için app.anunex.com adresini kullanın.'}}),{status:404,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
    return new Response(null,{status:404});
  },
} satisfies ExportedHandler;
