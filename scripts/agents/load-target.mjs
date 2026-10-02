import { pathToFileURL } from 'node:url';

const productionHosts = new Set(['anunex.com', 'www.anunex.com', 'app.anunex.com', 'sonuc.anunex.com']);
function originOnly(raw) {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (productionHosts.has(host) || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && host === 'localhost'))) {
    throw new Error('Yük testi yalnız izin verilen staging origin üzerinde çalışabilir.');
  }
  return url.origin;
}
export function validateLoadTarget(target, allowedOrigins = 'https://demo.anunex.com') {
  const origin = originOnly(target);
  const allowed = String(allowedOrigins).split(',').map(item => originOnly(item.trim()));
  if (!allowed.includes(origin)) throw new Error('Yük testi hedefi staging izin listesinde değil.');
  return origin;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const origin = validateLoadTarget(process.env.TARGET_URL, process.env.LOAD_TEST_ALLOWED_ORIGINS || undefined);
    if (!/^[1-9][0-9]{0,5}$/.test(process.env.VUS || '')) throw new Error('VUS 1–999999 arasında olmalıdır.');
    console.log(`Doğrulanan staging origin: ${origin}; VUS: ${process.env.VUS}`);
  } catch {
    console.error('Yük testi hedefi veya kullanıcı sayısı güvenlik kontrolünden geçmedi.');
    process.exitCode = 1;
  }
}
