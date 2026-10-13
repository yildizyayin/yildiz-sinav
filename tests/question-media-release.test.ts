import {describe,expect,it} from 'vitest';
import {mayOfferQuestionForNewWork,validateQuestionMediaRelease,type PublicationAsset} from '../worker/lib/question-media-release';

const question={id:'q1',revision:2,curriculumVersionId:'verified-cv',outcomeId:'o1',approved:true,correctAnswer:'B',solutionRevision:3};
const base:PublicationAsset={id:'v1',kind:'VIDEO_SOLUTION',questionId:'q1',questionRevision:2,sha256:'a'.repeat(64),mimeType:'video/mp4',reviewStatus:'APPROVED',accessibilityText:'Adım adım sesli çözüm ve altyazı',rights:'OWNED',durationSeconds:90,narratedSolutionRevision:3};

describe('question media publication contract',()=>{
 it('accepts an approved video tied to the exact question and solution revisions',()=>expect(validateQuestionMediaRelease(question,[base],{requireVideo:true}).ok).toBe(true));
 it('rejects stale solution narration',()=>expect(validateQuestionMediaRelease(question,[{...base,narratedSolutionRevision:2}]).errors).toContain('STALE_VIDEO_SOLUTION'));
 it('rejects unapproved rights and missing immutable digest',()=>{const errors=validateQuestionMediaRelease(question,[{...base,rights:'RESTRICTED',sha256:'missing'}]).errors;expect(errors).toContain('ASSET_NOT_CLEARED');expect(errors).toContain('ASSET_DIGEST_REQUIRED')});
 it('requires a visual when the question depends on one',()=>expect(validateQuestionMediaRelease(question,[base],{requireVisual:true}).errors).toContain('VISUAL_REQUIRED'));
 it('rejects incorrectly sized illustration',()=>expect(validateQuestionMediaRelease(question,[{...base,kind:'ILLUSTRATION',mimeType:'image/png',width:100,height:100}]).errors).toContain('IMAGE_DIMENSIONS_INSUFFICIENT'));
 it('does not silently reuse an exposed family without an explicit repeat choice',()=>{const seen=new Set(['family-1']);expect(mayOfferQuestionForNewWork('family-1',seen,false)).toBe(false);expect(mayOfferQuestionForNewWork('family-1',seen,true)).toBe(true);expect(mayOfferQuestionForNewWork('family-2',seen,false)).toBe(true)});
});
