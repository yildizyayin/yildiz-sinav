import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const page=readFileSync(new URL('../src/pages/Reports.tsx',import.meta.url),'utf8');
const worker=readFileSync(new URL('../worker/reporting-entry.ts',import.meta.url),'utf8');

describe('Report export audit',()=>{
  it('records CSV and print/PDF exports before releasing the document',()=>{
    expect(page).toContain("recordExport('CSV')");
    expect(page).toContain("recordExport('PRINT_PDF')");
    expect(page).toContain("'/api/reporting/exports/audit'");
    expect(page.indexOf("await recordExport('CSV')")).toBeLessThan(page.indexOf("a.click()"));
    expect(page.indexOf("await recordExport('PRINT_PDF')")).toBeLessThan(page.indexOf('window.print()'));
  });

  it('rechecks student scope and writes a structured audit event',()=>{
    expect(worker).toContain('const access=await studentAccess(env,user,studentId)');
    expect(worker).toContain("'STUDENT_REPORT_EXPORTED'");
    expect(worker).toContain("['CSV','PRINT_PDF'].includes(format)");
    expect(worker).toContain("url.pathname==='/api/reporting/exports/audit'");
  });
});
