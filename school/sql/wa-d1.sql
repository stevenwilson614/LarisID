-- Cloudflare D1 store for Anton CRM WhatsApp threads.
-- Applied by Pages Functions on first use, and by deploy-school-pages.sh.
-- Not Contabo. Do not apply the Postgres drafts in this folder.

CREATE TABLE IF NOT EXISTS wa_threads (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  person_id TEXT,
  phone TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  unread INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS wa_threads_slug_phone
  ON wa_threads (slug, phone);

CREATE INDEX IF NOT EXISTS wa_threads_slug_person
  ON wa_threads (slug, person_id);

CREATE INDEX IF NOT EXISTS wa_threads_slug_updated
  ON wa_threads (slug, updated_at);

CREATE TABLE IF NOT EXISTS wa_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  body TEXT NOT NULL,
  at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  provider_id TEXT
);

CREATE INDEX IF NOT EXISTS wa_messages_thread_at
  ON wa_messages (thread_id, at);

CREATE UNIQUE INDEX IF NOT EXISTS wa_messages_provider
  ON wa_messages (provider_id)
  WHERE provider_id IS NOT NULL AND provider_id != '';
