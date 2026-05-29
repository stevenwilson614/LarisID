-- LarisID platform badges ("Lencana"): genuine, automatic recognition for real
-- milestones in a seller's journey. Per MISSION.md these reflect actual user
-- achievement only — no manufactured/fake badges, no dark patterns.
--
-- Two tables:
--   achievements      — catalog of badge definitions (readable by all authed)
--   user_achievements — which user earned which badge (read own; insert via RPC)
--
-- Awarding happens through the security-definer RPC award_achievement(key) and a
-- safety-net trigger on activity_events that maps known honest event types to
-- achievement keys. Both paths are idempotent (on conflict do nothing).

-- ── Catalog ─────────────────────────────────────────────────────────────────

create table if not exists public.achievements (
  id          uuid        primary key default gen_random_uuid(),
  key         text        not null unique,
  title       text        not null,
  description text,
  icon        text,
  criteria    text,
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now()
);

-- ── Earned badges ─────────────────────────────────────────────────────────────

create table if not exists public.user_achievements (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users(id) on delete cascade,
  achievement_id uuid        not null references public.achievements(id) on delete cascade,
  awarded_at     timestamptz not null default now(),
  unique (user_id, achievement_id)
);

create index if not exists idx_user_achievements_user on public.user_achievements (user_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.achievements enable row level security;

drop policy if exists achievements_select on public.achievements;
create policy achievements_select on public.achievements
  for select using (auth.uid() is not null);

alter table public.user_achievements enable row level security;

-- A user can read their own earned badges. A cohort mentor can read the badges of
-- students in cohorts they lead (so the student directory drawer can show them).
drop policy if exists user_achievements_select on public.user_achievements;
create policy user_achievements_select on public.user_achievements
  for select using (
    user_id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1
      from public.cohort_members m
      join public.cohorts c on c.id = m.cohort_id
      where m.user_id = user_achievements.user_id
        and c.mentor_user_id = auth.uid()
    )
  );

-- No direct client INSERT/UPDATE/DELETE: awards only happen via the RPC/trigger
-- below (both run as security definer). With RLS on and no insert policy, direct
-- inserts from authenticated users are denied.

-- ── RPC: award_achievement(key) ─────────────────────────────────────────────────
-- Awards the badge with the given key to the current user. Idempotent.

create or replace function public.award_achievement(p_key text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_achievement uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select id into v_achievement
  from public.achievements
  where key = p_key;

  if v_achievement is null then
    -- Unknown key: silently ignore so client callers never error on a typo or a
    -- not-yet-seeded badge.
    return;
  end if;

  insert into public.user_achievements (user_id, achievement_id)
  values (auth.uid(), v_achievement)
  on conflict (user_id, achievement_id) do nothing;
end;
$$;

revoke all on function public.award_achievement(text) from public;
grant execute on function public.award_achievement(text) to authenticated;

-- ── Trigger: award badges from activity_events ──────────────────────────────────
-- Safety net so cohort activity that already lands in activity_events also earns
-- the matching badge server-side. Maps only honest, real-action event types.
-- Runs as the table owner (definer) so it can write to user_achievements.

create or replace function public.award_achievements_from_event()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_key text;
  v_achievement uuid;
begin
  if new.user_id is null then
    return new;
  end if;

  v_key := case new.event_type
    when 'product_saved'  then 'first_product_lookup'
    when 'deepdive_open'  then 'first_deep_dive'
    when 'sale_marked'    then 'first_sale'
    else null
  end;

  if v_key is null then
    return new;
  end if;

  select id into v_achievement from public.achievements where key = v_key;
  if v_achievement is null then
    return new;
  end if;

  insert into public.user_achievements (user_id, achievement_id)
  values (new.user_id, v_achievement)
  on conflict (user_id, achievement_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_award_achievements on public.activity_events;
create trigger trg_award_achievements
  after insert on public.activity_events
  for each row execute function public.award_achievements_from_event();

-- ── Seed starter badges ─────────────────────────────────────────────────────────
-- Bahasa Indonesia copy. Each badge maps to a genuine, user-performed milestone.

insert into public.achievements (key, title, description, icon, criteria, sort_order)
values
  ('first_product_lookup', 'Produk pertama',
   'Kamu menyimpan produk pertama untuk diriset. Langkah awal menemukan peluang.',
   '🔍', 'Menyimpan satu produk ke daftar riset.', 10),
  ('first_deep_dive', 'Analisa mendalam pertama',
   'Kamu membuka analisa mendalam (Deep Dive) untuk pertama kalinya. Memahami pasar lebih dalam.',
   '📊', 'Membuka satu Deep Dive produk.', 20),
  ('first_sale', 'Penjualan pertama',
   'Kamu menandai produk pertama yang kamu jual. Selamat memulai perjalanan jualan!',
   '🏪', 'Menandai satu produk dengan "Saya jual ini".', 30)
on conflict (key) do update
set title       = excluded.title,
    description = excluded.description,
    icon        = excluded.icon,
    criteria    = excluded.criteria,
    sort_order  = excluded.sort_order;
