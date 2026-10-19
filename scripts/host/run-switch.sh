#!/usr/bin/env bash
# Run the blue-green switch (switch.mjs) on PORT (3000). launchd runs
# this as com.compass.switch. SWITCH_BIND in .env picks the address it
# listens on (0.0.0.0 when unset).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
mkdir -p "$(slots_dir)"
SWITCH_BIND="$(env_get SWITCH_BIND)" SWITCH_PORT="$(switch_port)" SWITCH_STATE="$(switch_state)" exec node "$ROOT/scripts/host/switch.mjs"
