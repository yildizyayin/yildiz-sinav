import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';

const workflow=readFileSync(new URL('../.github/workflows/bootstrap-production-admin.yml',import.meta.url),'utf8');
const generator=readFileSync(new URL('../scripts/generate-production-admin.mjs',import.meta.url),'utf8');

describe('production Super Admin bootstrap safety',()=>{
  it('targets the D1 binding resolved from the production Worker',()=>{
    expect(workflow).toContain('workers/scripts/yildiz-sinav-prod');
    expect(workflow).toContain('select(.name == "DB" and .type == "d1")');
    expect(workflow).toContain('wrangler.production.admin.json');
    expect(workflow).not.toContain('d1 execute DB --remote --config wrangler.production.jsonc');
  });

  it('resets an existing administrator safely and revokes old sessions',()=>{
    expect(generator).toContain('ON CONFLICT(email) DO UPDATE SET');
    expect(generator).toContain("role='SUPER_ADMIN'");
    expect(generator).toContain('UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP');
    expect(generator).not.toContain('INSERT OR IGNORE');
  });

  it('always deletes generated credential material',()=>{
    expect(workflow).toContain('if: ${{ always() }}');
    expect(workflow).toContain('rm -f tmp/production-admin.sql wrangler.production.admin.json');
  });
});
