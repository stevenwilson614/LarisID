# LarisID Learning Platform — Research & Recommendations

_Last updated: May 2026. Internal strategy doc. Read alongside [MISSION.md](../MISSION.md)._

LarisID is part tool, part school for Indonesian Shopee sellers. The "school" runs as
**kohorts** (cohorts) led by a mentor/teacher, with a curriculum, a class calendar
(kalender), community feed, and gamified progress. This doc benchmarks mainstream
learning platforms, maps each capability to what LarisID already has, and recommends a
prioritized roadmap tuned to our market: **the island of Java / Indonesia** —
mobile-first, Android-dominant, low-bandwidth, data-cost sensitive, WhatsApp-native.

---

## 1. The platforms we looked at

- **Google Classroom** — zero-friction assignments + Google Workspace (Docs/Drive/Meet). Simple; weak gradebook/assessment depth.
- **Canvas** — polished higher-ed LMS: SpeedGrader, Mastery Paths, quizzes, analytics.
- **Moodle** — open-source, infinitely customizable, plugin ecosystem, self-hosted. Heavy to operate.
- **Skool** — community-first, gamified (points, levels, leaderboards) with simple courses gated by engagement.
- **Circle** — community with organized "Spaces," automations, light courses, gamification (added 2025).
- **Kajabi / Maven** — all-in-one creator/cohort businesses: drip + content-locking, live sessions, certificates, marketing.
- **Ruangguru** (Indonesia, 40M+ users) — mobile-first K-12; proprietary video compression, **downloadable/offline content** (and USB "On-The-Go"), **WhatsApp** help (Roboguru), strong in tier-2/3 cities across Java.

---

## 2. Feature benchmark

Legend: ✅ strong · 🟡 partial/basic · ⬜ absent

| Capability | G.Classroom | Canvas | Moodle | Skool/Circle | Kajabi/Maven | Ruangguru | **LarisID today** |
|---|---|---|---|---|---|---|---|
| Assignments: submit + teacher feedback | ✅ | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ⬜ |
| Pre-class content gating (watch/read first) | 🟡 | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ (`milestone_content` + auto-complete) |
| Class calendar | ✅ | ✅ | 🟡 | 🟡 | 🟡 | n/a | ✅ (`cohort_sessions`, date-only) |
| **Google Calendar sync** | ✅ | ✅ | 🟡 | 🟡 | 🟡 | n/a | ⬜ |
| Reminders/notifications | email | email/push | email | in-app | email | push/**WhatsApp** | 🟡 (WhatsApp infra exists) |
| Gamification (points/leaderboard/levels) | ⬜ | 🟡 | plugin | ✅ | ✅ | ✅ | ✅ (leaderboard, milestones) |
| Community/discussion | 🟡 | 🟡 | 🟡 | ✅ | ✅ | 🟡 | ✅ (feed, announcements) |
| Quizzes/assessments | 🟡 (Forms) | ✅ | ✅ | ⬜ | ✅ | ✅ | ⬜ |
| Certificates / badges | ⬜ | ✅ | ✅ | ⬜ | ✅ | ✅ | ⬜ (branding "badge" only) |
| Document sharing/upload | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | 🟡 (URL links only) |
| Offline / low-bandwidth | ⬜ | app | app | app | app offline | ✅ | ⬜ |

---

## 3. Gap analysis vs. existing LarisID schema

Already strong (do not rebuild):

- **Cohorts & roles** — `cohorts`, `cohort_members`, admin/leader/student RPCs, branding, leaderboard, feed, announcements.
- **Curriculum** — `milestones` with `track` (soft_skill / business_skill / general), `due_at`.
- **Pre-class content** — `milestone_content` (video/document/text) + `user_content_progress` + `complete_content_item()` auto-completes a milestone when all items are done. This is the "watch a video / read a doc before class to tick the checklist" feature, already shipped.
- **Class calendar** — `cohort_sessions` (date, notes, linked milestones, document URLs) rendered by `cohortPlannerRender` / `_plannerDrawCal` in `index.html`, with editor + bulk import.
- **Messaging infra** — WhatsApp OTP + broadcast edge functions; Google OAuth login.

Clear gaps (the roadmap below):

- Calendar does **not** connect to Google Calendar; sessions have **no time** (date-only).
- No **reminders** tied to sessions.
- Documents are **links only** — no upload so all students see the day's file.
- Content isn't tied to a specific class as "required before this session."
- No **badges/achievements** data model; no **teacher certificates**.
- No **assignment submission + feedback** loop; no quizzes.

---

## 4. Strategic recommendation

**Lean into the Skool model, not Canvas/Moodle.** LarisID's edge is a gamified cohort
community wrapped around real seller tools (Discover, Deep Dive, Kalkulator, Rencana
Bisnis). Chasing full-LMS breadth (advanced quiz engines, SIS integration, SpeedGrader)
would be off-mission and over-built for our audience.

**Win where global platforms are weak in Indonesia:**

1. **Google Calendar connection** for the class kalender (explicitly requested).
2. **WhatsApp reminders** for sessions and pre-class content — reuse existing WhatsApp functions. This is a genuine differentiator; most LMSs only email.
3. **Low-data content** — embed video (YouTube/Drive) lazily rather than self-host; never force heavy downloads. Mirror Ruangguru's "respect the data plan" instinct.
4. **Recognition that motivates** — automatic LarisID badges for real progress + teacher-issued class certificates, building on the existing leaderboard/gamification.

**MISSION alignment:** every feature must keep access frictionless (no logins/paywalls
that lock people out), avoid dark patterns, and present progress honestly. Certificates
and badges must reflect genuine achievement, never manufactured scarcity.

---

## 5. Prioritized roadmap (mapped to build workstreams)

**P0 — Google Calendar sync (WS-A).** Add session times (`Asia/Jakarta`), a subscribable
ICS feed per cohort, and per-event "Tambah ke Google Calendar" links. One-way, no Google
token storage — works for every student on Android. _Teacher + student value: the class
schedule lives in the calendar they already check daily._

**P1 — Class-day document upload (WS-B).** Real file upload to a `cohort-docs` Storage
bucket so all members see the day's document. _Removes the "where's the file?" friction
before class._

**P1 — Pre-class embedded video (WS-C).** Link `milestone_content` to a session as "wajib
sebelum kelas," with lazy-loaded YouTube/Drive players and watched-status via the existing
completion RPC. _Flips the classroom: students arrive prepared._

**P1 — WhatsApp session reminders (future WS).** Scheduled reminder N hours before a
session and for unfinished pre-class content. _Highest-leverage, Indonesia-native; reuses
WhatsApp infra._

**P2 — Badges + certificates (WS-D).** (a) Automatic LarisID badges on real events (first
product lookup, first deep dive, first sale) off `activity_events`; (b) teacher-issued
class certificates with a printable view. _Recognition that drives retention and pride._

**P2 — Easier assignments (WS-E).** Assignment authoring + student submission (text/link/
file) + leader feedback inbox. _Closes the teach → do → feedback loop._

**P3 — Low-data & offline polish.** Quality-aware embeds, PWA install, cache last-viewed
content. _Directly serves tier-2/3 Java users on tight data plans._

---

## 6. Explicitly out of scope (for now)

- Self-hosted video streaming (cost + bandwidth; embed instead).
- Full quiz/assessment engine and SIS-style gradebooks (over-built for our audience).
- Two-way Google Calendar write-back via stored OAuth refresh tokens (token-storage
  complexity; revisit only if leaders demand editing LarisID events from Google).
