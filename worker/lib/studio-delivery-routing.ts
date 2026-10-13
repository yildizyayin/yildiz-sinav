/**
 * Side-effect-free contract for Studio publishing to the proper assessment domain.
 * Integration services must commit the selected destination and idempotency key
 * atomically and verify the actor/tenant before applying it.
 */
export type DeliveryKind = 'EXAM' | 'HOMEWORK' | 'MINI_TEST';
export type Destination = 'EXAM_CENTER' | 'ASSIGNMENTS' | 'COACH_PRACTICE';
export type StudioDeliveryInput = {
  documentId: string;
  institutionId: string;
  publicationRevision: number;
  kind: DeliveryKind;
  approved: boolean;
  questionIds: readonly string[];
  bookletCodes?: readonly string[];
};
export type DeliveryPlan = {
  destination: Destination;
  documentId: string;
  institutionId: string;
  idempotencyKey: string;
  assessmentMode: 'EXAM_RESULT' | 'LEARNING_EVIDENCE';
  createExamRecord: boolean;
  createAssignmentRecord: boolean;
};
export type DeliveryResult = {ok: true; plan: DeliveryPlan} | {ok: false; reason: string};
const safeId = (value: string) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
export function planStudioDelivery(input: StudioDeliveryInput): DeliveryResult {
  if (!safeId(input.documentId) || !safeId(input.institutionId)) return {ok:false,reason:'INVALID_SCOPE'};
  if (!Number.isSafeInteger(input.publicationRevision) || input.publicationRevision < 1) return {ok:false,reason:'INVALID_REVISION'};
  if (!input.approved) return {ok:false,reason:'NOT_PUBLISHED'};
  if (!Array.isArray(input.questionIds) || input.questionIds.length === 0 ||
      input.questionIds.some(id => !safeId(id)) || new Set(input.questionIds).size !== input.questionIds.length)
    return {ok:false,reason:'INVALID_QUESTIONS'};
  const destinations: Record<DeliveryKind,Destination> = {
    EXAM:'EXAM_CENTER',HOMEWORK:'ASSIGNMENTS',MINI_TEST:'COACH_PRACTICE',
  };
  const destination = destinations[input.kind];
  if (!destination) return {ok:false,reason:'INVALID_KIND'};
  if (input.kind === 'EXAM') {
    if (!input.bookletCodes?.length || input.bookletCodes.some(code=>!['A','B','C','D'].includes(code)) ||
        new Set(input.bookletCodes).size !== input.bookletCodes.length)
      return {ok:false,reason:'INVALID_BOOKLETS'};
  }
  const key = ['studio',input.institutionId,input.documentId,String(input.publicationRevision),input.kind].join(':');
  return {ok:true,plan:{
    destination,documentId:input.documentId,institutionId:input.institutionId,
    idempotencyKey:key,assessmentMode:input.kind === 'EXAM'?'EXAM_RESULT':'LEARNING_EVIDENCE',
    createExamRecord:input.kind === 'EXAM',
    createAssignmentRecord:input.kind === 'HOMEWORK',
  }};
}

/**
 * Translate only explicit Studio workflows. WORKSHEET is not automatically a
 * homework assignment: the teacher must choose homework delivery explicitly.
 * PERSONAL_BOOK is a printable product and must never create an exam.
 */
export type StoredStudioDocumentType = 'WRITTEN_EXAM' | 'PRACTICE_EXAM' | 'WORKSHEET' | 'PERSONAL_BOOK';
export function resolveStudioDeliveryKind(
  documentType: StoredStudioDocumentType,
  requested: DeliveryKind,
): {ok:true;kind:DeliveryKind}|{ok:false;reason:string} {
  if (documentType === 'WRITTEN_EXAM' || documentType === 'PRACTICE_EXAM')
    return requested === 'EXAM' ? {ok:true,kind:'EXAM'} : {ok:false,reason:'DOCUMENT_DELIVERY_MISMATCH'};
  if (documentType === 'WORKSHEET')
    return requested === 'HOMEWORK' || requested === 'MINI_TEST'
      ? {ok:true,kind:requested} : {ok:false,reason:'DOCUMENT_DELIVERY_MISMATCH'};
  return {ok:false,reason:'PERSONAL_BOOK_IS_NOT_ASSESSMENT'};
}

/**
 * Publish-time curriculum evidence check, supplied from a tenant-scoped DB query.
 * Rejects missing/unverified outcome links rather than treating empty metadata
 * as proof of alignment. The publishing service must validate DB membership too.
 */
export type QuestionOutcomeEvidence = {
  questionId: string;
  gradeLevel: number;
  subjectId: string;
  academicYear: string;
  linkedOutcomeId: string;
  outcomeGradeLevel: number;
  outcomeSubjectId: string;
  curriculumAcademicYear: string;
  curriculumVerified: boolean;
  outcomeActive: boolean;
};
export function validateStudioOutcomeCoverage(
  questionIds: readonly string[],
  evidence: readonly QuestionOutcomeEvidence[],
): {ok:boolean;missingQuestionIds:string[];invalidQuestionIds:string[]} {
  const expected = new Set(questionIds);
  const matching = new Set<string>();
  const invalid = new Set<string>();
  for (const row of evidence) {
    if (!expected.has(row.questionId)) continue;
    const valid = Boolean(row.linkedOutcomeId && row.curriculumVerified && row.outcomeActive &&
      row.gradeLevel === row.outcomeGradeLevel && row.subjectId === row.outcomeSubjectId &&
      row.academicYear === row.curriculumAcademicYear);
    if (valid) matching.add(row.questionId);
    else invalid.add(row.questionId);
  }
  const missingQuestionIds = [...expected].filter(id => !matching.has(id));
  return {ok:missingQuestionIds.length===0&&invalid.size===0,
    missingQuestionIds,invalidQuestionIds:[...invalid]};
}
