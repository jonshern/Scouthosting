#!/usr/bin/env bash
# Run the blue-green switch (switch.mjs) on PORT (3000). launchd runs
# this as com.compass.switch.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
mkdir -p "$(slots_dir)"
SWITCH_PORT="$(switch_port)" SWITCH_STATE="$(switch_state)" exec node "$ROOT/scripts/host/switch.mjs"
