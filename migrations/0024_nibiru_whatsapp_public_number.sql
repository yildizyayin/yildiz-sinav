PRAGMA foreign_keys = ON;

UPDATE nibiru_settings
SET public_whatsapp_number = '+905441790940',
    assistant_name = 'Nibiru AI',
    transparency_text = 'Ben Nibiru AI, Anunex’in yapay zekâ akademik asistanıyım.',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'platform';
