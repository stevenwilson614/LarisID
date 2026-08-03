-- Helper: does this user have any actual history for their tracked
-- keywords or shops, independent of the currently selected rollup
-- window?  Because Shopee scrape days are sparse and irregular, a
-- 7‑day window may well contain zero scrapes for a perfectly active
-- market.  This function always answers based on a safe 30‑day
-- look‑back (clamped between 1 and 90).
--
-- Once this helper is ready, replace the inline has_history logic
-- inside get_tracker_rollup() with something like:
--    has_history := public.tracker_has_history(30);
-- That call does NOT depend on the window p_days and keeps the
-- calling RPC small.

CREATE OR REPLACE FUNCTION public.tracker_has_history(
    p_lookback_days int DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_uid  uuid;
    v_days int;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    -- clamp to a sensible range so we never scan the whole matview
    v_days := GREATEST(1, LEAST(COALESCE(p_lookback_days, 30), 90));

    -- keyword matview
    IF EXISTS (
        SELECT 1
          FROM public.mv_keyword_daily md
          JOIN public.user_tracked_keywords k
            ON lower(btrim(k.keyword)) = md.keyword
           AND k.user_id = v_uid
         WHERE md.d >= CURRENT_DATE - v_days
    ) THEN
        RETURN TRUE;
    END IF;

    -- shop matview
    IF EXISTS (
        SELECT 1
          FROM public.mv_shop_daily sd
          JOIN public.user_tracked_stores s
            ON sd.shop_id = s.shop_id
           AND s.user_id = v_uid
         WHERE sd.d >= CURRENT_DATE - v_days
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END
$$;

REVOKE ALL ON FUNCTION public.tracker_has_history(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tracker_has_history(int) TO authenticated;

COMMENT ON FUNCTION public.tracker_has_history(int) IS
'Returns TRUE when the currently-authenticated user has at least one
daily snapshot for any tracked keyword or store within a look‑back
window (default 30 days, clamped [1..90]).  For accurate history
detection this must be called independently of the currently selected
report window, because Shopee scrape days are sparse.';
