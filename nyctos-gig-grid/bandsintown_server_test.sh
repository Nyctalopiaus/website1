#!/bin/bash
# Quick server-side test: can this server's curl fetch Bandsintown's public
# city pages without getting Cloudflare-blocked? Paste-and-run via PuTTY —
# no files need to be uploaded first. Safe to delete afterward.

UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

declare -A CITIES=(
  [colorado]="denver-co"
  [california]="los-angeles-ca"
  [texas]="austin-tx"
  [england]="london-uk"
  [scotland]="glasgow-uk"
  [wales]="cardiff-uk"
  [ireland]="dublin-ie"
)

for market in "${!CITIES[@]}"; do
  slug="${CITIES[$market]}"
  echo "===== $market ($slug) ====="
  out="/tmp/bit_test_${slug}.html"
  code=$(curl -s -o "$out" -w "%{http_code}" -L --max-time 15 \
    -A "$UA" \
    -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" \
    -H "Accept-Language: en-US,en;q=0.9" \
    "https://www.bandsintown.com/c/${slug}")
  size=$(wc -c < "$out" 2>/dev/null)
  events=$(grep -o "MusicEvent" "$out" 2>/dev/null | wc -l)
  blocked=$(grep -iE "just a moment|attention required|checking your browser" "$out" 2>/dev/null)

  echo "HTTP code: $code"
  echo "Response size: $size bytes"
  echo "\"MusicEvent\" occurrences in JSON-LD: $events"
  if [ -n "$blocked" ]; then
    echo "LOOKS BLOCKED — Cloudflare interstitial wording found"
  elif [ "$events" -gt 0 ] 2>/dev/null; then
    echo "RESULT: LIKELY WORKING — real event data came through"
  else
    echo "RESULT: UNCLEAR — no block wording, but no MusicEvent data either (check $out manually)"
  fi
  echo
done

echo "Raw HTML saved per city at /tmp/bit_test_<slug>.html for manual inspection if needed."
