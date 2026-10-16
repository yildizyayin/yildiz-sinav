/** Persist operational failure categories without storing provider messages,
 * request contents, credentials or arbitrary exception properties. */
export function questionAiFailure(error:unknown){
 const e=error as any,message=error instanceof Error?error.message:typeof e?.message==='string'?e.message:'';
 const rawCode=typeof e?.code==='number'?e.code:Number(message.match(/\b(30\d{2})\b/)?.[1]);
 const providerCode=Number.isInteger(rawCode)&&rawCode>=3000&&rawCode<=3099?rawCode:null;
 const rawStatus=Number(e?.status??e?.statusCode),httpStatus=[400,401,403,404,408,409,413,422,429,500,502,503,504].includes(rawStatus)?rawStatus:null;
 const diagnosticCode=/Too many SQL queries|D1.*limit/i.test(message)?'D1_QUERY_LIMIT':/QUESTION_.*BUDGET/.test(message)?'DAILY_AI_BUDGET':/^(BLIND_SOLVER|VERIFIER)_TIMEOUT$/.test(message)?'AI_TIMEOUT':httpStatus===429||/rate limit|quota exceeded|too many requests/i.test(message)?'PROVIDER_RATE_LIMIT':providerCode===3045?'PROVIDER_INTERNAL_ERROR':httpStatus===401||httpStatus===403?'PROVIDER_AUTH_ERROR':httpStatus===400||httpStatus===422?'PROVIDER_REQUEST_REJECTED':'PROVIDER_FAILED';
 return {diagnosticCode,providerCode,httpStatus};
}
