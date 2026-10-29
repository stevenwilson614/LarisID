# LMS — agent instructions

Before changing LMS landing, auth, class UI, school API, or `lms_*` schema, read **[docs/lms.md](../../docs/lms.md)**.

## Naming

- Say **LMS**. Entry is **https://larisid.com/lms/**.
- Do not call the product Anton’s app, Anton’s school, or Obrolan Marketing.
- Path and service names (`obrolan.marketing/`, `anton-school`) stay as-is for deploy and code references.

## Surfaces

- **Landing / signup:** `/lms/` — Contabo marketing + auth in `lms/`
- **Live class:** left-rail app at `/s/{slug}/` (students and mentors). Source: `obrolan.marketing/`. Disk state via Contabo `anton-school`.
- After Contabo login, send mentors into that left-rail class UI. Do not use the Contabo “Kelas / Edit kurikulum” shell as the live class UI.
- Do not dump new mentors into `/s/obrolan.marketing`.

## Hard rules

- Do not reintroduce invite-code raw file URLs (`?k=` on media) as a public share pattern.
- Disk is class source of truth (kurikulum, roster, video). Postgres `lms_*` is auth, org name, and slug.
- SQL on Contabo: `bash scripts/apply-selfhost.sh supabase/migrations/…` — never `supabase db push --linked`.
- Static + class UI: `bash scripts/deploy-static.sh`. Class API: `bash scripts/deploy-school-api.sh`.
- Belajar and LarisRise stay separate.
