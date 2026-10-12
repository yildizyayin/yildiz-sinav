/**
 * ANUNEX question-media publication contract.
 * Pure validation only: no providers, D1 writes or automatic approval.
 * Call this before attaching an approved visual/video solution to a question.
 */
export type MediaKind = 'SVG_DIAGRAM' | 'CHART' | 'MAP' | 'ILLUSTRATION' | 'VIDEO_SOLUTION';
export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type PublicationAsset = {
  id: string;
  kind: MediaKind;
  questionId: string;
  questionRevision: number;
  sha256: string;
  mimeType: string;
  reviewStatus: ReviewStatus;
  accessibilityText: string;
  rights: 'OWNED' | 'LICENSED' | 'PUBLIC_DOMAIN' | 'RESTRICTED';
  width?: number;
  height?: number;
  durationSeconds?: number;
  narratedSolutionRevision?: number;
};
export type QuestionRelease = {
  id: string;
  revision: number;
  curriculumVersionId: string;
  outcomeId: string;
  approved: boolean;
  correctAnswer: string;
  solutionRevision: number;
};
export type PublicationCheck = {ok: boolean; errors: string[]};
const hexDigest = /^[a-f0-9]{64}$/i;
const validId = (s: string) => typeof s === 'string' && s.trim().length > 0;
export function validateQuestionMediaRelease(
  question: QuestionRelease,
  assets: PublicationAsset[],
  options: {requireVideo?: boolean; requireVisual?: boolean} = {},
): PublicationCheck {
  const errors: string[] = [];
  if (!validId(question.id) || !validId(question.curriculumVersionId) || !validId(question.outcomeId)) errors.push('QUESTION_CONTEXT_MISSING');
  if (!Number.isSafeInteger(question.revision) || question.revision < 1 || !Number.isSafeInteger(question.solutionRevision) || question.solutionRevision < 1) errors.push('INVALID_QUESTION_REVISION');
  if (!question.approved || !validId(question.correctAnswer)) errors.push('QUESTION_NOT_APPROVED');
  if (new Set(assets.map(a => a.id)).size !== assets.length) errors.push('DUPLICATE_ASSET_ID');
  for (const asset of assets) {
    if (!validId(asset.id) || asset.questionId !== question.id || asset.questionRevision !== question.revision) errors.push('STALE_OR_FOREIGN_ASSET');
    if (!hexDigest.test(asset.sha256)) errors.push('ASSET_DIGEST_REQUIRED');
    if (asset.reviewStatus !== 'APPROVED' || asset.rights === 'RESTRICTED') errors.push('ASSET_NOT_CLEARED');
    if (!validId(asset.accessibilityText)) errors.push('ACCESSIBILITY_TEXT_REQUIRED');
    if (asset.kind === 'VIDEO_SOLUTION') {
      if (asset.mimeType !== 'video/mp4' && asset.mimeType !== 'video/webm') errors.push('INVALID_VIDEO_FORMAT');
      if (!Number.isFinite(asset.durationSeconds) || (asset.durationSeconds ?? 0) <= 0) errors.push('INVALID_VIDEO_DURATION');
      if (asset.narratedSolutionRevision !== question.solutionRevision) errors.push('STALE_VIDEO_SOLUTION');
    } else {
      const validMime = asset.kind === 'SVG_DIAGRAM' || asset.kind === 'CHART' || asset.kind === 'MAP'
        ? ['image/svg+xml', 'image/png', 'image/webp'].includes(asset.mimeType)
        : ['image/png', 'image/webp', 'image/jpeg'].includes(asset.mimeType);
      if (!validMime) errors.push('INVALID_IMAGE_FORMAT');
      if (!Number.isSafeInteger(asset.width) || (asset.width ?? 0) < 320 || !Number.isSafeInteger(asset.height) || (asset.height ?? 0) < 180) errors.push('IMAGE_DIMENSIONS_INSUFFICIENT');
    }
  }
  if (options.requireVideo && !assets.some(a => a.kind === 'VIDEO_SOLUTION')) errors.push('VIDEO_SOLUTION_REQUIRED');
  if (options.requireVisual && !assets.some(a => a.kind !== 'VIDEO_SOLUTION')) errors.push('VISUAL_REQUIRED');
  return {ok: errors.length === 0, errors: [...new Set(errors)]};
}

/** Existing exposure policy is enforced by selection services, not by changing its stored history. */
export function mayOfferQuestionForNewWork(
  questionFamilyId: string,
  exposedQuestionFamilies: ReadonlySet<string>,
  studentRequestedRepeat: boolean,
): boolean {
  if (!validId(questionFamilyId)) return false;
  return studentRequestedRepeat || !exposedQuestionFamilies.has(questionFamilyId);
}
