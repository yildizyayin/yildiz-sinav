export async function collectAccessCodePages(load: (cursor: string) => Promise<{ codes: any[]; nextCursor?: string | null }>) {
  const codes: any[] = [], seen = new Set<string>();
  let cursor = '';
  try {
    do {
      const page = await load(cursor);
      codes.push(...page.codes);
      cursor = page.nextCursor || '';
      if (cursor && seen.has(cursor)) throw new Error('İşlem devam bilgisi tekrarlanıyor.');
      if (cursor) seen.add(cursor);
    } while (cursor);
    return { codes, error: null };
  } catch (error) { return { codes, error: error instanceof Error ? error : new Error('Erişim kodları tamamlanamadı.') }; }
}
