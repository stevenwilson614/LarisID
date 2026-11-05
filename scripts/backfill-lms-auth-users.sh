#!/usr/bin/env bash
# Link class auth users already on disk (and lms_accounts) so Laris signup
# counts can skip LMS-only accounts. Safe to re-run.
set -euo pipefail
KEY="${LARISID_SSH_KEY:-$HOME/.ssh/larisid_hetzner}"
HOST="${LARISID_SSH_HOST:-root@84.247.147.205}"
ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=20 "$HOST" 'bash -s' << 'REMOTE'
set -euo pipefail
python3 - << 'PY'
import json
import re
from pathlib import Path

root = Path("/root/larisid-infra/docker/volumes/anton-school")
uid_re = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
keys = {"authuserid", "owneruserid", "userid", "user_id"}
rows = {}

def add(uid, slug):
    uid = str(uid or "").strip().lower()
    slug = re.sub(r"[^a-z0-9-]", "", str(slug or "lms").strip().lower())[:80] or "lms"
    if uid_re.match(uid) and uid not in rows:
        rows[uid] = slug

def walk(obj, slug):
    if isinstance(obj, dict):
        for key, value in obj.items():
            if str(key).lower() in keys and isinstance(value, str):
                add(value, slug)
            else:
                walk(value, slug)
    elif isinstance(obj, list):
        for item in obj:
            walk(item, slug)

state = root / "state"
if state.is_dir():
    for path in state.glob("*.json"):
        if ".bak" in path.name:
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        walk(data, path.stem)

owners = None
for path in root.rglob("owners.json"):
    if "stage" in path.parts:
        continue
    owners = path
    break
if owners and owners.exists():
    try:
        data = json.loads(owners.read_text(encoding="utf-8"))
    except Exception:
        data = {}
    if isinstance(data, dict):
        for uid, slug in data.items():
            add(uid, slug if isinstance(slug, str) else "lms")

out = Path("/tmp/lms-auth-users.csv")
with out.open("w", encoding="utf-8") as handle:
    for uid, slug in rows.items():
        handle.write(f"{uid}\t{slug}\n")
print(f"disk_rows {len(rows)}")
PY
docker cp /tmp/lms-auth-users.csv supabase-db:/tmp/lms-auth-users.csv
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 << 'SQL'
create temp table lms_auth_incoming (user_id uuid, slug text);
\copy lms_auth_incoming from '/tmp/lms-auth-users.csv' with (format csv, delimiter E'\t')
insert into public.lms_auth_users (user_id, slug)
select i.user_id, left(coalesce(nullif(trim(i.slug), ''), 'lms'), 80)
from lms_auth_incoming i
join auth.users u on u.id = i.user_id
on conflict (user_id) do nothing;
insert into public.lms_auth_users (user_id, slug)
select a.user_id, left(coalesce(nullif(trim(a.org_slug), ''), 'lms'), 80)
from public.lms_accounts a
join auth.users u on u.id = a.user_id
on conflict (user_id) do nothing;
select count(*) as linked from public.lms_auth_users;
SQL
REMOTE
echo "OK"
