import type { CalibrationMetrics } from './calibration';

export type StoredCalibration = {
  offset_x_mm?: number | string | null;
  offset_y_mm?: number | string | null;
  scale_x?: number | string | null;
  scale_y?: number | string | null;
  rotation_deg?: number | string | null;
};

function finite(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function composeCalibration(previous: StoredCalibration | null | undefined, residual: CalibrationMetrics) {
  const previousScaleX = finite(previous?.scale_x, 1) || 1;
  const previousScaleY = finite(previous?.scale_y, 1) || 1;
  return {
    offset_x_mm: finite(previous?.offset_x_mm, 0) + residual.offset_x_mm,
    offset_y_mm: finite(previous?.offset_y_mm, 0) + residual.offset_y_mm,
    scale_x: previousScaleX * residual.scale_x,
    scale_y: previousScaleY * residual.scale_y,
    rotation_deg: finite(previous?.rotation_deg, 0) + residual.rotation_deg,
  };
}
