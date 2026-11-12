-- Rehberlik merkezi R1 (owner, 11–12 Nov 2026). Guidance tests and RBA are part of every school's guidance work, so
-- they are on by default (a school can still switch them off). Meetings, the "Rehber öğretmenime yaz" channel and the
-- counsellor's choices on early-warning signals. No case management (owner: "vakalara gerek yok").
UPDATE platform_features SET enabled_default=1 WHERE feature_key IN ('GUIDANCE_TESTS','RBA');

-- Görüşmeler: individual, group, parent or teacher meetings of a guidance teacher. The summary is the counsellor's
-- own working note (only the counsellor of the student reads it); private notes stay in guidance_private_records.
CREATE TABLE IF NOT EXISTS guidance_meetings (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  counselor_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK(kind IN ('INDIVIDUAL','GROUP','PARENT','TEACHER')),
  area TEXT NOT NULL CHECK(area IN ('ACADEMIC','CAREER','SOCIAL_EMOTIONAL')),
  topic TEXT NOT NULL CHECK(topic IN ('STUDY','EXAM','ATTENDANCE','EXAM_ANXIETY','PEER_BULLYING','SCREEN','FAMILY','FRIENDS','CAREER','HEALTH','OTHER')),
  title TEXT,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','DONE','CANCELLED')),
  summary TEXT,
  next_step TEXT,
  follow_up_date TEXT,
  source_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_guidance_meetings_counselor ON guidance_meetings(counselor_id, scheduled_at);
-- the students of a meeting (one for an individual or parent meeting, several for a group)
CREATE TABLE IF NOT EXISTS guidance_meeting_students (
  meeting_id TEXT NOT NULL REFERENCES guidance_meetings(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  PRIMARY KEY(meeting_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_guidance_meeting_students_student ON guidance_meeting_students(student_id);

-- "Rehber öğretmenime yaz": a student, parent or teacher writes to the school's guidance service. A student may write
-- without a name (student_id stays empty, only the class is kept for routing); only guidance teachers read it.
CREATE TABLE IF NOT EXISTS guidance_messages (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES classes(id) ON DELETE SET NULL,
  student_id TEXT REFERENCES student_entities(id) ON DELETE CASCADE,
  sender_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL CHECK(sender_role IN ('STUDENT','PARENT','TEACHER')),
  anonymous INTEGER NOT NULL DEFAULT 0 CHECK(anonymous IN (0,1)),
  category TEXT NOT NULL CHECK(category IN ('TALK','PEER_BULLYING','STUDY','FAMILY','WORRY','OTHER')),
  body TEXT NOT NULL,
  urgent INTEGER NOT NULL DEFAULT 0 CHECK(urgent IN (0,1)),
  status TEXT NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','SEEN','CLOSED')),
  handled_by TEXT REFERENCES users(id),
  handled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_guidance_messages_inst ON guidance_messages(institution_id, status, created_at DESC);
-- an anonymous message never gets a sender afterwards
CREATE TRIGGER IF NOT EXISTS trg_guidance_messages_anonymous BEFORE UPDATE OF student_id, sender_user_id ON guidance_messages
WHEN OLD.anonymous=1 AND (NEW.student_id IS NOT NULL OR NEW.sender_user_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'ANONYMOUS_MESSAGE'); END;

-- Erken uyarı: the counsellor decides what to do with a signal ("izlemeye al" / "kapat"); the signal itself is computed.
CREATE TABLE IF NOT EXISTS guidance_warning_actions (
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  signal_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('WATCH','DISMISS')),
  until_date TEXT,
  decided_by TEXT NOT NULL REFERENCES users(id),
  decided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(student_id, signal_key)
);
