# AI Chat Decision — do we need a standalone chatbot?

_Research note. Author: AI research agent. Date: 2026-05-30. No application code was changed._

> **SUPERSEDED — kept for the reasoning, not the facts.** Everything below describes the
> May 2026 build and is no longer true of the product:
>
> - **AI is unlimited.** The credit model is dead (retired Jul 2026) and the daily AI cap was
>   removed by migration `20260817120000`. The live `use_ai` RPC always returns
>   `allowed: true, unlimited: true, ai_limit: null` — it only records usage. `claude-proxy`
>   enforces no per-day cap either. There is no `MLS_AI_PER_CREDIT`, no `spend_credit` on the
>   AI path, and no "10 requests/day" in the edge function.
> - **Vendor:** Ask Laris calls **DeepSeek** (`deepseek-v4-pro`) via `claude-proxy`. The function name is historical.
> - **The recommendation was reversed.** LarisID is now chat-first: `js/gpt-app.js` is the live
>   bundle, Ask Laris is a full multi-turn thread, and the AI is a tool-using agent that reads
>   the database itself. The `index.html` line numbers cited below are long gone.
> - The only daily quota that still exists is on **starting a new product search**
>   (`gpt_new_chat`), not on asking questions.

**Product question:** "AI chat bot — do we need one, or is the AI assistance inside 'Mulai Berjualan' enough? Do people tend to ask a chat questions during a session?"

**Short answer:** Cut the standalone chatbot. It is currently orphaned dead code, and the data shows users barely touch even the working AI surface. The contextual quick-ask inside Mulai Berjualan is the right amount of AI for now.

---

## Current AI surfaces

There are **two** AI code paths in `index.html`, but only **one** is actually wired into the UI.

### 1. Quick-ask — `mlsAiAsk()` (LIVE, the one users see)
- **Markup:** `index.html` lines 7183–7196 — rendered inside the "Mulai Berjualan" deep-dive panel as the "Tanya AI tentang produk ini" box.
- **Function:** `index.html` lines 11787–11861.
- **Shape:** 4 preset chips (Peluang pasar, Strategi iklan, Cara bersaing, Harga optimal) + a free-text input. Single question → single answer, no message thread.
- **Context:** auto-injects rich product + market context (main product, keyword, median price, market turnover, top-10 competitors) into the system prompt. Constrained to "only analyze this product/keyword, don't make up data" — aligns with MISSION's honesty principle.
- **Routing:** server-side via the `claude-proxy` Supabase Edge Function (API key stays server-side); model defaults to `claude-haiku-4-5`. A user-supplied OpenAI key (`larisid_openai_key`) optionally routes to GPT-4o instead.
- **Credit gating:** every 10 prompts = 1 credit (`MLS_AI_PER_CREDIT = 10`), via `spend_credit` RPC. Admins/leaders exempt. Edge function also enforces 10 requests/day.
- **Logging:** on credit spend it writes `credit_events` (keyword `ai_mls`) and `cohortLogActivity('credit_spent', {action:'ai_mls'})` → `activity_events`.

### 2. Standalone chat — `mlsChatSend()` (ORPHANED / DEAD CODE)
- **Function:** `index.html` lines 19063–19138 (mirror: `dist/scripts/app.js` ~9232). Helpers `_mlsChatAppend`, `_mlsChatHistory`, API-key save/status handlers nearby.
- **Shape:** full multi-turn chat with rolling history (`_mlsChatHistory.slice(-10)`), typing indicator, message bubbles.
- **Critical finding:** the DOM elements it drives — `mls-chat-messages`, `mls-chat-input`, `mls-chat-send`, `mls-apikey-input(-row)` — **have no `id="..."` markup anywhere** in `index.html` or `dist/`. Nothing renders this chat, and nothing calls `mlsChatSend()`. It is unreachable.
- **Worse design even if reached:** requires the user to paste their **own Anthropic API key** (`localStorage 'larisid_anthropic_key'`), calls `api.anthropic.com` directly from the browser, is **NOT credit-gated**, and **logs no activity at all**. That contradicts the server-proxied, credit-fair model used everywhere else and would shut out any seller who doesn't have/can't afford an API key (a MISSION access concern).

---

## Usage findings from data

Snapshot from 2026-05-30 against the then-cloud project (now gone). Live DB is Contabo `https://api.larisid.com`. Relevant tables: `activity_events`, `credit_events`, `ai_usage`, `user_credits`.

| Signal | Number |
|---|---|
| Total `activity_events` ever | **24** (2 distinct users) |
| `activity_events` by type | `deepdive_open` = 22, `community_post` = 1, `milestone_complete` = 1 |
| `credit_spent` events in `activity_events` | **0** |
| `ai_mls` events in `activity_events` | **0** |
| `credit_events` with keyword `ai_mls` (quick-ask spends) | **1** spend, 1 user, all-time |
| `credit_events` other | `tracker` = 2 spends, grants = 3 |
| `ai_usage` table rows | **0** (never written to) |
| Date range of all activity | 2026-05-14 → 2026-05-29 |

**Interpretation:** This is effectively pre-launch / internal-testing traffic. The product has 1–2 active users and only **one** recorded AI quick-ask interaction in its entire history. There is **zero evidence** that users want to "chat" mid-session — the dominant behavior by far is opening deep dives (22 of 24 events). The standalone chat has produced no usage because it isn't rendered, and the working quick-ask is used sparingly.

**Caveat on data confidence:** sample size is tiny, so this reflects "no demand signal yet" rather than "proven no demand." `ai_usage` being empty also suggests the `claude-proxy` edge function may not be logging there (worth a separate check), so quick-ask volume could be slightly undercounted — but `credit_events` (the credit ledger) confirms only 1 lifetime `ai_mls` spend, which is hard to undercount.

### Qualitative source — Microsoft Clarity
Clarity is installed (project id `vykppujn5k`) with session recordings/heatmaps. It cannot be queried programmatically here. **Recommended manual review in the Clarity dashboard:** (1) heatmap clicks on the "Tanya AI" box and its 4 chips inside Mulai Berjualan — are chips or free-text used more? (2) session recordings filtered to deep-dive views — do users scroll to / dwell on the AI box, or ignore it? (3) any rage-clicks/dead-clicks near AI controls. This is the right way to confirm whether the contextual quick-ask earns its place before investing further in AI UX.

---

## Recommendation

1. **Do NOT build or ship a standalone AI chatbot.** No demand signal exists, and a general chat invites off-topic, hard-to-ground answers that risk "misleading AI certainty" (a MISSION non-negotiable).
2. **Remove the dead `mlsChatSend` chat code** (`mlsChatSend`, `_mlsChatAppend`, `_mlsChatHistory`, the `larisid_anthropic_key` BYO-key flow and related apikey handlers). It's unreachable, untested, unlogged, un-credit-gated, and its BYO-key model conflicts with LarisID's "for anyone and everyone" access principle. Cutting it reduces surface area and removes a latent way to bypass credit fairness.
3. **Keep and lean into the quick-ask** in Mulai Berjualan as the single AI surface. It is contextual, credit-fair, server-proxied, and honesty-constrained.
4. **Optionally upgrade quick-ask toward "light follow-up," not full chat:** if Clarity/usage later shows people asking a second related question, add a small "Tanya lanjutan" affordance that keeps the same product context for 1–2 follow-ups — still credit-gated, still product-scoped. This captures the genuine value of conversation (follow-ups) without a free-roaming chatbot.
5. **Re-evaluate after real launch traffic.** Revisit when there are, say, >50 distinct users and a meaningful number of `ai_mls` spends. Decide with data, not assumption.

---

## Rationale

- **Mission fit:** LarisID exists to give sellers *brilliant interpretations of trustworthy data* — not a generic assistant. The quick-ask is bolted to concrete product/market context and explicitly told not to invent data; a free chatbot drifts away from that grounding and toward exactly the "misleading AI certainty" MISSION warns against.
- **Access & fairness:** the standalone chat requires a personal Anthropic API key and skips credit gating. That advantages the few who can pay for keys and bypasses the equitable credit system — the opposite of "for anyone and everyone."
- **The data says wait:** with 24 lifetime activity events, 1 lifetime AI quick-ask spend, and 0 rows in `ai_usage`, there is no usage evidence that people chat mid-session. Building chat now would be gold-plating an unproven need and adding maintenance/cost the sellers don't benefit from.
- **Cost & focus:** Haiku calls and a second AI UI both cost money and engineering attention better spent on the data quality and deep-dive interpretation that users actually engage with (22 of 24 events).

**Bottom line:** the AI assistance inside Mulai Berjualan is enough for now. Remove the orphaned chatbot, sharpen the quick-ask, and let real usage decide if conversation is ever worth adding.
