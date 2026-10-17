import spec from '../../data/question-math8-target-2028.json';
export function math8PilotGuidance(context:any):string|null{
 if(context?.gradeLevel!==8||!spec.outcomes.some(o=>o.code===context.outcomeCode&&o.title===context.outcomeTitle))return null;
 const focus:Record<string,string>={
  'MAT.8.1.1':'Reason about rational bases and integer exponents, including zero/negative exponents with nonzero-base restrictions. Distinguish a negative base in parentheses from a leading minus. Decimal place-value decomposition is limited to thousandths; do not introduce scientific notation in this theme.',
  'MAT.8.1.2':'Connect square area to its nonnegative side length, exact perfect-square roots, bounding nonperfect roots between natural numbers and labelled approximations. Do not introduce transforming a radical into coefficient-times-radical form or moving coefficients under the radical in this theme.',
  'MAT.8.1.3':'Assess rationality using terminating, repeating and nonrepeating infinite decimal representations. A finite calculator display does not prove rationality or irrationality. Not every square root is irrational.',
  'MAT.8.1.4':'Interpret real numbers on a number line and open, closed, half-open and unbounded intervals. Keep endpoint inclusion and rational/irrational membership explicit; infinity is not an included real endpoint.',
 };
 return 'MEB '+context.outcomeCode+'; current source '+spec.sourceUrl+'. '+focus[context.outcomeCode]+' Target year 2027-2028 is ANUNEX planning metadata, not verification of an annual plan or the 2028 LGS specification. First-theme guidance only; subject-specific proof, editorial quality, originality and rights qualification remain required.';
}
