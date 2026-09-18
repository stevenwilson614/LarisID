-- In-app Steven chat reply: Faber-Castell / alat tulis coverage question.
-- Opens #sfb-card for the user with payload.lead (kind=steven_followup).

insert into public.user_notices (user_id, kind, payload)
select u.id, 'steven_followup', jsonb_build_object(
  'lead',
  'Halo! Bisa — data alat tulis kami lengkap. Kalau diunduh, bisa dilihat riwayat sampai 12 minggu.'
)
from auth.users u
where u.email = 'onlinestore.fabercastell@gmail.com'
  and not exists (
    select 1 from public.user_notices n
     where n.user_id = u.id
       and n.kind = 'steven_followup'
       and n.dismissed_at is null
       and n.payload->>'lead' like '%alat tulis%'
  );

update public.feedback
   set status = 'done'
 where id = '86ecae5d-86ee-4797-9b3a-2dd43a58ed18'
   and status = 'new';
