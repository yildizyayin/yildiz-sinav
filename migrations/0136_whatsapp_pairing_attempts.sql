-- A068: pairing-code guessing is limited per phone number (failed attempts in the last hour).
CREATE TABLE nibiru_pairing_attempts (
  id TEXT PRIMARY KEY,
  phone_e164 TEXT NOT NULL,
  succeeded INTEGER NOT NULL CHECK(succeeded IN (0,1)),
  attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX nibiru_pairing_attempts_phone ON nibiru_pairing_attempts(phone_e164, attempted_at);
