#!/usr/bin/env bash
# Keeps one open issue labelled "outside-links" in step with the daily outside-link check
# (.github/workflows/outside-links.yml). Needs gh, GH_TOKEN, OUTCOME (the check step's
# outcome) and RUN_URL. Usage: outside-links-issue.sh <log>...
set -euo pipefail
label="outside-links"
gh label create "$label" --color d93f0b --description "Dead links to other sites" 2>/dev/null || true
existing=$(gh issue list --label "$label" --state open --json number --jq '.[0].number // empty')

if [ "$OUTCOME" = "success" ]; then
  if [ -n "$existing" ]; then
    gh issue close "$existing" --comment "Every outside link resolves again ($RUN_URL)."
  fi
  exit 0
fi

# links.spec.ts prints each outside link it checked as "EXT <status> <url>".
broken=$(grep -hoE 'EXT (404|410) https?://[^ ]+' "$@" | sed 's/^EXT //' | sort -u || true)
if [ -z "$broken" ]; then
  broken="The check failed without a list of dead links; see the run log."
fi
fence='```'
body=$(printf 'The daily outside-link check found links that no longer resolve:\n\n%s\n%s\n%s\n\nRun: %s\n\nFix the link in the page that holds it. This issue closes itself once every link resolves.\n' "$fence" "$broken" "$fence" "$RUN_URL")

if [ -n "$existing" ]; then
  gh issue comment "$existing" --body "$body"
else
  gh issue create --title "Dead outside links" --label "$label" --body "$body"
fi
