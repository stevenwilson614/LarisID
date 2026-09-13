-- Retire the extension pairing oracle.
--
-- redeem_extension_code(text) is anon-executable, SECURITY DEFINER with no
-- pinned search_path, and returns a live access AND refresh token for an
-- 8-hex-character guess. Codes were never cleared after use. Verified live:
--   has_function_privilege('anon', ..., 'EXECUTE') = true
--   prosecdef = true, proconfig = NONE
--
-- Exposure was always small -- extension_codes holds 3 rows ever, all expired
-- (May/Jun 2026) -- but there is no reason to keep an unrate-limited token
-- exfiltration endpoint alive for a feature nothing can reach. Extension v3.0
-- needs no account: anon already has select on listings_deduped and
-- mv_listing_momentum, and the omset surface reads through ext_omset_batch().
--
-- Also note create_extension_code() deleted every prior row for the user on
-- each generate, including the used=true row _dive_limit() checks -- so
-- regenerating a code silently revoked the user's own +3 searches/day. The
-- feature was self-destructing.
--
-- WHAT THIS DOES NOT DO. It does not drop the functions, does not touch
-- _dive_limit(), and does not delete any extension_codes row. The tokens are
-- nulled in place instead, so the one used=true row still satisfies
-- _dive_limit()'s exists() check and that user keeps their bonus.

begin;

-- `from public` FIRST, and it is the part that actually matters: Postgres grants
-- EXECUTE on a new function to PUBLIC by default, and anon inherits that, so
-- revoking from anon alone leaves has_function_privilege('anon', ...) = true.
-- Verified: the anon-only revoke changed nothing.
revoke execute on function public.redeem_extension_code(text) from public, anon, authenticated;
revoke execute on function public.create_extension_code(text, text) from public, anon, authenticated;
grant  execute on function public.redeem_extension_code(text) to service_role;
grant  execute on function public.create_extension_code(text, text) to service_role;

-- Strip the stored credentials. A Supabase refresh token does not expire on its
-- own, so expires_at being in the past says nothing about whether these are
-- still redeemable.
--
-- Overwritten with a sentinel rather than nulled: access_token is NOT NULL, and
-- writing a sentinel is a smaller change than dropping a constraint on a table
-- that is now read-only in practice.
update public.extension_codes
   set access_token  = 'retired',
       refresh_token = 'retired'
 where access_token <> 'retired'
    or refresh_token is distinct from 'retired';

comment on function public.redeem_extension_code(text) is
  'RETIRED 2026-09-13. Extension v3.0 needs no pairing; anon reads cover the '
  'whole omset surface. Left in place only because _dive_limit() still honours '
  'historical used=true rows. Not executable by anon or authenticated.';

notify pgrst, 'reload schema';
commit;
