# Journey funnel — QA (live gpt-app)

Use this before changing Beranda, onboarding, Cari Produk, Deep Dive, or Pantauan nudges. The old arm-A checklist (`nuOnb*`, Discover lobby, `#dd-beginner-panel`) is retired.

## Must pass

1. First login: 3-step finder on Beranda (`#home-finder`). No blocking popup.
2. After complete: prefs drawer / profile nudge can edit city, category, experience.
3. Search a product (e.g. kursi lipat camping) → Deep Dive opens.
4. First Deep Dive: Pantauan pulse/nudge appears; tracking a keyword stops it forever for that user.
5. If the profile has WhatsApp, the first track prefers “Kabari di WhatsApp”.
6. Return visit: no fabricated price/sales deltas. Omset chips say terukur or perkiraan.
7. Leaders / platform admins are not gated.
8. Mobile: finder and Deep Dive usable at 390px width.

If a check mentions `laris-app.js` or `larisid_journey_v1`, the doc is stale — update this file instead of the code.
