# Steven auto-reply

Casual replies in Steven’s chat card (`user_notices.kind = steven_followup`) after someone sends feedback. About four seconds after the row is saved, then the model writes. The person sees it on the next look at the chat (the app also checks once a few seconds after they send).

This does **not** ship product UI. A missing feature that might help everyone becomes a staff email (“ship?”) plus a question back. Ads complaints get a short ack, not a build.

## What runs

| Piece | Where |
|---|---|
| Function | `supabase/functions/steven-auto-reply` |
| Lookup | `steven_auto_reply_research(text[], boolean)` — service role only |
| Stamp | `feedback.auto_replied_at` |
| Trigger | `on_feedback_insert_steven_reply` via `bash scripts/install-steven-auto-reply-trigger.sh` |

Deploy:

```bash
bash scripts/apply-selfhost.sh supabase/migrations/20261104193000_steven_auto_reply.sql
bash scripts/deploy-function-selfhost.sh steven-auto-reply
bash scripts/install-steven-auto-reply-trigger.sh
```

DeepSeek is `deepseek-v4-pro` (same key as `analyze-feedback`). `analyze-feedback` still only writes admin notes.

## Skip

- No `user_id` (anon)
- Blank message
- `stevenwilson614@gmail.com`
- Superuser chip the client already routes: bingung/pusing, API, “kurang lengkap”
- This `feedback.id` already has `auto_replied_at`
- An open bot notice (`payload.source = steven_auto_reply`) unless this row is `page = steven_followup` (next turn replaces that notice)

## Intents

| Intent | Bot does |
|---|---|
| product_research / trending | Exact keyword on `mv_keyword_weekly` / `listings`. Appends up to two real names and prices. Omset stays perkiraan. If nothing matches and the draft asked to queue, inserts `scrape_keywords` (`source_set = request`, 1-day SLA) and points at the closest keyword. |
| affiliate_tiktok | Kalodata only (`https://www.kalodata.com/`). No invented commission. |
| api | CTA opens the API page. |
| confused | CTA opens Belajar. |
| ads_complaint | Short ack. May ask once if they’d pay for no ads. |
| feature_ask | Asks what they need. Emails Steven. No code. |
| data_gap | Asks what detail is missing. Emails Steven only when the draft marks it useful for everyone. |
| thanks_soft | Thanks. |
| unclear | One question. |

Prices in the reply come from the database append, not from the model. Listings must match the keyword and a name token so a polluted row cannot be offered as the product.
