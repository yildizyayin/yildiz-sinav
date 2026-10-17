/** Imported outcomes and model agreement are not mathematical qualification. */
export function unsupportedPilotProofScope(context:any):boolean{
 const grade=context?.gradeLevel;
 return [7,8,9,10,11].includes(grade)&&typeof context?.outcomeCode==='string'&&context.outcomeCode.startsWith(`MAT.${grade}.`);
}
