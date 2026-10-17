import spec from '../../data/question-math12-target-2028.json';
export function math12PilotGuidance(context:any):string|null{
 if(context?.gradeLevel!==12||!spec.outcomes.some(o=>o.code===context.outcomeCode&&o.title===context.outcomeTitle))return null;
 const focus:Record<string,string>={
  'MAT.12.1.1':'Reason about arithmetic and geometric sequences, their common difference/ratio, general term and finite sums. Make the first index and finite number of terms explicit. Justify finite-sum identities; numerical substitution alone is not a proof. Handle geometric ratio 1 separately from a formula dividing by 1-r; never compute a ratio through a zero predecessor without justification. Do not infer a unique infinite rule from a few terms. Do not replace finite sums by infinite-series formulas.',
  'MAT.12.1.2':'Compare real-valued sequences with real-domain functions through explicit domains, ranges and monotonicity. In this theme sequence indices are positive integers. A connecting curve in a drawing does not change the discrete sequence domain. Distinguish increasing, decreasing, constant and nonmonotone cases using stated definitions; do not infer all-term behavior from a finite sample.',
 };
 return 'MEB '+context.outcomeCode+'; current source '+spec.sourceUrl+'. '+focus[context.outcomeCode]+' This is mathematics, not the distinct MAT.T.12 basic-mathematics program. Target 2027-2028 is ANUNEX planning metadata, not a verified annual plan or 2028 TYT/AYT specification. First-theme guidance only; mathematical proof, editorial quality, originality and rights qualification remain required.';
}
