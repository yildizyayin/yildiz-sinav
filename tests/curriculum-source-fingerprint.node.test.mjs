import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fingerprintCurriculumSource } from '../scripts/fingerprint-curriculum-source.mjs';

test('fingerprint records all bytes and keeps every publication gate closed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'curriculum-evidence-'));
  try {
    const file = join(dir, 'synthetic.pdf');
    const bytes = Buffer.from('%PDF-1.7\nSynthetic fixture; not an official document.\n%%EOF\n');
    await writeFile(file, bytes);
    const input = { file, sourceUrl: 'https://tymm.meb.gov.tr/assets/pdf/example.pdf', title: 'Fixture', locator: 'Cover', retrievedAt: '2026-10-07T20:50:35+03:00' };
    const result = await fingerprintCurriculumSource(input);
    assert.equal(result.byteLength, bytes.length);
    assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(result.publicationAllowed, false);
    assert.equal(result.originAttested, false);
    assert.equal(result.contentReviewed, false);
    assert.equal(result.pdfStructureValidated, false);
    assert.equal(result.academicYearApplicability, 'unverified');
    await writeFile(file, Buffer.concat([bytes, Buffer.from('Changed')]));
    assert.notEqual((await fingerprintCurriculumSource(input)).sha256, result.sha256);
    await writeFile(file, '<html>Provider error page</html>');
    await assert.rejects(fingerprintCurriculumSource(input), /not a PDF/);
    await writeFile(file, '%PDF-1.7');
    await truncate(file, 50 * 1024 * 1024 + 1);
    await assert.rejects(fingerprintCurriculumSource(input), /50 MiB/);
    for (const sourceUrl of ['http://meb.gov.tr/a.pdf', 'https://meb.gov.tr.attacker.example/a.pdf', 'https://meb.gov.tr@attacker.example/a.pdf', 'https://tymm.meb.gov.tr/a.pdf?token=private', 'https://tymm.meb.gov.tr:8443/a.pdf']) {
      await assert.rejects(fingerprintCurriculumSource({ ...input, sourceUrl }), /official HTTPS/);
    }
    await assert.rejects(fingerprintCurriculumSource({ ...input, retrievedAt: '2026-10-07' }), /timezone/);
    await assert.rejects(fingerprintCurriculumSource({ ...input, locator: '' }), /required/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
