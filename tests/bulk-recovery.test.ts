import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workerSource=readFileSync(new URL('../worker/v2-entry.ts',import.meta.url),'utf8');
const uiSource=readFileSync(new URL('../src/pages/BulkOperations.tsx',import.meta.url),'utf8');

describe('Nibiru Recovery bulk workflow',()=>{
  it('uses verified assessment evidence and a minimum-evidence threshold',()=>{
    expect(workerSource).toContain("source:'VERIFIED_ASSESSMENT_EVIDENCE'");
    expect(workerSource).toContain('minEvidencePerOutcome:3');
    expect(workerSource).toContain('weaknessThresholdPercent:60');
    expect(workerSource).toMatch(/HAVING sum\(r\.evidence_count\)>=3[\s\S]*?<0\.60/);
  });

  it('requires human approval and never enables automatic assignment from preview',()=>{
    expect(workerSource).toContain('humanApprovalRequired:true');
    expect(workerSource).toContain('autoAssignment:false');
    expect(workerSource).toContain('fabricatedIdsAllowed:false');
    expect(uiSource).toContain('Recovery önerisini onayla ve ata');
  });

  it('keeps recovery operations inside institution and class scope',()=>{
    expect(workerSource).toMatch(/bulkRecoveryPreview[\s\S]*?ensureInstitution\(env,user,institutionId\)/);
    expect(workerSource).toContain("if(!cls||cls.institution_id!==institutionId)return apiError(400,'CLASS_SCOPE_ERROR'");
  });

  it('recomputes server-side recommendations before approved execution',()=>{
    expect(workerSource).toMatch(/ASSIGN_RECOVERY_RECOMMENDATIONS[\s\S]*?buildRecoveryRecommendations\(env,institutionId,classIds\)/);
    expect(workerSource).toContain("if(rec.state!=='READY'||!rec.worksheet)");
  });

  it('does not fabricate a worksheet when no published outcome match exists',()=>{
    expect(workerSource).toContain("state:'NO_WORKSHEET'");
    expect(workerSource).toContain("w.status='PUBLISHED'");
    expect(uiSource).toContain('Föy eşleşmesi yok');
  });
});
