/** Transport/shape retries never override substantive negative scientific/editorial feedback. */
export function verificationProtocolRetryAllowed(v:any){
 if(v?.unavailable!==true)return false;
 if(typeof v.protocolRetryEligible==='boolean')return v.protocolRetryEligible;
 if(typeof v.invalidOutputSample!=='string')return false;
 let raw:any;try{raw=JSON.parse(v.invalidOutputSample)}catch{return true}
 if(!Array.isArray(raw?.reviews))return true;
 return raw.reviews.length>0&&raw.reviews.every((r:any)=>{
  if(r?.editorial&&Object.entries(r.editorial).some(([k,n])=>k!=='rationale'&&typeof n==='number'&&n<3))return false;
  const issues=Array.isArray(r?.issues)?r.issues:[];
  if(issues.some((s:any)=>typeof s!=='string'||!/missing.*editorial.*scores|editorial.*scores.*missing/i.test(s)))return false;
  return r?.valid!==false||issues.length>0;
 });
}
