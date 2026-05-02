SHELL := /bin/bash

# Local dev orchestration. Day-to-day targets are listed in `make help`.
# Anything else (db-up, migrate, wipe, dev-bg, …) is an internal helper
# called by the visible targets.

NPM        ?= npm
DEV_LOG    ?= /tmp/compass-dev.log
DEV_PID    ?= /tmp/compass-dev.pid
PORT       ?= $(shell . ./.env 2>/dev/null; echo $${PORT:-3000})

.DEFAULT_GOAL := help

.PHONY: help bootstrap dev redeploy seed test e2e clean mobile mobile-build \
        install db-up db-wait migrate wipe pull dev-bg dev-stop down

help: ## Show this help.
	@awk 'BEGIN {FS = ":.*##"; printf "Compass dev targets\n\nUsage: make <target>\n\nTargets:\n"} /^[a-zA-Z0-9_-]+:.*##/ { printf "  \033[1m%-14s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

bootstrap: install db-up db-wait migrate seed ## First-time setup: env + deps + Postgres + migrate + seed.
	@if [ ! -f .env ]; then cp .env.example .env; echo "wrote .env from .env.example"; fi
	@echo "bootstrap done. next: make dev"

dev: ## Start the dev server in the foreground (Ctrl-C to stop).
	$(NPM) run dev

redeploy: dev-stop _redeploy_pull wipe dev-bg e2e ## Pull, wipe DB + reseed, restart dev, run e2e. QUICK=1 skips pull/install.
	@echo
	@echo "redeploy complete — http://localhost:$(PORT)/"
	@echo "demo logins (password: compassdemo123):"
	@echo "  super@compass.example         → http://localhost:$(PORT)/__super"
	@echo "  scoutmaster@example.invalid   → http://troop100.localhost:$(PORT)/admin"
	@echo "  cubmaster@example.invalid     → http://pack100.localhost:$(PORT)/admin"
	@echo "  troop-leader@example.invalid  → http://gstroop100.localhost:$(PORT)/admin"

seed: ## Re-run the demo seed against the existing database.
	$(NPM) run db:seed

test: ## Run the unit/integration suite (compass_test database).
	$(NPM) test

e2e: ## Demo-data smoke tests against the running dev server.
	@PORT=$(PORT) node --test scripts/e2e-demo.test.mjs

clean: dev-stop down ## Stop the dev server and the Postgres container.

# --- mobile (Expo + EAS) ---

MOBILE   := mobile
PLATFORM ?= all
PROFILE  ?= development

mobile: ## Start the Expo Metro server (pick iOS / Android / web from its menu).
	cd $(MOBILE) && $(NPM) run start

mobile-build: ## EAS cloud build. PROFILE=development|preview|production, PLATFORM=ios|android|all.
	cd $(MOBILE) && npx eas build --profile $(PROFILE) --platform $(PLATFORM)

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
	$(NPM) run db:up

db-wait:
	@echo "waiting for postgres…"
	@until docker exec compass-postgres pg_isready -U compass -d compass >/dev/null 2>&1; do sleep 1; done

migrate:
	$(NPM) run db:deploy
	$(NPM) run db:generate

wipe: db-up db-wait
	$(NPM) run db:reset

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
			if curl -sf -o /dev/null http://localhost:$(PORT)/healthz; then echo "ready: http://localhost:$(PORT)/"; exit 0; fi; \
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
	$(NPM) run db:down
