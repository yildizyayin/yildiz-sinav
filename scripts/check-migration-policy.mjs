import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const directory = 'migrations';
// File names are Cloudflare migration identities. Keep deployed files immutable.
const existing = JSON.parse(readFileSync(join(directory, 'policy/existing-migrations.json'), 'utf8'));
const files = readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
const versions = new Map();
const errors = [];
const highestExistingVersion = Math.max(...Object.keys(existing).map(name => Number(name.slice(0, 4))));
for (const file of files) {
  const match = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(file);
  if (!match) {
    errors.push(`Geçersiz migration adı: ${file}`);
    continue;
  }
  const group = versions.get(match[1]) || [];
  group.push(file);
  versions.set(match[1], group);
  if (Object.hasOwn(existing, file)) {
    const hash = createHash('sha256').update(readFileSync(join(directory, file))).digest('hex');
    if (hash !== existing[file]) errors.push(`Uygulanmış migration içeriği değişti: ${file}`);
  } else if (Number(match[1]) <= highestExistingVersion) {
    errors.push(`Yeni migration numarası ${String(highestExistingVersion + 1).padStart(4, '0')} veya üstü olmalı: ${file}`);
  }
}
for (const file of Object.keys(existing)) {
  if (!files.includes(file)) errors.push(`Uygulanmış migration silindi veya yeniden adlandırıldı: ${file}`);
}
for (const [version, group] of versions) {
  if (group.length > 1 && group.some(file => !Object.hasOwn(existing, file))) {
    errors.push(`Yeni migration numarası tekrarlanıyor (${version}): ${group.join(', ')}`);
  }
}
console.log(`Migration dosyası: ${files.length}; geçmişteki tekrar grupları: ${[...versions.values()].filter(group => group.length > 1).length}`);
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log('Migration sürüm politikası başarılı.');
}
