import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';

const layout=readFileSync(new URL('../src/components/Layout.tsx',import.meta.url),'utf8');
const home=readFileSync(new URL('../src/pages/StandardRoleHomes.tsx',import.meta.url),'utf8');
const worker=readFileSync(new URL('../worker/index.ts',import.meta.url),'utf8');
const examCenter=readFileSync(new URL('../src/pages/ExamCenter.tsx',import.meta.url),'utf8');

describe('Super Admin V2 control center',()=>{
 it('supports searchable collapsible groups, favorites and operational badges',()=>{
  expect(layout).toContain('anunex.nav.collapsed');
  expect(layout).toContain('anunex.nav.favorites');
  expect(layout).toContain('nav-group-toggle');
  expect(layout).toContain('nav-badge');
 });

 it('uses user-facing labels instead of legacy internal menu names',()=>{
  expect(layout).not.toContain('Eski Sınav Listesi');
  expect(layout).not.toContain("label: 'Feature Lab'");
  for(const technicalLabel of ['Kurum Paneli V2','Enterprise / Campus','Gelişim & Recovery','Gold / Premium / Live','Soru Havuzu & Studio'])expect(layout).not.toContain(technicalLabel);
  expect(layout).toContain('Zincir Kurum Yönetimi');
 });

 it('keeps one exam center menu entry while preserving exam creation inside the center',()=>{
  expect(layout).not.toContain("to: '/exam-definitions'");
  expect(examCenter).toContain('Yeni Kurum Sınavı');
  expect(examCenter).toContain('to="/exam-definitions"');
 });

 it('reports live exam, optical and Nibiru health plus recent activity',()=>{
  for(const key of ['activeExams','pendingScans','failedScans','readyOpticals','nibiruErrors24h','recentActivity'])expect(worker).toContain(key);
  expect(home).toContain('Servis ve işlem sağlığı');
  expect(home).toContain('Platform servisleri');
  expect(home).toContain('Son işlemler');
 });
});
