-- Dejavu kişiye özel kitap (owner, 10 Nov 2026): the student's answers to a book come back to the unified karne.
-- Each practice item keeps its own answer; an item answered once is final (no changing an answer after the key).
ALTER TABLE student_personal_book_items ADD COLUMN student_answer TEXT;
ALTER TABLE student_personal_book_items ADD COLUMN correct INTEGER;
ALTER TABLE student_personal_book_items ADD COLUMN answered_at TEXT;
-- the short code a printed QR carries to the question's solution page (unique, not guessable)
ALTER TABLE student_personal_book_items ADD COLUMN solution_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_personal_book_item_solution_code ON student_personal_book_items(solution_code) WHERE solution_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_personal_book_items_question ON student_personal_book_items(bank_question_id);
CREATE INDEX IF NOT EXISTS idx_personal_books_student ON student_personal_books(student_id,created_at);
