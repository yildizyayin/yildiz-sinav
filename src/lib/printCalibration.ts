export type PrintCalibration = {
  status?: string;
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

export function calibrationCorrection(calibration?: PrintCalibration | null) {
  const offsetX = finite(calibration?.offset_x_mm, 0);
  const offsetY = finite(calibration?.offset_y_mm, 0);
  const scaleX = finite(calibration?.scale_x, 1) || 1;
  const scaleY = finite(calibration?.scale_y, 1) || 1;
  const rotation = finite(calibration?.rotation_deg, 0);
  return {
    offsetX,
    offsetY,
    scaleX,
    scaleY,
    rotation,
    correctionOffsetX: -offsetX,
    correctionOffsetY: -offsetY,
    correctionScaleX: 1 / scaleX,
    correctionScaleY: 1 / scaleY,
    correctionRotation: -rotation,
  };
}

export function calibrationTransform(calibration?: PrintCalibration | null) {
  const c = calibrationCorrection(calibration);
  return `translate(${c.correctionOffsetX}mm, ${c.correctionOffsetY}mm) rotate(${c.correctionRotation}deg) scale(${c.correctionScaleX}, ${c.correctionScaleY})`;
}

export function isPrintCalibrationReady(calibration?: PrintCalibration | null) {
  return calibration?.status === 'READY';
}
