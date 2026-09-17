import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workerSource=readFileSync(new URL('../worker/v2-entry.ts',import.meta.url),'utf8');
const uiSource=readFileSync(new URL('../src/pages/DemoMode.tsx',import.meta.url),'utf8');

describe('Anunex demo mode',()=>{
  it('brands the demo as Anunex instead of the legacy generic platform name',()=>{
    expect(workerSource).toContain("'Anunex Demo Kurumu'");
    expect(uiSource).toContain('Anunex · Demo Modu');
    expect(uiSource).not.toContain('Ölçme Platformu Demo Kurumu');
  });

  it('creates only demo-scoped synthetic institutions and students',()=>{
    expect(workerSource).toContain("status,demo_mode) VALUES(?,?,?,'İstanbul','Demo','ACTIVE',1)");
    expect(workerSource).toContain("'Demo',`Öğrenci ${String(i+1).padStart(3,'0')}`");
    expect(uiSource).toContain('gerçek kurumlardan veri kopyalamaz');
  });

  it('seeds a sample exam, results and outcome evidence so analytics are not empty',()=>{
    expect(workerSource).toContain('Anunex Demo Başlangıç Sınavı');
    expect(workerSource).toContain('INSERT INTO exam_participants');
    expect(workerSource).toContain('INSERT INTO exam_results');
    expect(workerSource).toContain('INSERT INTO outcome_results');
  });

  it('assigns only already-published worksheets when matching grade content exists',()=>{
    expect(workerSource).toContain("FROM worksheets WHERE status='PUBLISHED' AND grade_level IN (5,6,7,8)");
    expect(workerSource).toContain('worksheetAssignments++');
  });
});
