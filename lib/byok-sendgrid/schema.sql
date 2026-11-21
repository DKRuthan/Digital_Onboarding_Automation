CREATE TABLE IF NOT EXISTS email_connections (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  label TEXT NOT NULL COLLATE NOCASE,
  from_email TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  UNIQUE (owner_id, label)
);

CREATE TABLE IF NOT EXISTS email_send_budget (
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  used INTEGER NOT NULL,
  PRIMARY KEY (owner_id, kind)
);

CREATE TABLE IF NOT EXISTS email_deliveries (
  owner_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  digest TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sending', 'accepted', 'rejected', 'unknown')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, request_id)
);
