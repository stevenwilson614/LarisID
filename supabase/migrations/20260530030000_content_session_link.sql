-- WS-C: link milestone_content items to a class session and flag pre-class required viewing.
-- Embed-only video (YouTube / Google Drive / Vimeo) is handled client-side; no schema change needed for that.
-- RLS on milestone_content (read by cohort members, write by cohort mentor) already governs these
-- columns via milestone ownership; this migration only adds columns + an index, never weakening policies.

-- ── Optional link from a content item to a class session ──────────────────────
alter table public.milestone_content
  add column if not exists session_id uuid references public.cohort_sessions(id) on delete set null;

-- ── "Wajib ditonton sebelum kelas" flag ───────────────────────────────────────
alter table public.milestone_content
  add column if not exists required_before boolean not null default false;

-- ── Index for per-session lookups (student pre-class checklist) ────────────────
create index if not exists idx_mc_session on public.milestone_content (session_id);
