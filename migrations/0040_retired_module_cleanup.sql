PRAGMA foreign_keys = ON;

-- Akıllı Tahta ürün kapsamından çıkarıldı. Geçmiş veriyi silmeden yeni ve mevcut
-- kurumların paket yetkisini kapatır; olası eski kurum override'larını da etkisizleştirir.
UPDATE platform_features
SET enabled_default=0,stage='EXPERIMENTAL',label='Kapsam Dışı — Akıllı Tahta'
WHERE feature_key='BOARD';

DELETE FROM product_package_features WHERE feature_key='BOARD';
UPDATE institution_feature_overrides SET enabled=0,updated_at=CURRENT_TIMESTAMP WHERE feature_key='BOARD';

UPDATE product_packages
SET description='Standard paketin tamamı ile gelişmiş Nibiru, öğrenme grafiği, Recovery, Studio, video ve kurumsal özellikler.'
WHERE code='PREMIUM';
