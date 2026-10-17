-- Open Belajar to every signed-in user. Keep Edukasi interest rows.
-- Page visits: belajar_page_view joins edu_page_view in the admin funnel.
-- Mulai / lesson opens land on user_course_state so we can see where people stop.
-- Contabo: bash scripts/apply-selfhost.sh supabase/migrations/20261017150000_belajar_public.sql

-- ── Lift admin-only on learner RPCs (editor RPCs stay gated) ───────────────

do $$
declare
  def text;
  neu text := $neu$if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'login_required');
  end if;
  if not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'error', 'admin_only');
  end if;$neu$;
  old text := $old$if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'login_required');
  end if;$old$;
  sig text;
begin
  foreach sig in array array[
    'public.belajar_course()',
    'public.belajar_mark_lesson(uuid,text,jsonb)',
    'public.belajar_set_state(text,text[])',
    'public.belajar_save_draft(jsonb)',
    'public.belajar_set_baseline(text)',
    'public.belajar_link_shop(text)',
    'public.belajar_set_reported_omset(bigint)'
  ]
  loop
    select pg_get_functiondef(sig::regprocedure) into def;
    if position(neu in def) = 0 then
      raise notice 'belajar public: admin gate already gone in %', sig;
      continue;
    end if;
    execute replace(def, neu, old);
  end loop;
end $$;

-- ── Count Belajar opens next to the old Edukasi page views ────────────────

do $$
declare
  def text;
begin
  select pg_get_functiondef('public.education_admin_overview()'::regprocedure) into def;
  def := replace(
    def,
    'e.event_type = ''edu_page_view''',
    'e.event_type in (''edu_page_view'', ''belajar_page_view'')'
  );
  execute def;
end $$;

comment on function public.education_admin_overview() is
  'Platform-admin funnel: unique Belajar/Edukasi page openers, mentor interest (education_interests, including people who signed up on the old Edukasi page), and kota.';

-- ── Where someone stopped after Mulai ──────────────────────────────────────

alter table public.user_course_state
  add column if not exists mulai_at timestamptz,
  add column if not exists last_slug text,
  add column if not exists last_at timestamptz,
  add column if not exists furthest_slug text;

create or replace function public.belajar_touch(p_kind text, p_slug text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_slug text := left(btrim(coalesce(p_slug, '')), 80);
  v_new int;
  v_old int;
  v_furthest text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'login_required');
  end if;
  if v_kind not in ('mulai', 'open') then
    return jsonb_build_object('ok', false, 'error', 'bad_kind');
  end if;

  insert into public.user_course_state (user_id)
  values (v_me)
  on conflict (user_id) do nothing;

  if v_kind = 'mulai' then
    update public.user_course_state
       set mulai_at = coalesce(mulai_at, now()),
           updated_at = now()
     where user_id = v_me;
  end if;

  if v_slug <> '' and exists (
    select 1
    from public.course_lessons l
    join public.course_modules m on m.id = l.module_id
    where l.slug = v_slug and l.published and m.published
  ) then
    select (m.sort_order * 1000 + l.sort_order)
      into v_new
    from public.course_lessons l
    join public.course_modules m on m.id = l.module_id
    where l.slug = v_slug
    limit 1;

    select furthest_slug into v_furthest
    from public.user_course_state
    where user_id = v_me;

    select (m.sort_order * 1000 + l.sort_order)
      into v_old
    from public.course_lessons l
    join public.course_modules m on m.id = l.module_id
    where l.slug = v_furthest
    limit 1;

    update public.user_course_state
       set last_slug = v_slug,
           last_at = now(),
           furthest_slug = case
             when v_furthest is null or v_old is null or v_new >= v_old then v_slug
             else furthest_slug
           end,
           mulai_at = case when v_kind = 'mulai' then coalesce(mulai_at, now()) else mulai_at end,
           updated_at = now()
     where user_id = v_me;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.belajar_touch(text, text) from public, anon;
grant execute on function public.belajar_touch(text, text) to authenticated;

create or replace function public.belajar_admin_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_stops jsonb := '[]'::jsonb;
  v_people jsonb := '[]'::jsonb;
begin
  if not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'error', 'admin_only');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', s.slug,
    'title', s.title,
    'module_title', s.module_title,
    'n', s.n
  ) order by s.ord nulls last, s.title), '[]'::jsonb)
    into v_stops
  from (
    select
      coalesce(st.last_slug, '') as slug,
      coalesce(l.title, 'Belum buka pelajaran') as title,
      coalesce(m.title, '') as module_title,
      count(*)::int as n,
      min(m.sort_order * 1000 + l.sort_order) as ord
    from public.user_course_state st
    left join public.course_lessons l on l.slug = st.last_slug
    left join public.course_modules m on m.id = l.module_id
    where st.mulai_at is not null
    group by st.last_slug, l.title, m.title
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', p.user_id,
    'name', p.name,
    'mulai_at', p.mulai_at,
    'last_slug', p.last_slug,
    'last_title', p.last_title,
    'furthest_slug', p.furthest_slug,
    'furthest_title', p.furthest_title,
    'done', p.done_n,
    'total', p.total_n
  ) order by p.mulai_at desc), '[]'::jsonb)
    into v_people
  from (
    select
      st.user_id,
      coalesce(
        nullif(btrim(up.display_name), ''),
        nullif(btrim(up.first_name), ''),
        left(st.user_id::text, 8)
      ) as name,
      st.mulai_at,
      st.last_slug,
      coalesce(ll.title, 'Belum buka pelajaran') as last_title,
      st.furthest_slug,
      coalesce(fl.title, '') as furthest_title,
      (
        select count(*)::int
        from public.user_lesson_progress pr
        join public.course_lessons cl on cl.id = pr.lesson_id and cl.published
        where pr.user_id = st.user_id and pr.status = 'done'
      ) as done_n,
      (
        select count(*)::int
        from public.course_lessons cl
        join public.course_modules cm on cm.id = cl.module_id and cm.published
        where cl.published
      ) as total_n
    from public.user_course_state st
    left join public.user_profiles up on up.user_id = st.user_id
    left join public.course_lessons ll on ll.slug = st.last_slug
    left join public.course_lessons fl on fl.slug = st.furthest_slug
    where st.mulai_at is not null
    order by st.mulai_at desc
    limit 80
  ) p;

  return jsonb_build_object(
    'ok', true,
    'started', (select count(*)::int from public.user_course_state where mulai_at is not null),
    'stops', v_stops,
    'people', v_people
  );
end;
$$;

revoke all on function public.belajar_admin_progress() from public, anon;
grant execute on function public.belajar_admin_progress() to authenticated;

notify pgrst, 'reload schema';
