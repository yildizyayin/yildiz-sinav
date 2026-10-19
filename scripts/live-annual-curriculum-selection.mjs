import {login,req} from './question-production-live-client.mjs';
await login();
const before=await req('/api/admin/annual-content-plans');if(before.status!==200||before.p.plans.some(p=>!Array.isArray(p.curriculumSources)))throw Error('SOURCE_SET_API_NOT_DEPLOYED');
const cases=[
 {academicYear:'2027-2028',grades:[5],curriculumVersionIdsByGrade:{5:['nonexistent_version']}},
 {academicYear:'2027-2028',grades:[5],curriculumVersionIdsByGrade:{5:[]}},
 {academicYear:'2027-2028',grades:[5]},
];
const results=[];
for(const input of cases){const r=await req('/api/admin/annual-content-plans/generate',input);if(r.status!==200||r.p.generated!==false||r.p.results.some(v=>v.status==='PLANNED'))throw Error('INVALID_SELECTION_WAS_NOT_BLOCKED');results.push(r.p.results);}
const after=await req('/api/admin/annual-content-plans');if(after.status!==200||JSON.stringify(before.p)!==JSON.stringify(after.p))throw Error('EXISTING_PLANS_CHANGED');
console.log(JSON.stringify({passed:true,environment:'staging',blockedCases:results,existingPlans:after.p.plans.length,plansUnchanged:true,productionCalls:0}));
