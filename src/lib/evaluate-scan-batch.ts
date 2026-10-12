export type EvaluationProgress = { processed: number; total?: number; done?: boolean };

// The server commits small chunks. Completion is only shown after its final response.
export async function evaluateScanBatch(
  requestChunk: () => Promise<EvaluationProgress>,
  onProgress: (progress: EvaluationProgress) => void = () => {},
) {
  let previous = -1;
  for (;;) {
    const progress = await requestChunk();
    if (!Number.isFinite(progress.processed) || progress.processed < 0) throw new Error('Değerlendirme ilerleme bilgisi alınamadı. İşlemi tekrar deneyin.');
    onProgress(progress);
    if (progress.done !== false) return progress;
    if (progress.processed <= previous) throw new Error('Değerlendirme ilerlemedi. Kaydedilen sonuçlar korunuyor; işlemi tekrar deneyin.');
    previous = progress.processed;
  }
}
