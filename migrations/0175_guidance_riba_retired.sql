-- Rehberlik: RİBA kullanılmıyor (owner kararı, 12 Kasım 2026). The template row is kept (no data is deleted) but it is
-- rejected and closed; its forms can no longer be loaded and it never appears in the guidance screens.
UPDATE guidance_survey_templates SET review_status='REJECTED',active=0,review_note='Kullanılmıyor — kurum kararı (12 Kasım 2026).',updated_at=CURRENT_TIMESTAMP WHERE kind='RIBA';
