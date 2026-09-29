import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const hub=readFileSync(new URL('../src/pages/ExamCenterHub.tsx',import.meta.url),'utf8');
const evaluate=readFileSync(new URL('../src/pages/ExamEvaluate.tsx',import.meta.url),'utf8');

describe('selected exam evaluation navigation',()=>{
  it('redirects an examId upload request to the dedicated evaluator',()=>{
    expect(hub).toContain("mode==='upload'&&examId");
    expect(hub).toContain('/exams/${encodeURIComponent(examId)}/evaluate');
  });
  it('uses the route exam id for preview and evaluation',()=>{
    expect(evaluate).toContain('const {examId}=useParams()');
    expect(evaluate).toContain('/api/exams/${examId}/preview-file');
    expect(evaluate).toContain('/api/scan-batches/${preview.batchId}/evaluate');
  });
});
