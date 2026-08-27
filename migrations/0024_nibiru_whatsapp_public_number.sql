PRAGMA foreign_keys = ON;

UPDATE nibiru_settings
SET public_whatsapp_number = '+905441790940',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'platform';
