-- Weekly "Langkah minggu ini" card for first_time sellers on Beranda.
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260905140100_user_weekly_steps.sql

begin;

create table if not exists public.user_weekly_steps (
  user_id    uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  keyword    text,
  category   text,
  steps      jsonb not null default '[]'::jsonb,
  done       boolean[] not null default '{}'::boolean[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.user_weekly_steps enable row level security;

drop policy if exists user_weekly_steps_own on public.user_weekly_steps;
create policy user_weekly_steps_own on public.user_weekly_steps
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.user_weekly_steps to authenticated;

create or replace function public.get_weekly_steps(p_week_start date default null)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := auth.uid();
  v_week date;
  v_row public.user_weekly_steps;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  v_week := coalesce(
    p_week_start,
    (date_trunc('week', (now() at time zone 'Asia/Jakarta')::timestamp))::date
  );
  select * into v_row
  from public.user_weekly_steps
  where user_id = v_me and week_start = v_week;
  if not found then
    return json_build_object('ok', true, 'week_start', v_week, 'steps', '[]'::json, 'done', '[]'::json);
  end if;
  return json_build_object(
    'ok', true,
    'week_start', v_row.week_start,
    'keyword', v_row.keyword,
    'category', v_row.category,
    'steps', v_row.steps,
    'done', to_json(v_row.done)
  );
end $$;

create or replace function public.save_weekly_steps(
  p_week_start date,
  p_keyword text default null,
  p_category text default null,
  p_steps jsonb default '[]'::jsonb,
  p_done boolean[] default '{}'::boolean[]
)
returns json
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := auth.uid();
  v_steps jsonb;
  v_done boolean[];
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_week_start is null then raise exception 'week_required'; end if;
  v_steps := coalesce(p_steps, '[]'::jsonb);
  if jsonb_typeof(v_steps) <> 'array' then v_steps := '[]'::jsonb; end if;
  v_done := coalesce(p_done, '{}'::boolean[]);
  insert into public.user_weekly_steps (user_id, week_start, keyword, category, steps, done, updated_at)
  values (v_me, p_week_start, nullif(btrim(p_keyword), ''), nullif(btrim(p_category), ''), v_steps, v_done, now())
  on conflict (user_id, week_start) do update
    set keyword = excluded.keyword,
        category = excluded.category,
        steps = excluded.steps,
        done = excluded.done,
        updated_at = now();
  return json_build_object('ok', true);
end $$;

create or replace function public.toggle_weekly_step(
  p_week_start date,
  p_idx integer,
  p_done boolean default true
)
returns json
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := auth.uid();
  v_done boolean[];
  v_len int;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_week_start is null or p_idx is null or p_idx < 0 then
    return json_build_object('ok', false, 'error', 'bad_args');
  end if;
  select done into v_done
  from public.user_weekly_steps
  where user_id = v_me and week_start = p_week_start;
  if not found then
    return json_build_object('ok', false, 'error', 'missing');
  end if;
  v_len := coalesce(cardinality(v_done), 0);
  if p_idx >= v_len then
    v_done := v_done || array_fill(false, array[p_idx - v_len + 1]);
  end if;
  v_done[p_idx + 1] := coalesce(p_done, not v_done[p_idx + 1]);
  update public.user_weekly_steps
     set done = v_done, updated_at = now()
   where user_id = v_me and week_start = p_week_start;
  return json_build_object('ok', true, 'done', to_json(v_done));
end $$;

revoke all on function
  public.get_weekly_steps(date),
  public.save_weekly_steps(date, text, text, jsonb, boolean[]),
  public.toggle_weekly_step(date, integer, boolean)
from public, anon;

grant execute on function
  public.get_weekly_steps(date),
  public.save_weekly_steps(date, text, text, jsonb, boolean[]),
  public.toggle_weekly_step(date, integer, boolean)
to authenticated;

notify pgrst, 'reload schema';

commit;
