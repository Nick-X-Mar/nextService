#!/bin/bash
# SEO deployment smoke test.
# Usage: bash scripts/seo-deploy-check.sh https://dev.d3ku6yajf4j6y8.amplifyapp.com

set -u
BASE="${1:-https://dev.d3ku6yajf4j6y8.amplifyapp.com}"
BASE="${BASE%/}"

pass() { echo "  \033[32m✓\033[0m $1"; }
fail() { echo "  \033[31m✗\033[0m $1"; }
info() { echo "    $1"; }

section() { echo; echo "── $1 ──────────────────"; }

# ── 1. Basic reachability ─────────────────────────────
section "1. Core routes respond"
for path in "/" "/sitemap.xml" "/robots.txt" "/register-professional/" "/privacy/" "/terms/"; do
  code=$(curl -sk -o /dev/null -w "%{http_code}" "$BASE$path")
  if [ "$code" = "200" ]; then pass "$code  $path"
  else fail "$code  $path (expected 200)"; fi
done

# ── 2. trailingSlash behaviour ────────────────────────
section "2. trailingSlash redirects"
code=$(curl -sk -o /dev/null -w "%{http_code}" "$BASE/offer/set_disk_all_cars")
loc=$(curl -skI "$BASE/offer/set_disk_all_cars" | grep -i "^location:" | tr -d '\r')
if [ "$code" = "308" ] || [ "$code" = "307" ] || [ "$code" = "301" ]; then
  pass "$code  /offer/set_disk_all_cars  →  $loc"
else
  fail "$code  /offer/set_disk_all_cars — expected 3xx redirect to slashed"
fi

code=$(curl -sk -o /dev/null -w "%{http_code}" "$BASE/admin")
loc=$(curl -skI "$BASE/admin" | grep -i "^location:" | tr -d '\r')
if [ "$code" = "307" ] || [ "$code" = "308" ] || [ "$code" = "301" ]; then
  pass "$code  /admin  →  $loc"
else
  fail "$code  /admin — may be redirect loop"
fi

# ── 3. Admin login reachable (no loop) ───────────────
section "3. Admin login reachable"
code=$(curl -sk -o /dev/null -w "%{http_code}" -L "$BASE/admin/login/" --max-redirs 3)
if [ "$code" = "200" ]; then pass "200  /admin/login/ reachable"
else fail "$code  /admin/login/ (possible redirect loop)"; fi

# ── 4. DB has deals? ─────────────────────────────────
section "4. /api/hot-deals — is DB populated?"
body=$(curl -sk -L "$BASE/api/hot-deals/")
count=$(echo "$body" | python3 -c "import sys, json
try:
    d = json.load(sys.stdin)
    print(len(d) if isinstance(d, list) else 0)
except Exception:
    print(-1)")

if [ "$count" = "-1" ]; then
  fail "/api/hot-deals returned non-JSON"
  info "first 200 chars: $(echo "$body" | head -c 200)"
elif [ "$count" = "0" ]; then
  fail "/api/hot-deals returned EMPTY array — HotDeals table on prod has 0 records"
  info "The app will fall back to static offers.json (5 deals with correct English slugs)"
  info "BUT: the admin panel shows the DB, not the JSON — so admin will look empty."
else
  pass "/api/hot-deals returned $count deals"
  echo "$body" | python3 -c "import sys, json
d = json.load(sys.stdin)
for i in d:
    print(f'    - slug={i.get(\"slug\")!r:40}  title={i.get(\"title\")!r}')"
fi

# ── 5. Offer pages — status + title ─────────────────
section "5. All 5 SEO offer URLs work"
for slug in set_disk_all_cars set-imantas-xronismou service-auto vafi-oliki vafi-profylaktira-portas; do
  code=$(curl -sk -o /dev/null -w "%{http_code}" -L "$BASE/offer/$slug/" --max-redirs 3)
  title=$(curl -sk -L "$BASE/offer/$slug/" | grep -oE '<title>[^<]*</title>' | head -1 | sed -E 's,</?title>,,g')
  if [ "$code" = "200" ] && [ -n "$title" ] && [ "$title" != "Η προσφορά δεν βρέθηκε | NextService" ]; then
    pass "200  /offer/$slug/"
    info "title: $title"
  elif [ "$title" = "Η προσφορά δεν βρέθηκε | NextService" ]; then
    fail "200 but NOT FOUND body — slug missing from DB+JSON"
    info "url: /offer/$slug/"
  else
    fail "$code  /offer/$slug/"
    info "title: $title"
  fi
done

# ── 6. SEO tags ──────────────────────────────────────
section "6. Offer page SEO tags (set_disk_all_cars)"
html=$(curl -sk -L "$BASE/offer/set_disk_all_cars/")
for tag in 'og:title' 'og:description' 'og:image' 'og:url' 'twitter:card' 'rel="canonical"' 'application/ld+json'; do
  if echo "$html" | grep -q "$tag"; then pass "found: $tag"
  else fail "missing: $tag"; fi
done

jsonld=$(echo "$html" | python3 -c "
import sys, re, json
html = sys.stdin.read()
m = re.search(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', html, re.S)
if m:
    try:
        d = json.loads(m.group(1))
        print(f'  type={d.get(\"@type\")}  name={d.get(\"name\")}  price={d.get(\"price\")}  currency={d.get(\"priceCurrency\")}')
    except Exception as e:
        print(f'  JSON parse error: {e}')
else:
    print('  no JSON-LD found')
")
echo "$jsonld"

# ── 7. Sitemap has English slugs ─────────────────────
section "7. Sitemap contains English slugs"
sitemap=$(curl -sk -L "$BASE/sitemap.xml")
for slug in set_disk_all_cars set-imantas-xronismou service-auto vafi-oliki vafi-profylaktira-portas; do
  if echo "$sitemap" | grep -q "/offer/$slug/"; then pass "sitemap has /offer/$slug/"
  else fail "sitemap MISSING /offer/$slug/"; fi
done

# ── 8. robots.txt blocks private paths ───────────────
section "8. robots.txt blocks private paths"
robots=$(curl -sk -L "$BASE/robots.txt")
for blocked in '/admin' '/garage-dashboard' '/requests' '/profile' '/api/'; do
  if echo "$robots" | grep -qE "Disallow:\s*$blocked"; then pass "Disallow $blocked"
  else fail "robots.txt missing Disallow $blocked"; fi
done
if echo "$robots" | grep -qE "Sitemap:\s*http"; then pass "Sitemap: declared"
else fail "robots.txt missing Sitemap: line"; fi

# ── 9. Private pages have noindex ────────────────────
section "9. Private pages emit noindex"
for path in "/admin/login/" "/garage-dashboard/" "/profile/test/"; do
  html=$(curl -sk -L "$BASE$path" --max-redirs 3)
  if echo "$html" | grep -qE '<meta name="robots" content="[^"]*noindex'; then
    pass "noindex found on $path"
  else
    fail "no noindex on $path"
  fi
done

echo
echo "── Done ─────────────────────"
