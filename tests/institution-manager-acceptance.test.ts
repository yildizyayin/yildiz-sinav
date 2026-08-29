import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {featureForPath,ROUTE_FEATURE_MATRIX} from '../src/lib/feature-routes';
import {apiFeatureForPath} from '../worker/lib/feature-access';

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

describe('P5 Institution Manager acceptance',()=>{
  it('maps every optional operational route to a package feature and blocks direct URL bypass',()=>{
    expect(featureForPath('/exams/exam_1/evaluate')).toBe('EXAM_CENTER');
    expect(ROUTE_FEATURE_MATRIX).toMatchObject({'/attendance':'ATTENDANCE','/assignments':'ASSIGNMENTS','/content-center':'QUESTION_BANK','/enterprise':'ENTERPRISE','/optical-prepare':'OPTICAL','/reports':'REPORTING'});
    const layout=read('src/components/Layout.tsx'),boundary=read('src/components/FeatureBoundary.tsx');
    expect(layout).toContain('<FeatureBoundary><Outlet/></FeatureBoundary>');
    expect(layout).toContain('featureForPath(item.to)');
    expect(boundary).toContain('!enabled.has(feature)');
    expect(boundary).toContain('Bu modül kurum paketinizde etkin değil');
  });

  it('enforces attendance and assignment package limits again in the backend',()=>{
    const attendance=read('worker/attendance-entry.ts'),assignments=read('worker/assignment-entry.ts');
    expect(attendance).toContain("f.feature_key='ATTENDANCE'");
    expect(attendance).toContain("'FEATURE_DISABLED'");
    expect(attendance.indexOf('if(!await featureEnabled(env,user))')).toBeLessThan(attendance.indexOf("if(request.method==='GET')"));
    expect(assignments).toContain("f.feature_key='ASSIGNMENTS'");
    expect(assignments).toContain('if(!await featureEnabled(env,user))');
  });

  it('applies the same package policy at the outer Worker boundary',()=>{
    const access=read('worker/lib/feature-access.ts'),root=read('worker/product-completion-entry.ts');
    for(const feature of ['EXAM_CENTER','OPTICAL','REPORTING','WORKSHEETS','ASSIGNMENTS','ATTENDANCE','QUESTION_BANK','ENTERPRISE'])expect(access).toContain(`'${feature}'`);
    expect(access).toContain("code:'FEATURE_DISABLED'");
    expect(root).toContain('requireLicensedApiFeature(env,featureUser,path)');
    expect(root.indexOf('requireLicensedApiFeature(env,featureUser,path)')).toBeLessThan(root.indexOf('if(!custom)return app.fetch'));
    expect(apiFeatureForPath('/api/exam-definitions')).toBe('EXAM_CENTER');
    expect(apiFeatureForPath('/api/platform/exam-center/catalog')).toBe('EXAM_CENTER');
    expect(apiFeatureForPath('/api/optical-definitions')).toBe('OPTICAL');
    expect(apiFeatureForPath('/api/v2/optical-print-base')).toBe('OPTICAL');
    expect(apiFeatureForPath('/api/reporting/students')).toBe('REPORTING');
    expect(apiFeatureForPath('/api/worksheet-calendar')).toBe('WORKSHEETS');
    expect(apiFeatureForPath('/api/platform/questions')).toBe('QUESTION_BANK');
    expect(apiFeatureForPath('/api/platform/networks')).toBe('ENTERPRISE');
  });

  it('keeps tenant-scoped data access and report exports server-authorized',()=>{
    const reporting=read('worker/reporting-entry.ts'),attendance=read('worker/attendance-entry.ts'),assignments=read('worker/assignment-entry.ts');
    expect(reporting).toContain("return {allowed:user.institution_id===student.institution_id");
    expect(reporting).toContain("'STUDENT_REPORT_EXPORTED'");
    expect(attendance).toContain('row.institution_id!==user.institution_id');
    expect(assignments).toContain('assignment.institution_id!==user.institution_id');
  });

  it('uses a single practical exam entry and user-facing module names',()=>{
    const home=read('src/pages/InstitutionPanelV2.tsx');
    expect(home).toContain('to="/exam-center"');
    expect(home).not.toContain('to="/exam-definitions"');
    expect(home).not.toContain('Soru Havuzu & Studio');
    expect(home).toContain('Soru ve İçerik Merkezi');
    expect(home).toContain('1 Yıllık Lisansı Onayla');
    expect(home).toContain('Kurum Paketi');
    expect(home).toContain('Kullanıma açık modüller');
    expect(home).toContain("enabled('EXAM_CENTER')");
    expect(home).toContain("enabled('OPTICAL')");
    expect(home).toContain("enabled('REPORTING')");
  });

  it('audits institution feature override changes',()=>{
    const platform=read('worker/lib/platform-expansion.ts');
    expect(platform).toContain("'INSTITUTION_FEATURE_UPDATED'");
    expect(platform).toContain("'institution_feature_override'");
  });

  it('keeps the retired smart-board module outside every institution package',()=>{
    const cleanup=read('migrations/0040_retired_module_cleanup.sql');
    expect(cleanup).toContain("DELETE FROM product_package_features WHERE feature_key='BOARD'");
    expect(cleanup).toContain("UPDATE institution_feature_overrides SET enabled=0");
    expect(cleanup).not.toContain('gelişmiş Nibiru, öğrenme grafiği, Recovery, Studio, video, akıllı tahta');
  });
});
