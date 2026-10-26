/**
 * Directory import in small packages with visible progress. A failed package is retried a few times; if it still
 * fails, the import stops with the reason and can continue from the same row (the server upserts by MEB code,
 * so sending a package again never creates duplicates).
 */
export type ImportProgress = { done: number; total: number; upserted: number; invalid: number; failedAt?: number; error?: string; finished?: boolean };

export async function importInPackages<T>(
  rows: T[],
  send: (chunk: T[]) => Promise<{ rowsUpserted: number; invalid?: number }>,
  onProgress: (p: ImportProgress) => void,
  opts: { start?: number; size?: number; retries?: number; wait?: (ms: number) => Promise<void>; base?: Partial<ImportProgress> } = {},
): Promise<ImportProgress> {
  const size = opts.size ?? 250, retries = opts.retries ?? 3, wait = opts.wait ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const p: ImportProgress = { done: opts.start ?? 0, total: rows.length, upserted: opts.base?.upserted ?? 0, invalid: opts.base?.invalid ?? 0 };
  onProgress({ ...p });
  for (let i = p.done; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await send(chunk);
        p.upserted += Number(r.rowsUpserted || 0); p.invalid += Number(r.invalid || 0); p.done = Math.min(rows.length, i + chunk.length);
        onProgress({ ...p });
        break;
      } catch (e: any) {
        if (attempt + 1 >= retries || (e?.status && e.status < 500 && e.status !== 429 && e.status !== 0)) {
          const stopped = { ...p, failedAt: i, error: e?.message || 'Paket yazılamadı.' };
          onProgress(stopped);
          return stopped;
        }
        await wait(1000 * 2 ** attempt);
      }
    }
  }
  const finished = { ...p, finished: true };
  onProgress(finished);
  return finished;
}
