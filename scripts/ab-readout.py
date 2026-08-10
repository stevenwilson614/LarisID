#!/usr/bin/env python3
"""A/B read-out for the LARISgpt split test.

CLOSED 2026-08-10: arm B won and became the whole product (it now serves
https://larisid.com/; arm A was deleted). This script is kept for reading the
historical experiment window only — post-cutover traffic carries no arm tag,
so anything after that date is not an arm and must not be read as one.

Decided between arm A (classic, /) and arm B (LARISgpt, /gpt/) — or, more
usefully, showed WHICH STEP each arm lost people at so features could be
ported between them rather than picking a whole-site winner.

Usage:
    python3 scripts/ab-readout.py                 # since the split launched
    python3 scripts/ab-readout.py ab_split_aug26  # one campaign only

Reads the live self-hosted DB. Service key comes from the infra repo's .env.
"""
import json
import os
import sys
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime

API = "https://api.larisid.com/rest/v1"
ENV = os.path.expanduser("~/larisid-infra/docker/.env")
# The split went live 2026-07-17; earlier signups have no ab_variant.
SPLIT_START = "2026-07-17"
# Ordered funnel. Steps 1-2 come from page_views / signup_attribution because
# activity_events RLS needs a self-owned row and those happen pre-signup.
STEPS = ["signup", "first_search", "first_dive", "second_dive", "return"]


def service_key():
    with open(ENV) as fh:
        for line in fh:
            if line.startswith("SERVICE_ROLE_KEY="):
                return line.split("=", 1)[1].strip()
    sys.exit(f"SERVICE_ROLE_KEY not found in {ENV}")


def fetch(key, path):
    """PostgREST caps pages at 1000 rows — paginate or the tail is silently lost."""
    out, offset = [], 0
    while True:
        sep = "&" if "?" in path else "?"
        req = urllib.request.Request(
            f"{API}/{path}{sep}offset={offset}&limit=1000",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
        )
        page = json.load(urllib.request.urlopen(req, timeout=90))
        out += page
        if len(page) < 1000:
            return out
        offset += 1000


def main():
    campaign = sys.argv[1] if len(sys.argv) > 1 else None
    key = service_key()

    attrs = fetch(key, f"activity_events?event_type=eq.signup_attribution"
                       f"&select=user_id,metadata,created_at&created_at=gte.{SPLIT_START}")
    events = fetch(key, f"activity_events?select=user_id,event_type,metadata,created_at"
                        f"&created_at=gte.{SPLIT_START}&order=created_at.asc")
    usage = fetch(key, "daily_usage?select=user_id,day,dives_used,ai_used")

    variant, cohort = {}, []
    for row in attrs:
        meta = row["metadata"] or {}
        if campaign and meta.get("utm_campaign") != campaign:
            continue
        if meta.get("ab_variant") in ("A", "B"):
            variant[row["user_id"]] = meta["ab_variant"]
            cohort.append(row["user_id"])

    by_user = defaultdict(list)
    for row in events:
        if row["user_id"] in variant:
            by_user[row["user_id"]].append(row)
    # Dive counts come from deepdive_open, NOT daily_usage: arm B never calls
    # use_dive (its cap is a count of gpt_chats rows), so daily_usage reports
    # every arm B user as 0 and would hand arm A a fake win.
    dives_by_user = defaultdict(int)
    for uid, evs in by_user.items():
        dives_by_user[uid] = sum(1 for e in evs if e["event_type"] == "deepdive_open")
    ai_users = {r["user_id"] for r in usage if (r["ai_used"] or 0) > 0}

    def reached(uid):
        """Which funnel steps this user reached, from either arm's event names."""
        evs = by_user.get(uid, [])
        kinds = Counter(e["event_type"] for e in evs)
        steps = {"signup"}
        # funnel_step is the parity event; fall back to per-arm names for users
        # who signed up before it shipped, so historical cohorts still compute.
        for e in evs:
            if e["event_type"] == "funnel_step":
                steps.add((e["metadata"] or {}).get("step"))
        if kinds["gpt_finder_search"] or kinds["discover_view"]:
            steps.add("first_search")
        n_dives = kinds["deepdive_open"]
        if n_dives >= 1:
            steps.add("first_dive")
        if n_dives >= 2:
            steps.add("second_dive")
        if len({e["created_at"][:10] for e in evs}) >= 2:
            steps.add("return")
        return steps

    def secs_to_first_dive(uid):
        evs = sorted(by_user.get(uid, []), key=lambda e: e["created_at"])
        dives = [e for e in evs if e["event_type"] == "deepdive_open"]
        if not evs or not dives:
            return None
        t0 = datetime.fromisoformat(evs[0]["created_at"].replace("Z", "+00:00"))
        t1 = datetime.fromisoformat(dives[0]["created_at"].replace("Z", "+00:00"))
        return (t1 - t0).total_seconds()

    print(f"cohort: {len(cohort)} users with an assigned variant"
          + (f", campaign={campaign}" if campaign else "") + "\n")

    arms = {a: [u for u in cohort if variant[u] == a] for a in ("A", "B")}
    print(f"{'step':<14}{'A':>12}{'B':>12}   gap")
    print("-" * 44)
    prev = {}
    for step in STEPS:
        cells, rates = [], {}
        for arm, users in arms.items():
            n = len(users)
            hit = sum(1 for u in users if step in reached(u))
            rates[arm] = hit / n if n else 0
            cells.append(f"{hit}/{n} ({rates[arm]:.0%})")
        gap = rates["B"] - rates["A"]
        flag = "  <-- port from B" if gap >= 0.15 else ("  <-- port from A" if gap <= -0.15 else "")
        print(f"{step:<14}{cells[0]:>12}{cells[1]:>12}   {gap:+.0%}{flag}")
        prev = rates

    print("\ncontinuous measures (more power than rates at small n):")
    for arm, users in arms.items():
        times = [t for t in (secs_to_first_dive(u) for u in users) if t is not None]
        dives = [dives_by_user.get(u, 0) for u in users]
        activated = [d for d in dives if d]
        med = sorted(times)[len(times) // 2] if times else float("nan")
        print(f"  arm {arm}: median secs->first dive {med:6.0f} | "
              f"mean dives/activated user {(sum(activated)/len(activated) if activated else 0):.1f} | "
              f"activated {len(activated)}/{len(users)}")

    print("\nspin / feedback earn-back (both arms share the RPCs):")
    for arm, users in arms.items():
        shown = sum(1 for u in users if any(e["event_type"] == "spin_shown" for e in by_user.get(u, [])))
        took = sum(1 for u in users if any(e["event_type"] == "spin_awarded" for e in by_user.get(u, [])))
        fb = sum(1 for u in users if any(e["event_type"] == "feedback_bonus_awarded" for e in by_user.get(u, [])))
        rate = f"{took/shown:.0%}" if shown else "n/a"
        print(f"  arm {arm}: spin shown {shown}, taken {took} ({rate}), feedback bonus {fb}")

    print("\nA gap of >=15pts at a single step is the signal to port that step's "
          "treatment between arms rather than pick a whole-arm winner.")


if __name__ == "__main__":
    main()
