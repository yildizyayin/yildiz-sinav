export interface CalibrationMetrics {
  offset_x_mm: number;
  offset_y_mm: number;
  scale_x: number;
  scale_y: number;
  rotation_deg: number;
  confidence: number;
}

export function calibrationWithinTolerance(m: CalibrationMetrics, toleranceMm = 0.5, scaleTolerance = 0.003, rotationTolerance = 0.15): boolean {
  return Math.abs(m.offset_x_mm) <= toleranceMm &&
    Math.abs(m.offset_y_mm) <= toleranceMm &&
    Math.abs(m.scale_x - 1) <= scaleTolerance &&
    Math.abs(m.scale_y - 1) <= scaleTolerance &&
    Math.abs(m.rotation_deg) <= rotationTolerance &&
    m.confidence >= 0.7;
}

export function nextCalibrationStatus(attemptCount: number, withinTolerance: boolean): 'READY' | 'AUTO_CALIBRATING' | 'MANUAL_REQUIRED' {
  if (withinTolerance) return 'READY';
  if (attemptCount >= 3) return 'MANUAL_REQUIRED';
  return 'AUTO_CALIBRATING';
}
