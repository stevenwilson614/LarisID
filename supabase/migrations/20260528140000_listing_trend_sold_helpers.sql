-- Helpers for weekly trend / omset: Shopee stores display-bucket floors in total_sold
-- (e.g. 100000 = "100rb+", 500000 = "500rb+"). Deltas must use reviews when sold is flat.

create or replace function public.shopee_sold_is_display_bucket(p_sold bigint)
returns boolean
language sql immutable
as $$
  select coalesce(p_sold, 0) >= 10000;
$$;

-- Minimum plausible unit count for a listing with this many reviews (guards 500rb+ parse floors).
create or replace function public.shopee_sold_bucket_floor_units(p_sold bigint)
returns bigint
language sql immutable
as $$
  select case
    when coalesce(p_sold, 0) < 10000 then greatest(coalesce(p_sold, 0), 0)
    when p_sold >= 1000000 then 1000000
    when p_sold >= 100000 then (p_sold / 1000)::bigint
    else 10000
  end;
$$;

comment on function public.shopee_sold_is_display_bucket(bigint) is
  'True when total_sold is at or above Shopee 10k+ display bucket (not exact unit count).';

comment on function public.shopee_sold_bucket_floor_units(bigint) is
  'Maps stored bucket codes (100000=100rb+) to a floor unit count for analytics.';

-- Interval unit delta for trend charts: prefer review growth when sold bucket unchanged.
create or replace function public.listing_interval_unit_delta(
  p_sold0 bigint,
  p_sold1 bigint,
  p_rev0 bigint,
  p_rev1 bigint,
  p_category text default null
)
returns bigint
language plpgsql immutable
as $$
declare
  mult numeric := 3.20;
  raw_delta bigint;
  rev_delta bigint;
  review_est bigint;
begin
  mult := case coalesce(p_category, '')
    when 'Rumah' then 2.94 when 'Fashion' then 2.77 when 'Dapur' then 3.41
    when 'Kamar Mandi' then 4.21 when 'Keamanan' then 3.40 when 'Kecantikan' then 2.70
    when 'Motor & Mobil' then 2.96 when 'Elektronik' then 3.10 when 'HP & Gadget' then 3.40
    when 'Hewan Peliharaan' then 3.95 when 'Sepeda' then 2.58 when 'Taman' then 3.50
    when 'Olahraga' then 2.68 when 'Bayi & Anak' then 4.12 when 'Hobi & Kerajinan' then 2.48
    when 'Kesehatan' then 2.38 when 'Tanaman' then 3.63 when 'Alat Tulis' then 2.87
    when 'Outdoor & Camping' then 2.67
    else 3.20
  end;

  raw_delta := greatest(coalesce(p_sold1, 0) - coalesce(p_sold0, 0), 0);
  rev_delta := greatest(coalesce(p_rev1, 0) - coalesce(p_rev0, 0), 0);
  review_est := round(rev_delta * mult)::bigint;

  if coalesce(p_sold0, 0) < 10000 and coalesce(p_sold1, 0) >= 10000 then
    return review_est;
  end if;

  if raw_delta = 0 and rev_delta > 0 then
    return review_est;
  end if;

  if raw_delta > 0 and review_est > 0 and raw_delta > review_est * 5 then
    return review_est;
  end if;

  return raw_delta;
end;
$$;

revoke all on function public.listing_interval_unit_delta(bigint, bigint, bigint, bigint, text) from public;
grant execute on function public.listing_interval_unit_delta(bigint, bigint, bigint, bigint, text) to authenticated, anon;
