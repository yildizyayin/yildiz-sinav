-- 4 Nov (owner): Pendik Anadolu Lisesi (974884) and Pendik Fatih Anadolu Lisesi (964165) were left with only a
-- 2025-2026 season by an exam that has since been deleted. Their season becomes 2026-2027; nothing else changes.
-- Idempotent, and a no-op where a 2026-2027 season already exists or the institutions are absent.
UPDATE institution_seasons SET academic_year='2026-2027'
WHERE academic_year='2025-2026'
  AND institution_id IN (SELECT id FROM institutions WHERE code IN ('974884','964165'))
  AND NOT EXISTS (SELECT 1 FROM institution_seasons s2 WHERE s2.institution_id=institution_seasons.institution_id AND s2.academic_year='2026-2027');
