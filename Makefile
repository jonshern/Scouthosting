SHELL := /bin/bash

# Local dev orchestration. Day-to-day targets are listed in `make help`.
# Anything else (db-up, migrate, wipe, dev-bg, …) is an internal helper
# called by the visible targets.
#
# Post-cutover layout: the Next.js app lives at the repo root (the old
# Express runtime was removed in 4c9564c). All npm scripts run from the
# top-level package.json; mobile/ has its own Expo workspace.

NPM        ?= npm
DEV_LOG    ?= /tmp/compass-dev.log
DEV_PID    ?= /tmp/compass-dev.pid
PORT       ?= $(shell . ./.env 2>/dev/null; echo $${PORT:-3000})

.DEFAULT_GOAL := help

.PHONY: help bootstrap dev redeploy seed test e2e clean mobile mobile-build demo demo-reset \
        install db-up db-wait migrate wipe pull dev-bg dev-stop down \
        ensure-master-key

help: ## Show this help.
	@awk 'BEGIN {FS = ":.*##"; printf "Compass dev targets\n\nUsage: make <target>\n\nTargets:\n"} /^[a-zA-Z0-9_-]+:.*##/ { printf "  \033[1m%-14s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

bootstrap: install db-up db-wait ensure-master-key migrate seed ## First-time setup: env + deps + Postgres + master key + migrate + seed.
	@echo "bootstrap done. next: make dev"

# Ensure .env exists and has a non-empty MASTER_KEY. We generate one
# the first time so the seed and the dev server agree on the key
# (otherwise each Node process gets its own ephemeral key and the
# encrypted seed rows become unreadable on the next boot).
ensure-master-key:
	@if [ ! -f .env ]; then cp .env.example .env; echo "wrote .env from .env.example"; fi
	@if ! grep -q '^MASTER_KEY=' .env; then \
	  echo 'MASTER_KEY=' >> .env; \
	fi
	@if grep -q '^MASTER_KEY=$$' .env || grep -q '^MASTER_KEY=""$$' .env; then \
	  KEY=$$(openssl rand -hex 32); \
	  if [ "$$(uname)" = "Darwin" ]; then \
	    sed -i '' "s|^MASTER_KEY=.*|MASTER_KEY=$$KEY|" .env; \
	  else \
	    sed -i "s|^MASTER_KEY=.*|MASTER_KEY=$$KEY|" .env; \
	  fi; \
	  echo "generated MASTER_KEY in .env (32 random bytes)"; \
	fi

dev: ## Start the Next.js dev server in the foreground (Ctrl-C to stop).
	$(NPM) run dev

redeploy: dev-stop _redeploy_pull ensure-master-key wipe dev-bg e2e ## Pull, wipe DB + reseed, restart dev, run e2e. QUICK=1 skips pull/install.
	@echo
	@echo "redeploy complete — http://localhost:$(PORT)/"
	@echo "demo logins (password: AdminPasswordTest123!):"
	@echo "  super@example.invalid          → http://localhost:$(PORT)/super-admin"
	@echo "  scoutmaster@example.invalid    → http://troop100.localhost:$(PORT)/admin"

demo: db-up db-wait ensure-master-key ## Run the public demo (sample Troop 42, demo accounts) on :3100 with its own database.
	@scripts/demo.sh up

demo-reset: ## Put the demo from `make demo` back to its starting point.
	@scripts/demo.sh reset

seed: ## Re-run the demo seed against the existing database.
	$(NPM) run db:seed

test: ## Run the unit/integration suite (Vitest).
	$(NPM) test

e2e: ## Playwright + axe a11y tests against the running dev server.
	@PORT=$(PORT) npx playwright test

clean: dev-stop down ## Stop the dev server and the Postgres container.

# --- mobile (Expo + EAS) ---

MOBILE   := mobile
PLATFORM ?= all
PROFILE  ?= development

mobile: ## Start the Expo Metro server (pick iOS / Android / web from its menu).
	cd $(MOBILE) && $(NPM) run start

mobile-build: ## EAS cloud build. PROFILE=development|preview|production, PLATFORM=ios|android|all.
	cd $(MOBILE) && npx --yes -p eas-cli eas build --profile $(PROFILE) --platform $(PLATFORM)

# --- internal helpers (not in `make help`) ---

.PHONY: _redeploy_pull
_redeploy_pull:
ifndef QUICK
	@$(MAKE) --no-print-directory pull
else
	@echo "QUICK=1 → skipping git pull / npm install"
endif

install:
	$(NPM) install

db-up:
	docker compose up -d

db-wait:
	@echo "waiting for postgres…"
	@until docker exec compass-postgres pg_isready -U compass -d compass >/dev/null 2>&1; do sleep 1; done

migrate:
	$(NPM) run db:deploy
	$(NPM) run db:generate

wipe: db-up db-wait
	docker compose down -v
	docker compose up -d
	@$(MAKE) --no-print-directory db-wait
	$(NPM) run db:deploy
	$(NPM) run db:seed

pull:
	git pull --ff-only
	$(NPM) install

dev-bg:
	@if [ -f $(DEV_PID) ] && kill -0 $$(cat $(DEV_PID)) 2>/dev/null; then \
		echo "dev server already running (pid $$(cat $(DEV_PID)))"; \
	else \
		nohup $(NPM) run dev >$(DEV_LOG) 2>&1 & echo $$! > $(DEV_PID); \
		echo "dev server pid=$$(cat $(DEV_PID)) log=$(DEV_LOG)"; \
		for i in $$(seq 1 60); do \
			if curl -sf -o /dev/null http://localhost:$(PORT)/health; then echo "ready: http://localhost:$(PORT)/"; exit 0; fi; \
			sleep 0.5; \
		done; \
		echo "dev server didn't come up in 30s — see $(DEV_LOG)"; exit 1; \
	fi

dev-stop:
	@if [ -f $(DEV_PID) ]; then \
		kill $$(cat $(DEV_PID)) 2>/dev/null && echo "stopped pid $$(cat $(DEV_PID))" || echo "not running"; \
		rm -f $(DEV_PID); \
	fi

down:
	docker compose down
