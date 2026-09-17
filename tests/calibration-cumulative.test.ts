import { describe, expect, it } from 'vitest';
import { composeCalibration } from '../worker/lib/calibration-cumulative';

describe('cumulative printer calibration', () => {
  it('accumulates residual translation rotation and scale across automatic attempts', () => {
    const first = composeCalibration(null, { offset_x_mm: 1.2, offset_y_mm: -0.8, scale_x: 1.01, scale_y: 0.995, rotation_deg: 0.3, confidence: 0.9 });
    expect(first.offset_x_mm).toBe(1.2);
    expect(first.scale_x).toBeCloseTo(1.01, 8);

    const second = composeCalibration(first, { offset_x_mm: 0.15, offset_y_mm: 0.1, scale_x: 1.001, scale_y: 1.0005, rotation_deg: -0.05, confidence: 0.95 });
    expect(second.offset_x_mm).toBeCloseTo(1.35, 8);
    expect(second.offset_y_mm).toBeCloseTo(-0.7, 8);
    expect(second.scale_x).toBeCloseTo(1.01101, 8);
    expect(second.scale_y).toBeCloseTo(0.9954975, 8);
    expect(second.rotation_deg).toBeCloseTo(0.25, 8);
  });
});
