// Fail closed before inference: no plan upgrades or prepaid-credit routes.
import {mkdirSync,writeFileSync} from 'node:fs';
import {verifyFreeWorkersSubscriptions} from './nibiru-free-subscription-policy.mjs';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
mkdirSync('tmp/nibiru-acceptance',{recursive:true});
let result={ok:false,code:'FREE_PLAN_NOT_VERIFIED',inferenceAllowed:false};
try{
 if(!token||!account)throw new Error('STAGING_CREDENTIALS_MISSING');
 const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/subscriptions`,{
  headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000),
 });
 const body=await response.json();
 if(!response.ok||body.success!==true||!Array.isArray(body.result))throw new Error(`FREE_PLAN_HTTP_${response.status}`);
 const plan=verifyFreeWorkersSubscriptions(body.result);
 if(!plan.ok)throw new Error(plan.code);
 result={ok:true,code:'FREE_ACCOUNT_VERIFIED',inferenceAllowed:true};
}catch(error){result.code=error instanceof Error?error.message:'FREE_PLAN_NOT_VERIFIED';process.exitCode=1;}
writeFileSync('tmp/nibiru-acceptance/free-account.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
