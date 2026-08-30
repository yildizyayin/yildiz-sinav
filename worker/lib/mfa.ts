const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function decodeBase32(secret: string): Uint8Array | null {
  const normalized = secret.toUpperCase().replace(/[\s=-]/g, '');
  if (normalized.length < 16 || normalized.length > 256) return null;
  let buffer = 0;
  let bits = 0;
  const output: number[] = [];
  for (const char of normalized) {
    const value = BASE32.indexOf(char);
    if (value < 0) return null;
    buffer = (buffer << 5) | value;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      output.push((buffer >>> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  return output.length >= 10 ? new Uint8Array(output) : null;
}

function counterBytes(counter: number): Uint8Array {
  const bytes = new Uint8Array(8);
  let value = Math.floor(counter);
  for (let i = 7; i >= 0; i--) {
    bytes[i] = value & 0xff;
    value = Math.floor(value / 256);
  }
  return bytes;
}

function secureCodeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

export async function generateTotpCode(secret: string, atMs = Date.now(), digits = 6): Promise<string | null> {
  if (!Number.isFinite(atMs) || digits < 6 || digits > 8) return null;
  const keyBytes = decodeBase32(secret);
  if (!keyBytes) return null;
  const counter = Math.floor(atMs / 1000 / 30);
  const key = await crypto.subtle.importKey('raw', keyBytes as BufferSource, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBytes(counter) as BufferSource));
  const offset = (signature[signature.length - 1] ?? 0) & 0x0f;
  const binary = (((signature[offset] ?? 0) & 0x7f) << 24)
    | (((signature[offset + 1] ?? 0) & 0xff) << 16)
    | (((signature[offset + 2] ?? 0) & 0xff) << 8)
    | ((signature[offset + 3] ?? 0) & 0xff);
  return String(binary % (10 ** digits)).padStart(digits, '0');
}

export async function verifyTotpCode(secret: string, code: unknown, atMs = Date.now(), window = 1): Promise<boolean> {
  const normalizedCode = String(code || '').trim();
  if (!/^\d{6}$/.test(normalizedCode)) return false;
  const boundedWindow = Math.max(0, Math.min(2, Math.floor(window)));
  for (let step = -boundedWindow; step <= boundedWindow; step++) {
    const expected = await generateTotpCode(secret, atMs + step * 30_000, 6);
    if (expected && secureCodeEqual(expected, normalizedCode)) return true;
  }
  return false;
}
