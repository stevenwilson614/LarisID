-- In-app Steven chat: ask muhamadafiq2410 what feature they want.
-- Their reply was cut off at "Ada fitur yang belum ada:"

insert into public.user_notices (user_id, kind, payload)
select u.id, 'steven_followup', jsonb_build_object(
  'lead',
  'Hai! Makasih sudah jawab. Kamu bilang ada fitur yang belum ada — fitur apa yang lagi kamu cari? Ceritain di sini ya.'
)
from auth.users u
where u.email = 'muhamadafiq2410@gmail.com'
  and not exists (
    select 1 from public.user_notices n
     where n.user_id = u.id
       and n.kind = 'steven_followup'
       and n.dismissed_at is null
       and n.payload->>'lead' like '%fitur yang belum ada%'
  );

update public.feedback
   set status = 'reviewing'
 where id = '647cdb26-3ec6-44a7-9a57-67ea3ebf2ace'
   and status = 'new';
