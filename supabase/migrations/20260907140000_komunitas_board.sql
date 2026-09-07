-- Komunitas board: Diskusi (kind=question + topic) beside Usulan Fitur.
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260907140000_komunitas_board.sql
--
-- Baseline on Contabo 2026-09-07 (before this migration):
--   feature_requests=4 (all kind=feature, all non-admin authors)
--   likes=4 (2 distinct likers)
--   comments=4 (1 commenter, all admin)
--   non-admin comments=0

begin;

alter table public.feature_requests
  drop constraint if exists feature_requests_kind_check;

alter table public.feature_requests
  add constraint feature_requests_kind_check
  check (kind in ('feature', 'complaint', 'question'));

alter table public.feature_requests
  add column if not exists topic text;

alter table public.feature_requests
  drop constraint if exists feature_requests_topic_check;

alter table public.feature_requests
  add constraint feature_requests_topic_check
  check (
    topic is null
    or topic in (
      'Foto & Deskripsi',
      'Packing & Ongkir',
      'Iklan Shopee',
      'Kebijakan Shopee',
      'Cara Baca Data LarisID',
      'Cerita & Pelajaran'
    )
  );

create index if not exists idx_fr_kind_topic_created
  on public.feature_requests (kind, topic, created_at desc);

-- Append only: existing feed column order must stay.
create or replace view public.feature_requests_feed as
select
  fr.id, fr.author_id, fr.author_first_name,
  fr.kind, fr.title, fr.body, fr.created_at,
  coalesce(lc.n, 0)::int as like_count,
  coalesce(cc.n, 0)::int as comment_count,
  exists (
    select 1 from public.feature_request_likes l
    where l.request_id = fr.id and l.user_id = auth.uid()
  ) as liked_by_me,
  fr.author_city, fr.author_headshot_url,
  fr.status,
  fr.author_is_admin,
  fr.topic,
  coalesce(nsc.n, 0)::int as non_staff_comment_count
from public.feature_requests fr
left join (select request_id, count(*) n from public.feature_request_likes group by request_id) lc
  on lc.request_id = fr.id
left join (select request_id, count(*) n from public.feature_request_comments group by request_id) cc
  on cc.request_id = fr.id
left join (
  select request_id, count(*) n
  from public.feature_request_comments
  where coalesce(author_is_admin, false) is false
  group by request_id
) nsc on nsc.request_id = fr.id;

grant select on public.feature_requests_feed to authenticated;

create table if not exists public.board_topic_follows (
  user_id    uuid not null references auth.users (id) on delete cascade,
  topic      text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, topic),
  constraint board_topic_follows_topic_check check (
    topic in (
      'Foto & Deskripsi',
      'Packing & Ongkir',
      'Iklan Shopee',
      'Kebijakan Shopee',
      'Cara Baca Data LarisID',
      'Cerita & Pelajaran'
    )
  )
);

create index if not exists idx_board_topic_follows_topic
  on public.board_topic_follows (topic);

alter table public.board_topic_follows enable row level security;

drop policy if exists btf_select on public.board_topic_follows;
create policy btf_select on public.board_topic_follows
  for select to authenticated using (user_id = auth.uid());

drop policy if exists btf_insert on public.board_topic_follows;
create policy btf_insert on public.board_topic_follows
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists btf_delete on public.board_topic_follows;
create policy btf_delete on public.board_topic_follows
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.board_topic_follows to authenticated;

-- Beranda strip: weekly staff question + up to 2 unanswered user questions.
create or replace function public.komunitas_beranda_cards()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_weekly json;
  v_unanswered json;
begin
  if auth.uid() is null then
    return json_build_object('weekly', null, 'unanswered', '[]'::json);
  end if;

  select json_build_object(
           'id', fr.id,
           'title', fr.title,
           'author_first_name', fr.author_first_name,
           'topic', fr.topic,
           'comment_count', coalesce(cc.n, 0),
           'created_at', fr.created_at
         )
    into v_weekly
  from public.feature_requests fr
  left join (
    select request_id, count(*) n from public.feature_request_comments group by request_id
  ) cc on cc.request_id = fr.id
  where fr.kind = 'question'
    and fr.author_is_admin is true
    and fr.created_at >= now() - interval '14 days'
  order by fr.created_at desc
  limit 1;

  select coalesce(json_agg(x), '[]'::json)
    into v_unanswered
  from (
    select json_build_object(
             'id', fr.id,
             'title', fr.title,
             'author_first_name', fr.author_first_name,
             'topic', fr.topic,
             'comment_count', 0,
             'created_at', fr.created_at
           ) as x
    from public.feature_requests fr
    left join public.feature_request_comments c on c.request_id = fr.id
    where fr.kind = 'question'
      and (v_weekly is null or fr.id <> ((v_weekly ->> 'id')::uuid))
    group by fr.id
    having count(c.id) = 0
    order by fr.created_at desc
    limit 2
  ) q;

  return json_build_object(
    'weekly', v_weekly,
    'unanswered', coalesce(v_unanswered, '[]'::json)
  );
end;
$$;

revoke all on function public.komunitas_beranda_cards() from public;
grant execute on function public.komunitas_beranda_cards() to authenticated;

create or replace function public.komunitas_board_metrics()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.user_is_platform_admin(v_uid) then
    raise exception 'forbidden';
  end if;

  return json_build_object(
    'questions', (select count(*)::int from public.feature_requests where kind = 'question'),
    'usulan', (select count(*)::int from public.feature_requests where kind in ('feature', 'complaint')),
    'unanswered_questions', (
      select count(*)::int
      from public.feature_requests fr
      where fr.kind = 'question'
        and not exists (select 1 from public.feature_request_comments c where c.request_id = fr.id)
    ),
    'non_admin_repliers_30d', (
      select count(distinct c.author_id)::int
      from public.feature_request_comments c
      where c.created_at >= now() - interval '30 days'
        and coalesce(c.author_is_admin, false) is false
    ),
    'questions_with_non_admin_reply_48h', (
      select count(*)::int
      from public.feature_requests fr
      where fr.kind = 'question'
        and exists (
          select 1 from public.feature_request_comments c
          where c.request_id = fr.id
            and coalesce(c.author_is_admin, false) is false
            and c.created_at <= fr.created_at + interval '48 hours'
        )
    ),
    'board_dms_30d', (
      select count(*)::int
      from public.user_messages
      where created_at >= now() - interval '30 days'
    )
  );
end;
$$;

revoke all on function public.komunitas_board_metrics() from public;
grant execute on function public.komunitas_board_metrics() to authenticated;

create or replace function public.komunitas_unanswered_staff()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rows json;
begin
  if v_uid is null or not public.user_is_platform_admin(v_uid) then
    raise exception 'forbidden';
  end if;

  select coalesce(json_agg(x order by (x ->> 'created_at')::timestamptz), '[]'::json)
    into v_rows
  from (
    select json_build_object(
             'id', fr.id,
             'title', fr.title,
             'topic', fr.topic,
             'author_first_name', fr.author_first_name,
             'author_is_admin', fr.author_is_admin,
             'created_at', fr.created_at,
             'hours_old', round(extract(epoch from (now() - fr.created_at)) / 3600.0, 1)
           ) as x
    from public.feature_requests fr
    where fr.kind = 'question'
      and fr.created_at <= now() - interval '48 hours'
      and not exists (
        select 1 from public.feature_request_comments c
        where c.request_id = fr.id
          and coalesce(c.author_is_admin, false) is false
      )
  ) q;

  return coalesce(v_rows, '[]'::json);
end;
$$;

revoke all on function public.komunitas_unanswered_staff() from public;
grant execute on function public.komunitas_unanswered_staff() to authenticated;

create or replace function public.komunitas_weekly_draft()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_kw text;
  v_units bigint;
  v_prev bigint;
  v_span int;
begin
  if v_uid is null or not public.user_is_platform_admin(v_uid) then
    raise exception 'forbidden';
  end if;

  select kw.keyword, kw.wk_units, kw.wk_units_prev, kw.wk_span_days
    into v_kw, v_units, v_prev, v_span
  from public.mv_keyword_weekly kw
  where kw.wk_units is not null
  order by kw.wk_units desc nulls last
  limit 1;

  if v_kw is null then
    return json_build_object('ok', false, 'reason', 'no_keyword');
  end if;

  return json_build_object(
    'ok', true,
    'keyword', v_kw,
    'wk_units', v_units,
    'wk_units_prev', v_prev,
    'wk_span_days', v_span,
    'label', 'perkiraan',
    'draft_title', 'Keyword yang lagi gerak: ' || v_kw,
    'draft_body',
      'Data LarisID (perkiraan, dinormalisasi 7 hari — scrape kami 12–17 hari, bukan minggu kalender): '
      || v_kw
      || ' sekitar '
      || coalesce(v_units::text, '—')
      || ' unit/minggu'
      || case
           when v_prev is not null and v_prev > 0 then
             ' (periode sebelumnya ~' || v_prev::text || ').'
           else '.'
         end
      || ' Ada yang main di kategori ini? Apa yang kamu lihat di tokomu?'
  );
end;
$$;

revoke all on function public.komunitas_weekly_draft() from public;
grant execute on function public.komunitas_weekly_draft() to authenticated;

create or replace function public.komunitas_invite_candidates()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rows json;
begin
  if v_uid is null or not public.user_is_platform_admin(v_uid) then
    raise exception 'forbidden';
  end if;

  select coalesce(json_agg(x), '[]'::json)
    into v_rows
  from (
    select json_build_object(
             'user_id', last_dd.user_id,
             'first_name', coalesce(nullif(trim(up.first_name), ''), split_part(u.email, '@', 1), 'Pengguna'),
             'keyword', last_dd.keyword,
             'last_deepdive_at', last_dd.created_at
           ) as x
    from (
      select distinct on (d.user_id)
             d.user_id, d.keyword, d.created_at
      from public.deepdive_opens d
      where d.user_id is not null
      order by d.user_id, d.created_at desc
    ) last_dd
    join auth.users u on u.id = last_dd.user_id
    left join public.user_profiles up on up.user_id = last_dd.user_id
    where not public.user_is_platform_admin(last_dd.user_id)
      and not exists (
        select 1 from public.feature_requests fr where fr.author_id = last_dd.user_id
      )
      and not exists (
        select 1 from public.feature_request_comments c where c.author_id = last_dd.user_id
      )
    order by last_dd.created_at desc
    limit 20
  ) q;

  return coalesce(v_rows, '[]'::json);
end;
$$;

revoke all on function public.komunitas_invite_candidates() from public;
grant execute on function public.komunitas_invite_candidates() to authenticated;

-- Service-role helper for the staff digest (no auth.uid()).
create or replace function public.komunitas_staff_digest_payload()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_unanswered json;
  v_draft json;
  v_invites json;
begin
  select coalesce(json_agg(x order by (x ->> 'created_at')::timestamptz), '[]'::json)
    into v_unanswered
  from (
    select json_build_object(
             'id', fr.id,
             'title', fr.title,
             'topic', fr.topic,
             'author_first_name', fr.author_first_name,
             'author_is_admin', fr.author_is_admin,
             'created_at', fr.created_at,
             'hours_old', round(extract(epoch from (now() - fr.created_at)) / 3600.0, 1)
           ) as x
    from public.feature_requests fr
    where fr.kind = 'question'
      and fr.created_at <= now() - interval '48 hours'
      and not exists (
        select 1 from public.feature_request_comments c
        where c.request_id = fr.id
          and coalesce(c.author_is_admin, false) is false
      )
  ) q;

  select json_build_object(
           'ok', true,
           'keyword', kw.keyword,
           'wk_units', kw.wk_units,
           'wk_units_prev', kw.wk_units_prev,
           'wk_span_days', kw.wk_span_days,
           'label', 'perkiraan'
         )
    into v_draft
  from public.mv_keyword_weekly kw
  where kw.wk_units is not null
  order by kw.wk_units desc nulls last
  limit 1;

  select coalesce(json_agg(x), '[]'::json)
    into v_invites
  from (
    select json_build_object(
             'user_id', last_dd.user_id,
             'first_name', coalesce(nullif(trim(up.first_name), ''), split_part(u.email, '@', 1), 'Pengguna'),
             'keyword', last_dd.keyword,
             'last_deepdive_at', last_dd.created_at
           ) as x
    from (
      select distinct on (d.user_id)
             d.user_id, d.keyword, d.created_at
      from public.deepdive_opens d
      where d.user_id is not null
      order by d.user_id, d.created_at desc
    ) last_dd
    join auth.users u on u.id = last_dd.user_id
    left join public.user_profiles up on up.user_id = last_dd.user_id
    where not public.user_is_platform_admin(last_dd.user_id)
      and not exists (
        select 1 from public.feature_requests fr where fr.author_id = last_dd.user_id
      )
      and not exists (
        select 1 from public.feature_request_comments c where c.author_id = last_dd.user_id
      )
    order by last_dd.created_at desc
    limit 20
  ) q;

  return json_build_object(
    'unanswered', coalesce(v_unanswered, '[]'::json),
    'weekly_draft', v_draft,
    'invites', coalesce(v_invites, '[]'::json)
  );
end;
$$;

revoke all on function public.komunitas_staff_digest_payload() from public;
grant execute on function public.komunitas_staff_digest_payload() to service_role;

notify pgrst, 'reload schema';

commit;
