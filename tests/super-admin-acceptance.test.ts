import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {SUPER_ADMIN_ACCEPTANCE} from '../src/lib/super-admin-acceptance';

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const app=read('src/App.tsx'),layout=read('src/components/Layout.tsx'),styles=read('src/styles.css');

describe('P5 Super Admin role acceptance',()=>{
  it('covers every required acceptance dimension in the visible readiness matrix',()=>{
    expect(SUPER_ADMIN_ACCEPTANCE.map(x=>x.key)).toEqual(['VISIBILITY','AUTHORIZATION','SCOPE','EMPTY_ERROR','MOBILE','PRACTICALITY','EXPORT','AUDIT_SESSION']);
    expect(read('src/pages/StandardReadiness.tsx')).toContain('SUPER_ADMIN_ACCEPTANCE.map');
  });

  it('keeps every Super Admin navigation destination routed and role gated',()=>{
    const block=layout.slice(layout.indexOf('SUPER_ADMIN: ['),layout.indexOf('INSTITUTION_MANAGER: ['));
    const paths=[...block.matchAll(/to: '([^']+)'/g)].map(match=>match[1]);
    expect(paths.length).toBeGreaterThanOrEqual(30);
    for(const path of paths.filter(path=>path!=='/')){
      const route=path.slice(1);
      expect(app,`${path} route is missing`).toContain(`path="${route}"`);
      const routeStart=app.indexOf(`path="${route}"`),routeEnd=app.indexOf('/>',routeStart);
      const routeSource=app.slice(routeStart,routeEnd);
      expect(routeSource,`${path} is not role gated`).toContain('RoleGate');
      expect(routeSource.includes("'SUPER_ADMIN'")||routeSource.includes('ALL_ROLES'),`${path} excludes Super Admin`).toBe(true);
    }
  });

  it('requires institution selection in shared institution-scoped admin operations',()=>{
    for(const page of ['Attendance','AssignmentCenter','Students','Users','AccessAccounts','TeacherAssignments','Seasons','OpticalPrepare','Calibration','BulkOperations','Reports']){
      const source=read(`src/pages/${page}.tsx`);
      expect(source,`${page} lacks Super Admin institution scope`).toMatch(/user\?\.role\s*={0,2}\s*={0,2}\s*'SUPER_ADMIN'|user\?\.role\s*!==\s*'SUPER_ADMIN'/);
      expect(source,`${page} lacks institution selection`).toMatch(/InstitutionSelect|Kurum<select/);
    }
  });

  it('has mobile navigation, single-column operations, print rules and safe session termination',()=>{
    expect(styles).toContain('@media(max-width:760px)');
    expect(styles).toContain('.sidebar{position:fixed');
    expect(styles).toContain('.kpi-grid,.action-grid');
    expect(styles).toContain('@media print');
    expect(layout).toContain('Güvenli Çıkış');
    expect(layout).toContain("navigate('/login',{replace:true})");
    const profile=read('src/pages/Profile.tsx');
    expect(profile).toContain('Tüm Cihazlardan Çık');
    expect(profile).toContain('/api/auth/sessions/revoke-all');
  });

  it('fails closed unless report export authorization and audit both succeed',()=>{
    const page=read('src/pages/Reports.tsx'),worker=read('worker/reporting-entry.ts');
    expect(page).toContain("await recordExport('CSV')");
    expect(page).toContain("await recordExport('PRINT_PDF')");
    expect(worker).toContain('studentAccess(env,user,studentId)');
    expect(worker).toContain("'STUDENT_REPORT_EXPORTED'");
  });
});
