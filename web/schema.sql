CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  subscription TEXT,
  updated_at INTEGER NOT NULL
);

-- Upcoming reminder times per phone. Text is generic ("Sau bữa trưa · 3 viên"), never medicine names.
CREATE TABLE IF NOT EXISTS reminders (
  device_id TEXT NOT NULL,
  id TEXT NOT NULL,
  at INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT,
  sent_at INTEGER,
  PRIMARY KEY (device_id, id)
);

CREATE INDEX IF NOT EXISTS reminders_due ON reminders (sent_at, at);
