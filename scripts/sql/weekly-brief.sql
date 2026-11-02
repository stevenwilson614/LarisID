-- Top keyword markets by 7-day-equivalent units, for the public /tren/ brief.
-- Read-only. Run via scripts/fetch-weekly-brief.mjs (ssh + psql on Contabo).
--
-- Floors match the in-app badge (docs/terlaris-minggu.md): wk_units >= 25 and
-- wk_items >= 2, so one listing cannot mint a row. Growth % is computed later
-- in the page builder from wk_units vs wk_units_prev, and only when wk_base
-- is large enough. This query does not label a raw two-snapshot delta as a week.

select json_build_object(
  'rows', coalesce((
    select json_agg(row_to_json(s) order by s.wk_units desc)
    from (
      select keyword,
             wk_units,
             wk_base,
             wk_items,
             wk_span_days,
             wk_anchor_at,
             wk_units_prev,
             wk_items_prev
      from public.mv_keyword_weekly
      where wk_units >= 25
        and wk_items >= 2
      order by wk_units desc
      limit 20
    ) s
  ), '[]'::json)
);
