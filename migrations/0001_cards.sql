CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  friend_label TEXT NOT NULL,
  greeting TEXT NOT NULL,
  cooldown_until INTEGER NOT NULL DEFAULT 0,
  attempt_id TEXT
);
