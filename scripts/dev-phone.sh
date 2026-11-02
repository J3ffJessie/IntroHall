#!/usr/bin/env bash
# Dev server reachable from a phone on the same Wi-Fi. sslip.io maps <ip-with-dashes>.sslip.io (and its
# subdomains) to that IP, so app./{slug}. routing works without editing DNS. Plain HTTP: no service worker or push.
set -euo pipefail
IP=$(ip -4 route get 1.1.1.1 | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}')
ROOT="${IP//./-}.sslip.io:3000"
# Next silently moves to 3001 when 3000 is taken, which would leave every link pointing at the wrong server.
if ss -ltn | grep -q ':3000 '; then
  echo "Port 3000 is in use (another dev server?). Stop it and run this again." >&2
  exit 1
fi
echo "On your phone, open http://app.$ROOT  (sign-in codes: http://127.0.0.1:54324)"
export NEXT_PUBLIC_ROOT_DOMAIN="$ROOT" NEXT_PUBLIC_SUPABASE_URL="http://$IP:54321"
exec next dev --turbopack -H 0.0.0.0 -p 3000
