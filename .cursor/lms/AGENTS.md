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
- Staging (separate disk): `bash scripts/deploy-static-stage.sh` and `bash scripts/deploy-school-api-stage.sh` → `https://stage.larisid.com`. Do not copy production `{slug}.json` or media into the stage volume. `main` CI does not deploy staging.
- A left-rail tab is UI-only. Kurikulum on disk stays `weeks` + `lectures` + `kurikulum` meta.
- Platform Admin left-rail tab is email allow-list only (`stevenwilson614@gmail.com` / `LMS_PLATFORM_ADMIN_EMAILS`). Do not expose mentor/student totals to other coaches.
- School JSON: `state/{slug}.json.bak.1` (newest) through `.bak.5`. Copy a bak over `{slug}.json` to restore; no API restart.
- Belajar and LarisRise stay separate.
