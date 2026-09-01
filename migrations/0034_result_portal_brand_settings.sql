-- Public result portal identity and conversion copy are managed by Super Admin.
CREATE TABLE IF NOT EXISTS result_portal_settings (
  id TEXT PRIMARY KEY CHECK(id='DEFAULT'),
  badge TEXT NOT NULL,
  title_line TEXT NOT NULL,
  title_emphasis TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  license_title TEXT NOT NULL,
  license_text TEXT NOT NULL,
  cta_label TEXT NOT NULL,
  cta_url TEXT NOT NULL,
  support_phone TEXT,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO result_portal_settings(
  id,badge,title_line,title_emphasis,subtitle,license_title,license_text,cta_label,cta_url,support_phone
) VALUES(
  'DEFAULT',
  'ANUNEX DOĞRULANMIŞ SONUÇ AĞI',
  'Sonuç yalnızca bir sayı değil.',
  'Bir sonraki akademik rota.',
  'Kurumunuz ANUNEX lisansı kullanmasa da yayınlanmış sınav sonuçlarınıza güvenle ulaşın.',
  'Sonucu görmek başlangıç. Gelişimi yönetmek ANUNEX.',
  'Optik okumadan kazanım analizine, yoklamadan kişisel öğrenme rotasına kadar kurumunuzun akademik operasyonunu tek sistemde birleştirin.',
  'Kurum demosunu inceleyin',
  'https://demo.anunex.com',
  '05433066172'
);
