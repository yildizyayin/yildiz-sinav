PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS nibiru_whatsapp_status_events (
  provider_message_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('SENT','DELIVERED','READ','FAILED','UNKNOWN')),
  recipient_phone_e164 TEXT,
  error_code TEXT,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(provider_message_id,status,occurred_at)
);

CREATE INDEX IF NOT EXISTS idx_nibiru_whatsapp_status_received
ON nibiru_whatsapp_status_events(status,received_at DESC);
