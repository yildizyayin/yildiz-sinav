// Workers billing is separate from R2 subscriptions. Only a verified Workers
// Free account may run this acceptance; gateway credit routes are never used.
export function verifyFreeWorkersSubscriptions(rows){
 if(!Array.isArray(rows))return{ok:false,code:'SUBSCRIPTIONS_INVALID'};
 for(const row of rows){
  const plan=row?.rate_plan||{};
  const identity=[plan.id,plan.public_name,plan.name].filter(Boolean).join(' ').toLowerCase();
  // R2 activation often creates an 'R2 Paid' subscription even on accounts
  // using Workers Free. It does not upgrade the Workers/Workers AI plan.
  if(/^r2(?:_|\b)/.test(String(plan.id||'').toLowerCase())||/^r2\b/.test(String(plan.public_name||plan.name||'').toLowerCase()))continue;
  const paid=Number(row?.price)>0||Number(plan.price)>0||/paid|standard|enterprise|business|\bpro\b/.test(identity);
  const workers=/workers|workers[_ -]?ai/.test(identity);
  if(workers&&!/\bfree\b|workers_free/.test(identity))return{ok:false,code:'WORKERS_PLAN_REQUIRES_QUOTA_AUDIT'};
  if(paid)return{ok:false,code:'UNCLASSIFIED_PAID_SUBSCRIPTION_REQUIRES_AUDIT'};
 }
 return{ok:true,code:'FREE_WORKERS_ACCOUNT_VERIFIED'};
}
