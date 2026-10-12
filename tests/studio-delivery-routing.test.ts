import {describe,it,expect} from 'vitest';
import {planStudioDelivery,resolveStudioDeliveryKind} from '../worker/lib/studio-delivery-routing';

const base={documentId:'studio-1',institutionId:'inst-1',publicationRevision:2,approved:true,questionIds:['q1','q2']};
describe('studio publish destination guard',()=>{
  it('routes a published booklet to Exam Center once per revision and institution',()=>{
    const a=planStudioDelivery({...base,kind:'EXAM',bookletCodes:['A','B']});
    const b=planStudioDelivery({...base,kind:'EXAM',bookletCodes:['A','B']});
    expect(a.ok).toBe(true);
    if(a.ok && b.ok){expect(a.plan.createExamRecord).toBe(true);expect(a.plan.destination).toBe('EXAM_CENTER');expect(a.plan.idempotencyKey).toBe(b.plan.idempotencyKey);}
  });
  it('routes homework only to assignment/learning evidence, never an Exam record',()=>{
    const x=planStudioDelivery({...base,kind:'HOMEWORK'});
    expect(x.ok).toBe(true);
    if(x.ok){expect(x.plan.destination).toBe('ASSIGNMENTS');expect(x.plan.createExamRecord).toBe(false);expect(x.plan.createAssignmentRecord).toBe(true);expect(x.plan.assessmentMode).toBe('LEARNING_EVIDENCE');}
  });
  it('routes a mini test to practice and not Exam Center',()=>{
    const x=planStudioDelivery({...base,kind:'MINI_TEST'});
    expect(x.ok).toBe(true);
    if(x.ok){expect(x.plan.destination).toBe('COACH_PRACTICE');expect(x.plan.createExamRecord).toBe(false);}
  });
  it('rejects drafts and duplicate questions',()=>{
    expect(planStudioDelivery({...base,kind:'EXAM',approved:false,bookletCodes:['A']}).ok).toBe(false);
    expect(planStudioDelivery({...base,kind:'HOMEWORK',questionIds:['q1','q1']}).ok).toBe(false);
  });
  it('rejects invalid booklet codes on exams',()=>{
    expect(planStudioDelivery({...base,kind:'EXAM',bookletCodes:['E']}).ok).toBe(false);
    expect(planStudioDelivery({...base,kind:'EXAM',bookletCodes:['A','A']}).ok).toBe(false);
  });
  it('does not share publication keys across delivery kinds',()=>{
    const e=planStudioDelivery({...base,kind:'EXAM',bookletCodes:['A']});
    const h=planStudioDelivery({...base,kind:'HOMEWORK'});
    if(e.ok&&h.ok)expect(e.plan.idempotencyKey).not.toBe(h.plan.idempotencyKey);
  });
});

describe('real Studio document mapping',()=>{
 it('allows written and practice exams only into Exam Center',()=>{
  expect(resolveStudioDeliveryKind('WRITTEN_EXAM','EXAM').ok).toBe(true);
  expect(resolveStudioDeliveryKind('PRACTICE_EXAM','EXAM').ok).toBe(true);
  expect(resolveStudioDeliveryKind('WRITTEN_EXAM','HOMEWORK').ok).toBe(false);
 });
 it('allows explicit assignment/mini-test delivery for worksheets, never an exam',()=>{
  expect(resolveStudioDeliveryKind('WORKSHEET','HOMEWORK').ok).toBe(true);
  expect(resolveStudioDeliveryKind('WORKSHEET','MINI_TEST').ok).toBe(true);
  expect(resolveStudioDeliveryKind('WORKSHEET','EXAM').ok).toBe(false);
 });
 it('does not turn personal books into exams or assignments',()=>{
  expect(resolveStudioDeliveryKind('PERSONAL_BOOK','EXAM').ok).toBe(false);
  expect(resolveStudioDeliveryKind('PERSONAL_BOOK','HOMEWORK').ok).toBe(false);
 });
});
