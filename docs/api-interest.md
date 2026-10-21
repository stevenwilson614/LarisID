# API interest

The public API is **not live**. Tentang → **API** (`#btn-api`, `#view-api`) only records whether someone wants one. It does not promise a date or a price.

Do not add API claims to `llms.txt`, the sitemap, or marketing pages until a real public API ships.

## What we ask

Someone who is not signed in cannot dismiss the login modal from this page. The survey does not open until they are in.

Before Ya / Tidak, if anything is missing:

- **WhatsApp** — required. An Indonesian number is saved on the profile.
- **Kota** — required, from the same city list as onboarding.
- **Toko** — required only when we do not already know: Sudah punya toko / Belum punya toko. A saved `seller_status` or Shopee store name is reused.

Then:

1. **Tertarik pakai API LarisID?** Ya / Tidak. Nanti saja closes without saving.
2. **Ya** — multi-select platform and what they want, plus an optional note. Name is asked only when the profile does not already have one.
3. **Tidak** — one optional reason, then save.

A yes emails `stevenwilson614@gmail.com` once (`notify-api-interest`, `api_interests.notified_at`). A no does not.

If they already submitted, the modal shows the done state instead of asking again.

## Honesty rules

- No sample price. LarisID stays free; an API price that does not exist would be misleading.
- No available date. Done copy: API publik belum dibuka, belum ada jadwal, we will contact them if it opens.
- A “Tidak” is stored too, so curiosity is not counted as demand.

## Stored values

Table `public.api_interests` (one row per user). Writes only through `api_submit_interest()`. Reads: `api_interest_mine()` (own row), `api_interests_list()` (platform admin).

| Field | Allowed values |
|---|---|
| `platforms` | `sheets` Google Sheets / Excel · `app` App sendiri · `bot` Bot WhatsApp / Telegram · `zapier` Zapier / Make · `warehouse` Database / warehouse · `other` Lainnya |
| `use_cases` | `search` Cari keyword / listing · `omset` Omset & tren · `deepdive` Deep Dive · `alert` Alert otomatis · `export` Export bulk · `other` Lainnya |
| `decline_reason` | `curious` Cuma penasaran · `ui_enough` Pakai UI cukup · `too_hard` Takut ribet |
| `other_note` | Optional free text, max 240 characters |

A submit requires WhatsApp and a city. A yes also requires at least one platform or one use case, plus a name (profile values count).

Admin → **Minat API** lists every answer and, for people who said yes, groups them by kota, toko, and platform.

## Where it lives

- Page and modal: [index.html](../index.html) (`#view-api`, `#api-interest-capture`)
- Behavior: [js/gpt-app.js](../js/gpt-app.js)
- Admin: dashboard section **Minat API**
- Migration: [supabase/migrations/20261021110000_api_interests.sql](../supabase/migrations/20261021110000_api_interests.sql) and [supabase/migrations/20261021120000_api_interest_gate.sql](../supabase/migrations/20261021120000_api_interest_gate.sql)
- Email: [supabase/functions/notify-api-interest/index.ts](../supabase/functions/notify-api-interest/index.ts)

Apply on Contabo with `bash scripts/apply-selfhost.sh`. Deploy the mail function with `bash scripts/deploy-function-selfhost.sh notify-api-interest`. Never `supabase db push`.

Events: `api_page_view`, `api_interest_shown`, `api_interest` (`yes` / `no`). Platform-admin sessions are not counted as page views.
