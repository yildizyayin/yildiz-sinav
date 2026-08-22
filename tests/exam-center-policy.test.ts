import { describe,expect,it } from 'vitest';
import { CENTRAL_PARTICIPANT_LABEL,centralCatalogAllowed,nextRankingActions,percentileFromRank,rankingDisplay } from '../worker/lib/exam-center-policy';

describe('Exam Center policy',()=>{
  it('central exams require verified catalog status',()=>{
    expect(centralCatalogAllowed('CENTRAL',false)).toBe(false);
    expect(centralCatalogAllowed('CENTRAL',true)).toBe(true);
    expect(centralCatalogAllowed('NETWORK',false)).toBe(true);
    expect(centralCatalogAllowed('INSTITUTION',false)).toBe(true);
  });

  it('locks ranking publication into freeze/build/publish sequence',()=>{
    expect(nextRankingActions('OPEN')).toEqual({canFreeze:true,canBuild:false,canPublish:false,isPublished:false});
    expect(nextRankingActions('FROZEN').canBuild).toBe(true);
    expect(nextRankingActions('READY').canPublish).toBe(true);
    expect(nextRankingActions('PUBLISHED').isPublished).toBe(true);
  });

  it('uses participant-safe Turkey-wide wording',()=>{
    expect(CENTRAL_PARTICIPANT_LABEL).toBe('Türkiye Geneli Katılımcılar Arasında');
  });

  it('computes deterministic participant percentile and display',()=>{
    expect(percentileFromRank(1,500000)).toBe(0);
    expect(percentileFromRank(250001,500001)).toBe(50);
    expect(percentileFromRank(1,1)).toBe(0);
    expect(percentileFromRank(10,5)).toBeNull();
    expect(rankingDisplay(8421,128643)).toBe('8421 / 128643');
    expect(rankingDisplay(null,100)).toBe('—');
  });
});
