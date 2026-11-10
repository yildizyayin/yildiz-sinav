-- Dejavu (owner, 10 Nov 2026): a printed QR opens the question's solution in the app. When the student reveals the
-- answer before entering their own, that later answer is kept but no longer counts as karne evidence.
ALTER TABLE student_personal_book_items ADD COLUMN solution_viewed_at TEXT;
