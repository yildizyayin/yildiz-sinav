import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';

const workflow=readFileSync(new URL('../.github/workflows/production-recovery-check.yml',import.meta.url),'utf8');

describe('production D1 recovery targeting',()=>{
  it('resolves the D1 bound to the active production Worker before any recovery command',()=>{
    expect(workflow).toContain('workers/scripts/yildiz-sinav-prod');
    expect(workflow).toContain('select(.name == "DB" and .type == "d1")');
    expect(workflow).toContain('wrangler.production.recovery.json');
    expect(workflow).not.toContain('d1 info DB --config wrangler.production.jsonc');
    expect(workflow).not.toContain('d1 export DB --remote --skip-confirmation --config wrangler.production.jsonc');
  });

  it('never restores or mutates production during the rehearsal',()=>{
    expect(workflow).not.toContain('d1 time-travel restore');
    expect(workflow).not.toContain('d1 execute DB --remote');
    expect(workflow).toContain('sqlite3 tmp/recovery-check/restored.sqlite');
  });

  it('runs automatically when its production recovery definition changes',()=>{
    expect(workflow).toContain("- '.github/workflows/production-recovery-check.yml'");
    expect(workflow).toContain("- 'tests/production-recovery-targeting.test.ts'");
  });
});
