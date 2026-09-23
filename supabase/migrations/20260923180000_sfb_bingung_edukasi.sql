-- People who already sent the "Bingung cara pakainya" chip and have no open
-- Steven chat get one follow-up: tab Edukasi + daftar bimbingan mentor.
-- Someone with an undismissed steven_followup already has a reply waiting,
-- so they are left alone. Re-running will not stack a second edukasi invite.

insert into public.user_notices (user_id, kind, payload)
select distinct f.user_id, 'steven_followup', jsonb_build_object(
  'lead', 'Hai! Kamu bilang masih bingung cara pakainya. Buka tab Edukasi di menu kiri, lalu daftar bimbingan mentor di situ ya.',
  'go', 'edukasi',
  'cta', 'Buka tab Edukasi'
)
from public.feedback f
where f.page = 'superuser_prompt'
  and f.user_id is not null
  and (
    f.element_context->>'chip' = 'Bingung cara pakainya'
    or f.message ilike '%masih bingung%'
  )
  and not exists (
    select 1 from public.user_notices n
     where n.user_id = f.user_id
       and n.kind = 'steven_followup'
       and n.dismissed_at is null
  )
  and not exists (
    select 1 from public.user_notices n
     where n.user_id = f.user_id
       and n.kind = 'steven_followup'
       and n.payload->>'go' = 'edukasi'
  );
