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

const AUDIT_SENSITIVE_KEY = /(?:password|passwd|secret|authorization|cookie|access[_-]?token|refresh[_-]?token|api[_-]?key|private[_-]?key|first[_-]?name|last[_-]?name|display[_-]?name|full[_-]?name|email|phone|tckn|tc[_-]?no|national[_-]?id|address|birth[_-]?date|raw[_-]?(?:image|frame|video|audio|voice)|image[_-]?base64)/iu;
const AUDIT_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu;
const AUDIT_LONG_NUMBER = /(?<!\d)\d{10,12}(?!\d)/g;
const AUDIT_BEARER = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/giu;

function sanitizeAuditString(value: string): string {
  return value
    .replace(AUDIT_BEARER, 'Bearer [REDACTED]')
    .replace(AUDIT_EMAIL, '[REDACTED_EMAIL]')
    .replace(AUDIT_LONG_NUMBER, '[REDACTED_NUMBER]');
}

export function sanitizeAuditDetails(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 8) return '[REDACTED_DEPTH]';
  if (typeof value === 'string') return sanitizeAuditString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeAuditDetails(item, depth + 1));
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      output[key] = AUDIT_SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeAuditDetails(child, depth + 1);
    }
    return output;
  }
  return String(value);
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
  const safeDetails = details === undefined ? null : sanitizeAuditDetails(details);
  await db.prepare(`INSERT INTO audit_logs (id, actor_user_id, institution_id, action, entity_type, entity_id, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(uuid('aud'), actorUserId, institutionId, action, entityType ?? null, entityId ?? null, safeDetails === null ? null : JSON.stringify(safeDetails))
    .run();
}
