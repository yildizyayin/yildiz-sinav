import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Offline evidence only: the caller supplies the file and its claimed source.
export async function fingerprintCurriculumSource({ file, sourceUrl, title, locator, retrievedAt }) {
  if (![file, sourceUrl, title, locator, retrievedAt].every(x => typeof x === 'string' && x.trim())) {
    throw new Error('File, source URL, title, locator and retrieval timestamp are required.');
  }
  const url = new URL(sourceUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash ||
      !(url.hostname === 'meb.gov.tr' || url.hostname.endsWith('.meb.gov.tr') ||
        url.hostname === 'osym.gov.tr' || url.hostname.endsWith('.osym.gov.tr'))) {
    throw new Error('Source must be an official HTTPS document URL without credentials, port, query or fragment.');
  }
  const timestamp = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{3})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(retrievedAt);
  const year = Number(timestamp?.[1]);
  const month = Number(timestamp?.[2]);
  const day = Number(timestamp?.[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!timestamp || month < 1 || month > 12 || day < 1 || day > days[month - 1] ||
      Number(timestamp[4]) > 23 || Number(timestamp[5]) > 59 || Number(timestamp[6]) > 59 ||
      Number(timestamp[7] || 0) > 23 || Number(timestamp[8] || 0) > 59 || !Number.isFinite(Date.parse(retrievedAt))) {
    throw new Error('Retrieval timestamp must be an ISO timestamp with timezone.');
  }
  const handle = await open(file, 'r');
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size < 8n || before.size > 50n * 1024n * 1024n) {
      throw new Error('Expected a regular PDF file between 8 bytes and 50 MiB.');
    }
    const signature = Buffer.alloc(5);
    await handle.read(signature, 0, 5, 0);
    if (signature.toString('ascii') !== '%PDF-') throw new Error('File is not a PDF; HTML/error responses are rejected.');
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const chunk of handle.createReadStream({ start: 0, autoClose: false })) {
      bytes += chunk.length;
      if (bytes > 50 * 1024 * 1024) throw new Error('File exceeded the byte limit while reading.');
      hash.update(chunk);
    }
    const after = await handle.stat({ bigint: true });
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs ||
        BigInt(bytes) !== before.size) throw new Error('File changed during fingerprinting.');
    return {
      schemaVersion: 1, evidenceKind: 'LOCAL_FILE_FINGERPRINT',
      sourceUrl: url.href, sourceTitle: title.trim(), sourceLocator: locator.trim(),
      retrievedAt, byteLength: bytes, sha256: hash.digest('hex'),
      originAttested: false, pdfStructureValidated: false,
      contentReviewed: false, academicYearApplicability: 'unverified', publicationAllowed: false,
    };
  } finally { await handle.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [file, sourceUrl, title, locator, retrievedAt, ...extra] = process.argv.slice(2);
    if (extra.length) throw new Error('Usage: node scripts/fingerprint-curriculum-source.mjs FILE URL TITLE LOCATOR RETRIEVED_AT');
    console.log(JSON.stringify(await fingerprintCurriculumSource({ file, sourceUrl, title, locator, retrievedAt }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
