import spec from '../../data/question-pilot-math7-curriculum.json';
/** Application guidance tied to exact official code/title. */
export function math7PilotGuidance(context:any):string|null{
 if(context?.gradeLevel!==7||!spec.outcomes.some(o=>o.code===context.outcomeCode&&o.title===context.outcomeTitle))return null;
 const focus:Record<string,string>={
  'MAT.7.1.1':'Interpret natural numbers, integers and rational numbers in context, including number-line position, direction and absolute distance from zero. Every integer is rational; a rational denominator must be nonzero.',
  'MAT.7.1.2':'Connect exact rational values to terminating or repeating decimal representations. Do not treat a finite truncation as exact equality to a repeating value. Use Turkish decimal commas and an explicit unambiguous repetition notation.',
  'MAT.7.1.3':'Interpret rational comparison and ordering with equivalent fractions and number-line position, including negative values and values between two distinct rational numbers. Do not reverse negative-number order incorrectly.',
  'MAT.7.1.4':'Solve meaningful real-life rational-number problems by selecting, explaining and checking a strategy. Keep denominator nonzero and distinguish signed change from absolute distance. Do not present a rounded decimal as an exact rational result.',
 };
 return 'MEB '+context.outcomeCode+'; verified first-theme source '+spec.sourceUrl+'. '+focus[context.outcomeCode]+' First-theme guidance is not full-grade or production qualification. Independent solution, editorial, originality and rights gates remain required.';
}
