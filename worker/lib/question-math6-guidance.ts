import spec from '../../data/question-pilot-math6-curriculum.json';
/** Application guidance, bound to exact official code/title; not new descriptors. */
export function math6PilotGuidance(context:any):string|null{
 if(context?.gradeLevel!==6||!spec.outcomes.some(o=>o.code===context.outcomeCode&&o.title===context.outcomeTitle))return null;
 const focus:Record<string,string>={
  'MAT.6.1.1':'Reason about factors and multiples using justified claims and examples, not only a bare calculation.',
  'MAT.6.1.2':'Derive and justify divisibility criteria for 2, 3, 4, 5, 6, 9 and 10 only; do not invent extra official criteria.',
  'MAT.6.1.3':'Analyze primality and prime factors. One is not prime; zero is not prime. Distinguish prime factors from all factors.',
  'MAT.6.1.4':'Interpret common factors and common multiples in age-appropriate contexts and representations. Do not introduce EBOB/EKOK or GCD/LCM terminology or their formal algorithms: the official teaching scope explicitly excludes these concepts here.',
 };
 return 'MEB '+context.outcomeCode+'; verified first-theme source '+spec.sourceUrl+'. '+focus[context.outcomeCode]+' This is a bounded theme, not full-grade qualification. Final independent editorial and originality review remains required.';
}
