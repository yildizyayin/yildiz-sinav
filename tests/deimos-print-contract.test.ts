import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';

const source=readFileSync(new URL('../src/pages/OpticalPrepare.tsx',import.meta.url),'utf8');
const calibration=readFileSync(new URL('../src/lib/printCalibration.ts',import.meta.url),'utf8');

it('keeps Deimos printing separate from optical definition and requires a READY calibration before browser print',()=>{
 expect(source).toContain('DEIMOS · OPTİK BASMA');
 expect(source).toContain('isPrintCalibrationReady(calibration)');
 expect(source).toContain('if (!calibrationReady)');
 expect(source).toContain('window.print()');
 expect(source).toContain('Kalibrasyon ekranını tamamlayın');
 expect(calibration).toContain("calibration?.status === 'READY'");
});

it('prints only optical pages with zero page margin and one physical page per student',()=>{
 expect(source).toContain('@media print');
 expect(source).toContain('.optical-print-root');
 expect(source).toContain('.print-optical-page');
 expect(source).toContain('page-break-after:always');
 expect(source).toContain('@page{margin:0}');
});

it('preserves explicit booklet-set selection and deterministic student booklet assignment',()=>{
 expect(source).toContain('bookletSet: bookletSet || null');
 expect(source).toContain('booklet_code');
 expect(source).toContain('studentNumberBubbles');
 expect(source).toContain('bookletCode');
});
