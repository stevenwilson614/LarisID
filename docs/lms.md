# LMS

Two URLs, one product:

| URL | Role |
| --- | --- |
| [`https://larisid.com/lms/`](https://larisid.com/lms/) | Mentor **landing + signup/login** (Contabo marketing shell in `lms/`) |
| [`https://larisid.com/obrolan.marketing/`](https://larisid.com/obrolan.marketing/) | Mentor **class app** (left-rail UI: Dashboard, Students, Kurikulum, Otomasi, …) |
| [`https://larisid.com/s/{slug}/`](https://larisid.com/s/test-1/) | Student (and mentor school) class app |

After Contabo login/daftar succeeds, the browser is sent into the left-rail class app (`/obrolan.marketing/` for mentors, `/s/{org_slug}/` for students). Do not show the Contabo sidebar “Kelas / Edit kurikulum” shell as the live class UI.

Class app source: `obrolan.marketing/`. Contabo `anton-school` serves `/obrolan.marketing/api/*` and `/api/*` from disk (`docker/volumes/anton-school`).

```bash
bash scripts/deploy-static.sh
```

Do not revive `js/lms-join.js` or public invite-code file downloads as the share model.

---

## Contabo landing + auth (`/lms`)

Marketing landing, Google/email auth, and “Buat kelas” live in `lms/index.html` + `lms/js/*`. Session key: `lms_auth_v1` (not `sb-*-auth-token`).

`/lms/{org_slug}/` stays a Contabo gate for invite/return links (rewritten to `lms/index.html`). Prefer sharing `/s/{slug}/` for the live class once the student is in.

Invite preview card: `/lms/card/?invite=…` → `lms-invite-card`.

Belajar and LarisRise are separate products — do not fold them into this app.

### Postgres schema (auth LMS)

Tables: `lms_accounts`, `lms_invites`, `lms_modules`, `lms_lessons`, `lms_materials`, `lms_sessions`.

```bash
bash scripts/apply-selfhost.sh supabase/migrations/20261029120000_lms_schools.sql
```

Never `supabase db push --linked`.
