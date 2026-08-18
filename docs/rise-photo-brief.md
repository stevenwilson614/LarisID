# LARIS RISE — photo brief

What to shoot for each placeholder on `/rise/`. Replacing an image is a one-line
`src` swap; the `data-rise-slot` attribute on each `<img>` names the slot.

**Three slots are live today** (hero, product, community). Two more are built and
unused (participant, mentor) — drop them in when the page needs more human proof.

---

## The rule that governs all of them

The page argues that an ordinary young person with a phone can start a real
business. Photography either proves that or quietly contradicts it.

**Shoot real people in real rooms.** Not models, not a rented co-working space,
not a laptop on a white desk. The whole emotional claim of the page is "you don't
need to have it figured out" — a polished startup photo says the opposite before
anyone reads a word.

**Avoid, every time:**
- Western stock photography, or anything that looks licensed
- Money on camera — cash fans, rupiah stacks, wallets. It reframes the program as
  get-rich and collides with MISSION's line against promising income.
- Staged "success" — arms raised, high-fives, pointing at a laptop, thumbs up
- Anyone who looks like a trainer lecturing a room
- Heavy filters or teal-orange grading. Natural warmth only; it has to sit beside
  `--krem #F5EFE0` and `--merah #B5202A` without fighting them.

**Consent:** get written permission for every recognisable face, especially for
participants under 18. Keep the releases with the assets.

---

## `HERO_IMAGE_PLACEHOLDER` — 4:5 portrait, 1080×1350

The first thing anyone sees, arriving from Instagram or a WhatsApp link.

**Shoot:** one young Indonesian, 18–25, mid-task in their actual selling life —
phoning a buyer, photographing a product on a bedsheet, taping a parcel, checking
an order on a cracked phone screen. Home or warung interior. Daylight from a
window.

**Framing:** waist-up or closer, subject slightly off-centre, room for the eye to
rest. They are *working*, not posing — looking at the task, not the lens.

**The feeling to hit:** early, unglamorous, in motion. If it looks like the first
week rather than the finish line, it's right.

**Avoid:** a tidy desk. Mess is credibility here.

---

## `LARIS_PRODUCT_SCREENSHOT_PLACEHOLDER` — tall 1:2, 900×1800

Sits under "LARIS — TEKNOLOGINYA", so it should read as the actual product.

**Use a real screenshot** of the Laris app on a phone — Discover or a Deep Dive
with genuine data on screen. Phone held in hand at a slight angle beats a flat
mockup frame; a hand makes it a tool someone uses rather than a UI rendering.

**Two cautions:**
- Blur or swap any real shop name, seller name, or user detail before publishing.
- Shopee product thumbnails inside the screenshot are someone else's imagery —
  prefer a screen showing aggregate data (trends, price distribution, category
  view) over one that's a grid of other sellers' product photos.

---

## `COMMUNITY_IMAGE_PLACEHOLDER` — 16:10 landscape, 1600×1000

Sits under "LARIS RISE — ORANG, PENDIDIKAN, GERAKAN". This is the one that has to
carry *movement* rather than *course*.

**Shoot:** several participants together and genuinely engaged — crowded around
one phone, laughing at something on a screen, packing orders side by side, or a
screenshot-style grid of a live video mentoring session with everyone's tiles
visible. A real WhatsApp-era study group, not a classroom.

**Framing:** wide, several faces, nobody at the front of a room. Eye level.

**The feeling to hit:** peers, not students.

---

## `PARTICIPANT_IMAGE_PLACEHOLDER` — 4:5 portrait, 1080×1350 *(built, not yet placed)*

For when there are graduates with real outcomes. One person, environmental
portrait, in the space where they work — stall, kitchen, front room, motorbike
loaded with parcels.

Pair each with a plain-spoken caption: what they sell, what changed, how long it
took. **State outcomes only where they're true and verifiable** — MISSION forbids
implying income results, so "sekarang kirim 40 paket seminggu" is fine and
"sekarang penghasilannya Rp X juta" needs to be real, permitted, and typical or
labelled as not typical.

---

## `MENTOR_IMAGE_PLACEHOLDER` — square, 1080×1080 *(built, not yet placed)*

For Afryian, Hendra, and the other local mentors. Relaxed environmental portrait,
warm and direct, shot at the subject's eye level so they read as an approachable
older sibling rather than an instructor. Plain background, natural light.

Local voice is a stated non-negotiable in MISSION — these faces are the proof of
it, so shoot the actual mentors rather than substituting anyone.

---

## Handover format

Deliver full-resolution originals plus 2x web crops at the sizes above. Convert to
WebP before committing (the repo is WebP throughout) and keep the explicit
`width`/`height` attributes on every `<img>` — the last landing rebuild shipped a
0.39 CLS because images reserved no height.
