/** Application-owned rules: source verification is a task, never an AI assertion. */
export const CURRENT_CONTEXT_INSTRUCTION='Current-event contexts from Türkiye and the world may be used when they meaningfully assess the verified outcome. Never invent a named athlete, public figure or event performance measurement. Use real event/date/numeric facts only when independently source-verified evidence is supplied in the trusted application context; a URL or producer claim alone is not verification. Otherwise use an explicitly labelled educational model in the student-visible stem, without attributing its measurements to a real person. Distinguish measured, calculated and assumed values and include necessary units/conditions. Use original schematics or assets with recorded usage permission; do not assume news photos, match footage, logos or music are free to reuse. Do not imitate a real person voice or suggest endorsement. Video question/solution/reconstruction must preserve the approved question facts, units, assumptions, options, answer and source revision. Label a reconstruction as a reconstruction, never original event footage. Current context is not itself evidence of pedagogical depth or originality.';
export const CURRENT_CONTEXT_VIDEO_POLICY={
 version:1 as const,
 source:'FROZEN_APPROVED_QUESTION' as const,
 formats:['QUESTION_PRESENTATION','WORKED_SOLUTION','LABELLED_RECONSTRUCTION'] as const,
 distinguish:['VERIFIED_EVENT_FACT','EDUCATIONAL_ASSUMPTION','CALCULATED_RESULT'] as const,
 visualPolicy:'ORIGINAL_SCHEMATIC_OR_PERMISSION_RECORDED_ASSET' as const,
 voicePolicy:'NIBIRU_NARRATION_WITHOUT_REAL_PERSON_IMPERSONATION' as const,
 sourceVerificationRequired:true,
 sourceRevisionRequired:true,
 reconstructionDisclosureRequired:true,
 richAnimationQualified:false,
};
