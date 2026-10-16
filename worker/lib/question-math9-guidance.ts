import spec from '../../data/question-pilot-math9-curriculum.json';
/** Source-bound teaching scope plus application correctness requirements. */
export function math9PilotGuidance(context:any):string|null{
 if(context?.gradeLevel!==9||!spec.outcomes.some(o=>o.code===context.outcomeCode&&o.title===context.outcomeTitle))return null;
 const focus:Record<string,string>={
  'MAT.9.1.1':'Reason about real-number powers, roots and justified generalizations. State real-domain/sign conditions; distinguish exact results from approximations. Do not assume sqrt(x squared)=x for negative x or extend rational exponent rules outside their real domain.',
  'MAT.9.1.2':'Use real intervals with number-line, algebraic and set representations; specify endpoint inclusion and the real-number universe for complements. The official scope treats absolute value as an interval representation, without introducing equation/inequality solving outside that context. Infinity is not an included real endpoint.',
  'MAT.9.1.3':'Reason about number-set order, between-ness and operation properties using valid examples, generalizations and counterexamples. A finite sample is not a universal proof. Account for zero-denominator exclusions in division claims.',
  'MAT.9.1.4':'Generalize real-number operation properties to algebra through explained analogy. State variable domains and restrictions; do not treat cancellation at a zero denominator as a valid universal identity.',
 };
 return 'MEB '+context.outcomeCode+'; verified first-theme source '+spec.sourceUrl+'. '+focus[context.outcomeCode]+' Bounded first-theme guidance only; independent mathematical solution, editorial, originality and rights gates remain required.';
}
