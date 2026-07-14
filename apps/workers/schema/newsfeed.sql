-- Newsfeed / pledge items (§7). Low-write by design: a bounded cron inserts,
-- an admin occasionally updates. Public reads go through the cached
-- /feed.json endpoint, never per-request queries at scale.
CREATE TABLE IF NOT EXISTS newsfeed_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dedupe_hash TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL,
  source_domain TEXT NOT NULL,
  -- 'A' = display-only news; 'B' = carries $/eligibility and can feed the
  -- calculator. Tier B is only ever created by human promotion (§2.6).
  tier TEXT NOT NULL DEFAULT 'A' CHECK (tier IN ('A', 'B')),
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'pending', 'rejected')),
  -- Tier B structured fields (NULL for Tier A)
  amount_cents INTEGER,
  recurring INTEGER NOT NULL DEFAULT 0,
  qualifies_note TEXT,
  birth_year_start INTEGER,
  birth_year_end INTEGER,
  created_at TEXT NOT NULL,
  published_at TEXT,
  reviewed_by TEXT,
  review_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_items_pub ON newsfeed_items (status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_status ON newsfeed_items (status, created_at DESC);
