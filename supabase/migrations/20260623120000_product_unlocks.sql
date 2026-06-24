-- Per-product, time-limited credit unlocks for the Deep Dive full-data tabs.
-- The simple Deep Dive summary + the Biaya E-commerce tab stay free; each other
-- full-data tab costs 1 credit, OR 5 credits unlocks every tab + the calculator
-- for the whole product for 7 days. After the window expires the product re-locks.

create table if not exists public.product_unlocks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  product_key text not null,                       -- listing item_id (fallback: keyword)
  scope       text not null,                       -- 'full' | 'tab:listing' | 'tab:analisa' | 'tab:kompetitor' | 'tab:keyword' | 'tab:tren' | 'calc'
  unlocked_at timestamptz not null default now(),
  expires_at  timestamptz not null,
  unique (user_id, product_key, scope)
);

create index if not exists product_unlocks_user_key_idx on public.product_unlocks(user_id, product_key);

alter table public.product_unlocks enable row level security;

drop policy if exists "own unlocks select" on public.product_unlocks;
create policy "own unlocks select" on public.product_unlocks
  for select using (auth.uid() = user_id);
-- inserts/updates happen only through the SECURITY DEFINER RPC below.

-- Active (non-expired) unlock scopes for a product, for the calling user.
create or replace function public.get_product_unlocks(p_product_key text)
returns table(scope text, expires_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select scope, expires_at
  from public.product_unlocks
  where user_id = auth.uid()
    and product_key = p_product_key
    and expires_at > now();
$$;

revoke all on function public.get_product_unlocks(text) from public;
grant execute on function public.get_product_unlocks(text) to authenticated;

-- Atomically spend credits and record a time-limited unlock. Idempotent: if the
-- requested scope (or a covering 'full' unlock) is already active it returns the
-- current state without charging again. Raises 'insufficient_credits' on shortfall.
create or replace function public.unlock_product(
  p_product_key text,
  p_scope text,
  p_amount integer,
  p_days integer default 7
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_expires timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  -- Already covered (this scope or a 'full' unlock) and not expired → no charge.
  select expires_at into v_expires
  from public.product_unlocks
  where user_id = auth.uid()
    and product_key = p_product_key
    and (scope = p_scope or scope = 'full')
    and expires_at > now()
  order by (scope = 'full') desc, expires_at desc
  limit 1;

  if v_expires is not null then
    select balance into v_balance from public.user_credits where user_id = auth.uid();
    return json_build_object('balance', coalesce(v_balance, 0), 'expires_at', v_expires, 'charged', 0);
  end if;

  select balance into v_balance from public.user_credits where user_id = auth.uid();
  if v_balance is null or v_balance < p_amount then
    raise exception 'insufficient_credits';
  end if;

  update public.user_credits
     set balance     = balance - p_amount,
         spent_total = spent_total + p_amount,
         updated_at  = now()
   where user_id = auth.uid()
   returning balance into v_balance;

  insert into public.credit_events (user_id, type, amount, keyword)
  values (auth.uid(), 'spend_unlock', -p_amount, p_product_key || ' · ' || p_scope);

  v_expires := now() + make_interval(days => greatest(1, p_days));
  insert into public.product_unlocks (user_id, product_key, scope, unlocked_at, expires_at)
  values (auth.uid(), p_product_key, p_scope, now(), v_expires)
  on conflict (user_id, product_key, scope) do update
    set unlocked_at = now(), expires_at = excluded.expires_at;

  return json_build_object('balance', v_balance, 'expires_at', v_expires, 'charged', p_amount);
end;
$$;

revoke all on function public.unlock_product(text, text, integer, integer) from public;
grant execute on function public.unlock_product(text, text, integer, integer) to authenticated;
