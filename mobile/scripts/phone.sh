#!/usr/bin/env bash
# Put Compass on your tailnet so the Compass phone app can reach it from anywhere.
# Run on the Mac once Compass answers on localhost:3000 (`npm run dev`, or
# `make deploy` behind the blue-green switch). See docs/phone.md.
#
#   mobile/scripts/phone.sh            serve the local server (port 3000) over https on your tailnet
#   mobile/scripts/phone.sh 3001       serve a different local port
#   mobile/scripts/phone.sh app        also start the app's dev server (Expo) over the tailnet
#   mobile/scripts/phone.sh off        stop serving
set -euo pipefail
cd "$(dirname "$0")/../.."

ts=tailscale
if ! command -v "$ts" >/dev/null 2>&1; then
  ts=/Applications/Tailscale.app/Contents/MacOS/Tailscale
  [ -x "$ts" ] || { echo "Tailscale isn't installed. Get it from https://tailscale.com/download and sign in." >&2; exit 1; }
fi

json=$("$ts" status --json 2>/dev/null) || { echo "Tailscale isn't running or isn't signed in. Open it and sign in first." >&2; exit 1; }
name=$(printf '%s' "$json" | sed -n 's/.*"DNSName": *"\([^"]*\)\.".*/\1/p' | head -1)
ip=$("$ts" ip -4 | head -1)
[ -n "$name" ] || { echo "Couldn't read this Mac's Tailscale name. Is MagicDNS on? (Tailscale admin > DNS)" >&2; exit 1; }
url="https://$name"

case "${1:-}" in
  off)
    "$ts" serve reset
    echo "Stopped serving on $url"
    exit 0
    ;;
  app) port=3000 ;;
  "") port=3000 ;;
  *) port=$1 ;;
esac

if ! curl -fsS -o /dev/null --max-time 3 "http://localhost:$port/health"; then
  echo "Nothing answers on http://localhost:$port/health. Start Compass first (npm run dev, or make deploy)" >&2
  exit 1
fi

# https://<mac>.<tailnet>.ts.net -> http://localhost:<port>, tailnet only (not the public internet).
# The first time, Tailscale may ask you to turn on HTTPS certificates for the tailnet; follow its link.
"$ts" serve --bg "$port"

# Bake the address into the app's dev builds; Settings can still change it on the phone.
printf 'EXPO_PUBLIC_COMPASS_BASE_URL=%s\n' "$url" > mobile/.env.local

echo
echo "Server      $url  (tailnet only)"
echo "Health      $url/health"
echo "Phone app   Profile > Server (or Server on the sign-in screen) > $url, or open this link on the phone:"
echo "            compass://connect?url=$url"
echo "Sign in     scoutmaster@example.invalid / AdminPasswordTest123!"
echo

if [ "${1:-}" = "app" ]; then
  # Expo's usual port is 8081; take the next free one if something (like Lantern's web preview) has it.
  metro=8081
  while (exec 3<>"/dev/tcp/127.0.0.1/$metro") 2>/dev/null; do metro=$((metro + 1)); done
  echo "Starting the app's dev server on $ip. In Expo Go on the phone, open exp://$ip:$metro"
  cd mobile
  export REACT_NATIVE_PACKAGER_HOSTNAME="$ip"
  exec npx expo start --port "$metro"
fi
