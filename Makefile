SHELL := /bin/bash

# Local dev orchestration. The PC defaults in docker-compose.yml +
# .env.example assume Postgres on 5432 and Express on 3000; on this Mac
# both are taken (5432 by another container, 5000 by Control Center
# AirPlay Receiver), so .env + docker-compose.override.yml move us to
# 5433 / 5050. The targets below work regardless of which ports the
# checked-in .env picks — they just call the npm scripts.

NPM        ?= npm
NODE_BIN   := $(shell command -v node 2>/dev/null)
DOCKER_BIN := $(shell command -v docker 2>/dev/null)
DEV_LOG    ?= /tmp/compass-dev.log
DEV_PID    ?= /tmp/compass-dev.pid
PORT       ?= $(shell . ./.env 2>/dev/null; echo $${PORT:-3000})

.DEFAULT_GOAL := help

.PHONY: help check env install db-up db-wait migrate seed bootstrap dev dev-bg dev-stop dev-log e2e test down clean reset reseed

help: ## Show this help.
	@awk 'BEGIN {FS = ":.*##"; printf "Compass dev targets\n\nUsage: make <target>\n\nTargets:\n"} /^[a-zA-Z_-]+:.*##/ { printf "  \033[1m%-12s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

check: ## Verify node + docker are installed.
	@test -n "$(NODE_BIN)"   || { echo "node not found — install Node 20+"; exit 1; }
	@test -n "$(DOCKER_BIN)" || { echo "docker not found — install Docker Desktop"; exit 1; }
	@node -e 'const v=process.versions.node.split(".")[0];if(+v<20){console.error("Node "+process.versions.node+" — need 20+");process.exit(1)}'
	@echo "ok: node $$(node -v), docker $$(docker --version | awk '{print $$3}' | tr -d ,)"

env: ## Create .env from .env.example if missing.
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "wrote .env from .env.example — review before bootstrap"; \
	else \
		echo ".env already exists — leaving it alone"; \
	fi

install: check ## npm install.
	$(NPM) install

db-up: check ## Start the Postgres container.
	$(NPM) run db:up

db-wait: ## Block until Postgres is healthy.
	@echo "waiting for postgres…"
	@until docker exec compass-postgres pg_isready -U compass -d compass >/dev/null 2>&1; do sleep 1; done
	@echo "postgres ready"

migrate: ## Apply pending Prisma migrations (non-interactive).
	$(NPM) run db:deploy
	$(NPM) run db:generate

seed: ## Seed the demo orgs (idempotent).
	$(NPM) run db:seed

bootstrap: env install db-up db-wait migrate seed ## One-shot: env + deps + db + migrate + seed.
	@echo
	@echo "bootstrap done. next:"
	@echo "  make dev          # foreground"
	@echo "  make dev-bg       # background, log -> $(DEV_LOG)"
	@echo "  make e2e          # demo smoke tests (needs server running)"

dev: ## Start the dev server in the foreground.
	$(NPM) run dev

dev-bg: ## Start the dev server in the background. Logs to $(DEV_LOG).
	@if [ -f $(DEV_PID) ] && kill -0 $$(cat $(DEV_PID)) 2>/dev/null; then \
		echo "dev server already running (pid $$(cat $(DEV_PID))) — see $(DEV_LOG)"; \
	else \
		nohup $(NPM) run dev >$(DEV_LOG) 2>&1 & echo $$! > $(DEV_PID); \
		echo "dev server started pid=$$(cat $(DEV_PID)) log=$(DEV_LOG)"; \
		echo "waiting for listener on port $(PORT)…"; \
		for i in $$(seq 1 60); do \
			if curl -sf -o /dev/null http://localhost:$(PORT)/healthz; then echo "ready: http://localhost:$(PORT)/"; exit 0; fi; \
			sleep 0.5; \
		done; \
		echo "dev server didn't come up in 30s — see $(DEV_LOG)"; exit 1; \
	fi

dev-stop: ## Stop the background dev server.
	@if [ -f $(DEV_PID) ]; then \
		pid=$$(cat $(DEV_PID)); \
		kill $$pid 2>/dev/null && echo "stopped pid $$pid" || echo "pid $$pid not running"; \
		rm -f $(DEV_PID); \
	else \
		echo "no $(DEV_PID) — nothing to stop"; \
	fi

dev-log: ## Tail the background dev server log.
	@tail -f $(DEV_LOG)

e2e: ## Demo-data smoke tests against the running dev server.
	@PORT=$(PORT) node --test scripts/e2e-demo.test.mjs

test: ## Run the unit/integration suite (compass_test database).
	$(NPM) test

down: ## Stop the Postgres container.
	$(NPM) run db:down

clean: dev-stop down ## Stop dev server + Postgres.

reset: ## Drop, re-create, and re-migrate the dev database.
	$(NPM) run db:reset

reseed: ## Re-run the demo seed against the existing database.
	$(NPM) run db:seed
