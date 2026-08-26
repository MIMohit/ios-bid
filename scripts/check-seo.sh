#!/usr/bin/env bash
# Post-deploy SEO smoke test. Usage: scripts/check-seo.sh https://iosbid.lol
#
# Every count uses `grep -o | wc -l`, never `grep -c`. The SSR payload is one
# enormous line, so `grep -c` returns 1 for a board with 100 rows and 1 for a
# board that rendered nothing at all. It would pass forever.
set -euo pipefail

BASE="${1:-}"
[ -n "$BASE" ] || { echo "usage: $0 <base-url>" >&2; exit 2; }
BASE="${BASE%/}"

fails=0

# ok <label> <actual> <expected> [ge]
check() {
  local label="$1" actual="$2" expected="$3" mode="${4:-eq}" pass
  if [ "$mode" = "ge" ]; then [ "$actual" -ge "$expected" ] && pass=1 || pass=0
  else [ "$actual" = "$expected" ] && pass=1 || pass=0; fi
  if [ "$pass" = 1 ]; then
    echo "PASS  $label (got $actual)"
  else
    echo "FAIL  $label (got $actual, want $([ "$mode" = ge ] && echo ">=")$expected)"
    fails=$((fails + 1))
  fi
}

fetch() { curl -fsSL --compressed -A "check-seo" "$1"; }
head_of() { curl -sSI -A "check-seo" "$1"; }
count() { printf '%s' "$1" | grep -oi -- "$2" | wc -l | tr -d ' '; }
skip() { echo "SKIP  $1"; }

home=$(fetch "$BASE/")
check "homepage: ld+json blocks"              "$(count "$home" 'application/ld+json')" 3
check "homepage: canonical link"              "$(count "$home" 'rel="canonical"')" 1 ge
check "homepage: sponsored nofollow noopener" "$(count "$home" 'rel="sponsored nofollow noopener"')" 1 ge
check "homepage: no \"see details\""           "$(count "$home" 'see details')" 0
# A board row's only outbound link is /go/:slug and its only internal link is its
# category. /r/:slug is a receipt for the buyer, never a row affordance.
check "homepage: no row links to /r/"         "$(count "$home" 'href="/r/')" 0

# Row-derived counts, from the rows that exist. The board launches empty, so a
# hard "50 rows" would fail on day one and get deleted rather than fixed. Rank 1
# is the spotlight panel, not a row, so `.m-cat` is the row count.
rows=$(count "$home" 'class="m-cat')
if [ "$rows" -eq 0 ]; then
  skip "board is empty, row checks not run"
else
  check "homepage: outbound /go/ row links"   "$(count "$home" 'href="/go/')" "$rows" ge
  # The destination, visible on every row. Nothing else on the site says which
  # store it ranks, and the day somebody simplifies it away this goes red.
  check "homepage: apps.apple.com on rows"    "$(count "$home" 'apps\.apple\.com')" "$rows" ge
  check "homepage: category link per row"     "$(count "$home" 'href="/category/')" "$rows" ge
fi

robots=$(fetch "$BASE/robots.txt")
check "robots.txt: Disallow: /go/"  "$(count "$robots" '^Disallow: /go/$')" 1 ge
check "robots.txt: Sitemap line"    "$(count "$robots" '^Sitemap: ')" 1 ge

sitemap=$(fetch "$BASE/sitemap.xml")
check "sitemap.xml: <urlset>" "$(count "$sitemap" '<urlset')" 1 ge
check "sitemap.xml: homepage" "$(count "$sitemap" '<loc>[^<]*iosbid.lol/</loc>')" 1 ge

# Every og:image on the site points here. It was a hard 500 for hours and no
# check saw it, because a 500 still returns a body and every count still passed.
ogimage=$(head_of "$BASE/opengraph-image")
check "/opengraph-image: content-type image/png" "$(count "$ogimage" '^content-type: *image/png')" 1 ge

# /r/:slug, the receipt. Its slug comes from the sitemap, so this checks the two
# together: a receipt that is not in the sitemap is not tested and that is the
# correct failure to notice.
receipt=$(printf '%s' "$sitemap" | grep -o '<loc>[^<]*/r/[^<]*</loc>' | head -1 | sed 's|.*/r/||; s|</loc>||')
if [ -z "$receipt" ]; then
  skip "no receipts in the sitemap yet, /r/ checks not run"
else
  r=$(fetch "$BASE/r/$receipt")
  check "/r/$receipt: title names the rank"  "$(count "$r" '<title>[^<]*is #[0-9]* on iosbid.lol</title>')" 1
  check "/r/$receipt: canonical"             "$(count "$r" "rel=\"canonical\" href=\"[^\"]*/r/$receipt\"")" 1
  check "/r/$receipt: its own og:image"      "$(count "$r" "og:image\" content=\"[^\"]*/og/$receipt\"")" 1
  check "/r/$receipt: one h1"                "$(count "$r" '<h1')" 1
  # A receipt is not a detail page. These are the three things it must never grow.
  check "/r/$receipt: no gallery"            "$(count "$r" 'App Store screenshot')" 0
  check "/r/$receipt: no \"see details\""    "$(count "$r" 'see details')" 0
  check "/r/$receipt: links out to /go/"     "$(count "$r" "href=\"/go/$receipt")" 1 ge

  ogcard=$(head_of "$BASE/og/$receipt")
  check "/og/$receipt: content-type image/png" "$(count "$ogcard" '^content-type: *image/png')" 1 ge
fi

# Any slug works: an unknown one still 302s, and still carries the header.
gohdrs=$(curl -fsSI -A "check-seo" "$BASE/go/check-seo-probe")
check "/go/: x-robots-tag noindex" "$(count "$gohdrs" '^x-robots-tag:.*noindex')" 1 ge

echo
if [ "$fails" -eq 0 ]; then echo "all checks passed"; else echo "$fails check(s) failed"; fi
exit $(( fails > 0 ))
