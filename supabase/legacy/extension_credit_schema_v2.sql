-- ============================================================
-- LarisID Credit System — run once in Supabase SQL Editor
-- ============================================================

-- User credit balances (one row per user)
CREATE TABLE IF NOT EXISTS user_credits (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  balance                 INTEGER NOT NULL DEFAULT 5,   -- starts with 5 free credits
  earned_total            INTEGER NOT NULL DEFAULT 0,
  spent_total             INTEGER NOT NULL DEFAULT 0,
  last_monthly_grant_at   TIMESTAMPTZ,
  monthly_free_expires_at TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Credit event ledger
CREATE TABLE IF NOT EXISTS credit_events (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL, -- earn_search | earn_monthly | spend_view | spend_ai | purchase
  amount     INTEGER NOT NULL,
  keyword    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- One completion per keyword per user per day (prevents double counting)
CREATE TABLE IF NOT EXISTS search_completions (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword        TEXT NOT NULL,
  completed_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, keyword, completed_date)
);

-- Keyword library: keywords a user has unlocked (paid 1 credit to Deep Dive)
CREATE TABLE IF NOT EXISTS keyword_library (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword      TEXT NOT NULL,
  unlocked_at  TIMESTAMPTZ DEFAULT NOW(),
  ai_prompts_used INTEGER DEFAULT 0,
  UNIQUE(user_id, keyword)
);

-- ── Row Level Security ───────────────────────────────────────

ALTER TABLE user_credits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_library   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own credits"       ON user_credits       FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own events"        ON credit_events      FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own completions"   ON search_completions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own library"       ON keyword_library    FOR ALL USING (auth.uid() = user_id);

-- ── RPC: earn_credit ─────────────────────────────────────────
-- Called by the extension when a milestone is hit.
-- Atomically increments balance, records event, returns new balance.

CREATE OR REPLACE FUNCTION earn_credit(p_amount INTEGER DEFAULT 1)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_balance INTEGER;
BEGIN
  INSERT INTO user_credits (user_id, balance, earned_total)
  VALUES (auth.uid(), p_amount, p_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET balance      = user_credits.balance + p_amount,
        earned_total = user_credits.earned_total + p_amount,
        updated_at   = NOW()
  RETURNING balance INTO v_balance;

  INSERT INTO credit_events (user_id, type, amount)
  VALUES (auth.uid(), 'earn_search', p_amount);

  RETURN v_balance;
END;
$$;

-- ── RPC: spend_credit ────────────────────────────────────────
-- Called by the dashboard when a user unlocks a keyword Deep Dive.
-- Returns new balance, or raises exception if insufficient.

CREATE OR REPLACE FUNCTION spend_credit(p_keyword TEXT, p_amount INTEGER DEFAULT 1)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_balance INTEGER;
BEGIN
  -- Check balance
  SELECT balance INTO v_balance FROM user_credits WHERE user_id = auth.uid();
  IF v_balance IS NULL OR v_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  -- Deduct
  UPDATE user_credits
    SET balance    = balance - p_amount,
        spent_total = spent_total + p_amount,
        updated_at = NOW()
  WHERE user_id = auth.uid()
  RETURNING balance INTO v_balance;

  -- Record event
  INSERT INTO credit_events (user_id, type, amount, keyword)
  VALUES (auth.uid(), 'spend_view', -p_amount, p_keyword);

  -- Add to library
  INSERT INTO keyword_library (user_id, keyword)
  VALUES (auth.uid(), p_keyword)
  ON CONFLICT (user_id, keyword) DO NOTHING;

  RETURN v_balance;
END;
$$;

-- ── Monthly grant cron (run via pg_cron or Supabase scheduled function) ──────
-- Grant 5 free credits on each user's signup anniversary (day-of-month), not the 1st.
-- See migration: grant_due_monthly_credits()
-- Set this up in Supabase Dashboard → Database → Cron Jobs:
--   Schedule: 0 3 * * *   (daily, e.g. 03:00 UTC)
--   Query: SELECT public.grant_due_monthly_credits();

-- ── Weekly Treasure Chest ────────────────────────────────────────────────────
-- Users unlock the chest after 5 searches in a week. Resets every Monday.

CREATE TABLE IF NOT EXISTS chest_history (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reward     INTEGER NOT NULL,
  week_start DATE NOT NULL
);

ALTER TABLE chest_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own chest history" ON chest_history FOR ALL USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION claim_weekly_chest()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_week_start DATE;
  v_searches   INTEGER;
  v_needed     INTEGER := 5;
  v_reward     INTEGER;
  v_rand       REAL;
  v_balance    INTEGER;
BEGIN
  -- Current week's Monday
  v_week_start := date_trunc('week', NOW())::DATE;

  -- Already claimed this week?
  IF EXISTS (SELECT 1 FROM chest_history WHERE user_id = auth.uid() AND week_start = v_week_start) THEN
    RETURN json_build_object('error', 'already_claimed', 'week_start', v_week_start);
  END IF;

  -- Count distinct keyword searches this week
  SELECT COUNT(DISTINCT keyword) INTO v_searches
  FROM search_completions
  WHERE user_id = auth.uid() AND completed_date >= v_week_start;

  IF v_searches < v_needed THEN
    RETURN json_build_object('searches_this_week', v_searches, 'needed', v_needed);
  END IF;

  -- Weighted reward: 3cr=50%, 5cr=35%, 10cr=15%
  v_rand := random();
  IF v_rand < 0.50 THEN v_reward := 3;
  ELSIF v_rand < 0.85 THEN v_reward := 5;
  ELSE v_reward := 10;
  END IF;

  -- Record claim
  INSERT INTO chest_history (user_id, reward, week_start)
  VALUES (auth.uid(), v_reward, v_week_start);

  -- Add credits
  INSERT INTO user_credits (user_id, balance, earned_total)
  VALUES (auth.uid(), v_reward, v_reward)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = user_credits.balance + v_reward,
        earned_total = user_credits.earned_total + v_reward,
        updated_at = NOW()
  RETURNING balance INTO v_balance;

  INSERT INTO credit_events (user_id, type, amount)
  VALUES (auth.uid(), 'earn_chest', v_reward);

  RETURN json_build_object('reward', v_reward, 'balance', v_balance, 'searches_this_week', v_searches);
END;
$$;

-- ── Admin Stats ───────────────────────────────────────────────────────────────
-- Single RPC returning all owner analytics. Only callable by the owner account.
-- Run: SELECT admin_stats(); from the owner's authenticated session.

CREATE OR REPLACE FUNCTION admin_stats()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_owner_email TEXT := 'stevenwilson614@gmail.com';
  v_caller_email TEXT;
BEGIN
  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
  IF v_caller_email IS DISTINCT FROM v_owner_email THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN json_build_object(
    'total_signups',     (SELECT COUNT(*) FROM auth.users),
    'signups_last_7d',   (SELECT COUNT(*) FROM auth.users WHERE created_at >= NOW() - INTERVAL '7 days'),
    'signups_last_30d',  (SELECT COUNT(*) FROM auth.users WHERE created_at >= NOW() - INTERVAL '30 days'),
    'dau_last_30d', (
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT created_at::DATE as date, COUNT(DISTINCT user_id) as active_users
        FROM credit_events
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY 1 ORDER BY 1
      ) t
    ),
    'credit_events_by_type', (
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT type, COUNT(*) as events, COALESCE(SUM(amount),0) as total_credits
        FROM credit_events GROUP BY type ORDER BY events DESC
      ) t
    ),
    'users_never_purchased', (
      SELECT COUNT(*) FROM user_credits
      WHERE user_id NOT IN (SELECT DISTINCT user_id FROM credit_events WHERE type = 'purchase')
    ),
    'top_keywords', (
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT keyword, COUNT(*) as completions
        FROM search_completions
        WHERE keyword IS NOT NULL AND keyword <> ''
        GROUP BY keyword ORDER BY completions DESC LIMIT 20
      ) t
    ),
    'total_credits_in_circulation', (SELECT COALESCE(SUM(balance),0) FROM user_credits),
    'avg_balance_per_user',         (SELECT ROUND(AVG(balance),1) FROM user_credits)
  );
END;
$$;

-- ── Product detail snapshots ─────────────────────────────────────────────────
-- Written by the extension whenever a user views an individual product page.
-- Each row is a point-in-time snapshot: stock, sold, reviews, price at that moment.
-- Use to: track sales velocity, validate multipliers, discover products outside keyword list.

CREATE TABLE IF NOT EXISTS item_snapshots (
  id              BIGSERIAL PRIMARY KEY,
  item_id         BIGINT        NOT NULL,
  shop_id         BIGINT        NOT NULL,
  scraped_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  product_name    TEXT,
  store_name      TEXT,
  price           REAL,
  original_price  REAL,
  total_sold      BIGINT,
  rating          REAL,
  reviews         INTEGER,
  stock           INTEGER,
  wishlist        INTEGER,
  brand           TEXT,
  comments        INTEGER,
  location        TEXT,
  image_url       TEXT,
  url             TEXT
);

CREATE INDEX IF NOT EXISTS idx_item_snapshots_item_id    ON item_snapshots (item_id);
CREATE INDEX IF NOT EXISTS idx_item_snapshots_scraped_at ON item_snapshots (scraped_at DESC);

-- Allow anon (extension) to insert snapshots
ALTER TABLE item_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon can insert snapshots" ON item_snapshots FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "service role full access"  ON item_snapshots FOR ALL  TO service_role USING (true);

-- ── Extension Linking ─────────────────────────────────────────────────────────
-- Short-lived codes generated by the dashboard, redeemed by the extension.
-- Tokens stored temporarily so the extension can get a real Supabase session.

CREATE TABLE IF NOT EXISTS extension_codes (
  code          TEXT PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 minutes',
  used          BOOLEAN NOT NULL DEFAULT FALSE
);

-- No RLS needed — all access goes through SECURITY DEFINER functions below.
-- The table itself is not directly queryable by anon or authenticated roles.
ALTER TABLE extension_codes ENABLE ROW LEVEL SECURITY;
-- (No policies = no direct access; functions bypass RLS via SECURITY DEFINER)

-- Called by the dashboard (authenticated user) to generate a linking code.
CREATE OR REPLACE FUNCTION create_extension_code(
  p_access_token  TEXT,
  p_refresh_token TEXT
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_code TEXT;
BEGIN
  -- Remove any previous unused codes for this user
  DELETE FROM extension_codes WHERE user_id = auth.uid();

  -- 8-char uppercase hex code (4 random bytes → always exactly 8 chars)
  v_code := upper(encode(gen_random_bytes(4), 'hex'));

  INSERT INTO extension_codes (code, user_id, access_token, refresh_token)
  VALUES (v_code, auth.uid(), p_access_token, p_refresh_token);

  RETURN v_code;
END;
$$;

-- Called by the extension (anon key) to exchange a code for session tokens.
CREATE OR REPLACE FUNCTION redeem_extension_code(p_code TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_row extension_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM extension_codes
  WHERE code = upper(p_code)
    AND used = FALSE
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_or_expired_code';
  END IF;

  UPDATE extension_codes SET used = TRUE WHERE code = upper(p_code);

  RETURN json_build_object(
    'access_token',  v_row.access_token,
    'refresh_token', v_row.refresh_token,
    'user_id',       v_row.user_id
  );
END;
$$;
