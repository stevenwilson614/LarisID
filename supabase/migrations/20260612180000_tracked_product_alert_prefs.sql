-- Alert channel preferences for tracked products (email / WhatsApp / competitor scope).
alter table public.user_tracked_products
  add column if not exists alert_prefs jsonb not null default '{"email":true,"whatsapp":false,"competitors":true,"triggers":["price","keywords","sales_5pct"]}'::jsonb;
