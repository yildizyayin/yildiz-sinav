import { describe, expect, it } from 'vitest';
import { calibrationWithinTolerance, nextCalibrationStatus } from '../worker/lib/calibration';

describe('printer calibration lifecycle',()=>{
 const bad={offset_x_mm:1.2,offset_y_mm:-.8,scale_x:1.01,scale_y:.99,rotation_deg:.4,confidence:.9};
 const good={offset_x_mm:.2,offset_y_mm:-.1,scale_x:1.001,scale_y:.999,rotation_deg:.05,confidence:.95};
 it('requires 2-3 automatic attempts before manual',()=>{expect(nextCalibrationStatus(1,false)).toBe('AUTO_CALIBRATING');expect(nextCalibrationStatus(2,false)).toBe('AUTO_CALIBRATING');expect(nextCalibrationStatus(3,false)).toBe('MANUAL_REQUIRED')});
 it('accepts only verified tolerance',()=>{expect(calibrationWithinTolerance(bad)).toBe(false);expect(calibrationWithinTolerance(good)).toBe(true);expect(nextCalibrationStatus(1,true)).toBe('READY')});
});
