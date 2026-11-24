-- Nibiru 2.0 (owner, 13 Nov 2026): Nibiru talks through free Gemini. The last turns of a conversation are kept so
-- the model does not repeat itself; they are deleted after 30 days and only the last day is ever sent back to the
-- model. Usage is counted per day and person to stay inside the free quota.
CREATE TABLE IF NOT EXISTS nibiru_chat_turns (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_key TEXT NOT NULL,
  speaker TEXT NOT NULL CHECK(speaker IN ('USER','NIBIRU')),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_nibiru_chat_turns_user ON nibiru_chat_turns(user_id, channel_key, created_at);
CREATE INDEX IF NOT EXISTS idx_nibiru_chat_turns_age ON nibiru_chat_turns(created_at);
CREATE TABLE IF NOT EXISTS nibiru_gemini_usage (
  day TEXT NOT NULL,
  user_id TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day, user_id)
);

-- KVKK gate (master rule 12): Nibiru's Gemini conversation is an external processor. It stays OFF in production until
-- the Super Admin approves this processor and its transfer record (legal review + DPA status) — an API key is not an
-- approval. The outcome-video search sends no personal data (outcome text + public video link) and is not gated.
INSERT OR IGNORE INTO processor_registry(id,service_code,provider_name,service_name,purpose,role_model,processing_region,data_categories_json,subject_categories_json,dpa_status,training_on_customer_data,retention_note,active,legal_review_status)
VALUES('proc_google_gemini','GOOGLE_GEMINI','Google','Gemini API','Nibiru sohbeti: kullanıcının mesajı ve adsız akademik özet (sınıf, sınav adı, net, kazanım kodu). Ad, numara, iletişim ve rehberlik notu gönderilmez.','PROCESSOR','ABD / küresel','["Nibiru mesaj metni","adsız akademik özet"]','["öğrenci","veli","öğretmen"]','MISSING','ENABLED','Ücretsiz katmanda Google gönderilen içerikleri hizmet geliştirme için kullanabilir ve inceleyebilir; ücretli katmanda kullanmaz.',1,'PENDING');
INSERT OR IGNORE INTO international_transfer_registry(id,processor_id,destination_country_or_region,data_categories_json,subject_categories_json,transfer_mechanism,status,minimization_note)
VALUES('xfer_google_gemini','proc_google_gemini','ABD / küresel','["Nibiru mesaj metni","adsız akademik özet"]','["öğrenci","veli","öğretmen"]','TBD','DRAFT','Ad, numara, telefon, adres ve rehberlik notu gönderilmez; öğrencinin adı yerine {ad} yer tutucusu kullanılır.');
