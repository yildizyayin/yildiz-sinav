-- ANUNEX theme catalog refresh: preserve existing keys/access rows while
-- giving the three approved alternatives their final product names.
UPDATE panel_themes
SET name='ANUNEX Kurumsal',
    description='Açık, güven veren ve yoğun yönetim ekranları için düzenlenmiş kurumsal görünüm.',
    active=1,
    sort_order=2,
    updated_at=CURRENT_TIMESTAMP
WHERE theme_key='ANUNEX_COSMIC';

UPDATE panel_themes
SET name='ANUNEX Akademi',
    description='Sıcak, sakin ve içerik odaklı eğitim çalışma alanı görünümü.',
    active=1,
    sort_order=3,
    updated_at=CURRENT_TIMESTAMP
WHERE theme_key='ANUNEX_NEON';

UPDATE panel_themes
SET name='ANUNEX Eclipse',
    description='Koyu yönetim, kuyruk ve operasyon ekranları için yüksek kontrastlı görünüm.',
    active=1,
    sort_order=4,
    updated_at=CURRENT_TIMESTAMP
WHERE theme_key='ANUNEX_FOCUS';
