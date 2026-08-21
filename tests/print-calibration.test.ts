import { describe, expect, it } from 'vitest';
import { calibrationCorrection, calibrationTransform, isPrintCalibrationReady } from '../src/lib/printCalibration';

describe('print calibration correction', () => {
  it('builds inverse correction from measured print drift', () => {
    const c = calibrationCorrection({ offset_x_mm: 1.2, offset_y_mm: -0.8, scale_x: 1.01, scale_y: 0.99, rotation_deg: 0.4 });
    expect(c.correctionOffsetX).toBe(-1.2);
    expect(c.correctionOffsetY).toBe(0.8);
    expect(c.correctionScaleX).toBeCloseTo(1 / 1.01, 8);
    expect(c.correctionScaleY).toBeCloseTo(1 / 0.99, 8);
    expect(c.correctionRotation).toBe(-0.4);
  });

  it('falls back to identity when no calibration exists', () => {
    expect(calibrationTransform(null)).toBe('translate(0mm, 0mm) rotate(0deg) scale(1, 1)');
    expect(isPrintCalibrationReady(null)).toBe(false);
  });

  it('only marks verified calibration ready', () => {
    expect(isPrintCalibrationReady({ status: 'READY' })).toBe(true);
    expect(isPrintCalibrationReady({ status: 'MANUAL_REQUIRED' })).toBe(false);
  });
});
