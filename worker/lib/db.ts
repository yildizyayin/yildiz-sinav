export function uuid(prefix = ''): string {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

export function normalizeName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: 'Bilinmiyor', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) ?? '' };
}

export async function one<T>(stmt: D1PreparedStatement): Promise<T | null> {
  return (await stmt.first<T>()) ?? null;
}

export async function all<T>(stmt: D1PreparedStatement): Promise<T[]> {
  const result = await stmt.all<T>();
  return result.results ?? [];
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export function badRequest(message: string, code = 'BAD_REQUEST', details?: unknown): Response {
  return json({ ok: false, error: { code, message, details } }, 400);
}

export function forbidden(message = 'Bu işlem için yetkiniz yok.'): Response {
  return json({ ok: false, error: { code: 'FORBIDDEN', message } }, 403);
}

export function notFound(message = 'Kayıt bulunamadı.'): Response {
  return json({ ok: false, error: { code: 'NOT_FOUND', message } }, 404);
}

export function methodNotAllowed(): Response {
  return json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Bu yöntem desteklenmiyor.' } }, 405);
}

export async function audit(
  db: D1Database,
  actorUserId: string | null,
  institutionId: string | null,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: unknown,
): Promise<void> {
  await db.prepare(`INSERT INTO audit_logs (id, actor_user_id, institution_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(uuid('aud'), actorUserId, institutionId, action, entityType ?? null, entityId ?? null, details ? JSON.stringify(details) : null)
    .run();
}
