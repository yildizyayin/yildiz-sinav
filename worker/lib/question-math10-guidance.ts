import spec from '../../data/question-pilot-math10-curriculum.json';
/** Exact current-page code/title binding, not legacy PDF-number inference. */
export function math10PilotGuidance(context:any):string|null{
 if(context?.gradeLevel!==10||!spec.outcomes.some(o=>o.code===context.outcomeCode&&o.title===context.outcomeTitle))return null;
 const focus:Record<string,string>={
  'MAT.10.1.1':'Justify right-triangle trigonometric ratios and identities through similarity and valid angle/domain conditions. Unit-circle/directed-angle interpretation belongs to the official scope. Do not confuse opposite/adjacent sides or silently change degrees to radians.',
  'MAT.10.1.2':'Reason about angle bisectors, medians, perpendicular bisectors and altitudes using explicit incidence/perpendicularity assumptions. Distinguish centroid, incenter, circumcenter and orthocenter. Never infer a right angle or equality from an unmarked drawing.',
  'MAT.10.1.3':'Explain area changes using a base and its corresponding perpendicular height; distinguish linear scale from squared area scale. Keep figure labels and units consistent. A decorative picture is not a mathematical premise.',
  'MAT.10.1.4':'Give a valid justification or proof for sine/cosine theorems and apply it under correct side/opposite-angle correspondence in a nondegenerate triangle. Mere numerical substitution does not constitute a proof.',
 };
 return 'MEB '+context.outcomeCode+'; current first-theme source '+spec.sourceUrl+'. '+focus[context.outcomeCode]+' This is guidance only, not qualified geometry rendering or proof. Mathematical solution, editorial, originality and rights gates remain mandatory.';
}
