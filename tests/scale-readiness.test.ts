import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';

const source=readFileSync(new URL('../worker/scale-entry.ts',import.meta.url),'utf8');
const productRoot=readFileSync(new URL('../worker/product-completion-entry.ts',import.meta.url),'utf8');
const privacyRoot=readFileSync(new URL('../worker/privacy-entry.ts',import.meta.url),'utf8');
const privacyMinimizationRoot=readFileSync(new URL('../worker/privacy-minimization-entry.ts',import.meta.url),'utf8');
const privacyExportRoot=readFileSync(new URL('../worker/privacy-export-entry.ts',import.meta.url),'utf8');
const staging=readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
const production=readFileSync(new URL('../wrangler.production.jsonc',import.meta.url),'utf8');

describe('Anunex scale readiness',()=>{
  it('routes staging and production through audited export, privacy gates, product root and scale-safe wrapper',()=>{
    expect(staging).toContain('"main": "./worker/privacy-export-entry.ts"');
    expect(production).toContain('"main": "./worker/privacy-export-entry.ts"');
    expect(privacyExportRoot).toContain("import app from './privacy-minimization-entry'");
    expect(privacyMinimizationRoot).toContain("import app from './privacy-entry'");
    expect(privacyRoot).toContain("import app from './product-completion-entry'");
    expect(productRoot).toContain("import app from './scale-entry'");
  });

  it('uses set-based participant creation instead of per-student existence queries',()=>{
    expect(source).toContain('INSERT OR IGNORE INTO exam_participants');
    expect(source).toContain("strategy:'SET_BASED_D1_CHUNKED'");
    expect(source).not.toContain("SELECT id FROM exam_participants WHERE exam_id=? AND institution_id=? AND student_id=?");
  });

  it('chunks large D1 writes and protects the per-invocation query budget',()=>{
    expect(source).toContain('const PARTICIPANT_CHUNK_SIZE=1000');
    expect(source).toContain('const MAX_D1_QUERY_BUDGET=900');
    expect(source).toContain("'BULK_QUERY_BUDGET'");
    expect(source).toContain('rn>? AND rn<=?');
  });

  it('preserves tenant scope and caps bulk class selection',()=>{
    expect(source).toContain('const MAX_BULK_CLASSES=100');
    expect(source).toContain("cls.institution_id!==institutionId");
    expect(source).toContain("'CLASS_SCOPE_ERROR'");
  });

  it('does not claim 100k readiness before staging benchmark',()=>{
    expect(source).toContain("key:'LIVE_100K_BENCHMARK'");
    expect(source).toContain("status:'PENDING'");
    expect(source).toContain('Queue/Workflow by measured threshold');
  });
});
