# ==============================================================================
# kiosk (system.kelviontech.in) — Deployment & Operations Automation Makefile
# Same AWS EC2 bridge box as amitkhatri / Wrench / kelviontech.in -- see
# AWS_DEPLOYMENT_MASTER_PLAN.md. Mirrors Wrench's own Makefile shape so both stacks are
# operated the same way.
# ==============================================================================

SHELL := /bin/bash
COMPOSE := docker compose

.PHONY: help deploy build up down stop restart ps logs logs-backend logs-frontend logs-db check seed migrate db-shell prune

help:
	@echo "kiosk Operations Commands:"
	@echo "  make deploy         - Pull latest git changes, build images, and restart stack"
	@echo "  make build          - Build Docker container images"
	@echo "  make up             - Start containers in detached mode"
	@echo "  make down           - Stop and remove containers"
	@echo "  make stop           - Stop running containers"
	@echo "  make restart        - Restart all containers without rebuilding"
	@echo "  make ps             - View status of running containers"
	@echo "  make logs           - Follow logs from all containers"
	@echo "  make logs-backend   - Follow cloud/api logs"
	@echo "  make logs-frontend  - Follow super-admin-web (nginx) logs"
	@echo "  make logs-db        - Follow database logs"
	@echo "  make check          - Run health check on live endpoints"
	@echo "  make seed           - Run the platform seed (plans, feature catalog, super admin)"
	@echo "  make migrate        - Apply pending Prisma migrations without restarting the stack"
	@echo "  make db-shell       - Open an interactive psql console as the app's own role"
	@echo "  make prune          - Free host disk space by removing unused Docker cache"

deploy:
	git pull
	$(COMPOSE) up -d --build --remove-orphans
	@echo "Deployment complete! Run 'make check' to verify status."

build:
	$(COMPOSE) build

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

stop:
	$(COMPOSE) stop

restart:
	$(COMPOSE) restart

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f

logs-backend:
	$(COMPOSE) logs -f backend

logs-frontend:
	$(COMPOSE) logs -f frontend

logs-db:
	$(COMPOSE) logs -f db

check:
	@echo "=== [1/3] Checking Docker Container Status ==="
	@$(COMPOSE) ps
	@echo ""
	@echo "=== [2/3] Checking Backend Health (direct, loopback-only) ==="
	@curl -sf -o /dev/null -w "%{http_code}" http://127.0.0.1:$$(grep -E '^BACKEND_PORT=' .env 2>/dev/null | cut -d '=' -f2 || echo 8010)/api/v1/restaurants | grep -qE "^(200|401)$$" && echo " -> Backend is UP (401/200 on an auth-gated route is correct)" || echo " -> Backend health check FAILED"
	@echo ""
	@echo "=== [3/3] Checking Frontend Web Access ==="
	@curl -s -o /dev/null -w "%{http_code}" http://$$(grep -E '^HOST_BIND_IP=' .env 2>/dev/null | cut -d '=' -f2 || echo 172.17.0.1):$$(grep -E '^PORT=' .env 2>/dev/null | cut -d '=' -f2 || echo 8090)/ | grep -q "200" && echo " -> Frontend is SERVING HTTP 200" || echo " -> Frontend response check FAILED"

seed:
	$(COMPOSE) exec backend npm run seed

migrate:
	$(COMPOSE) exec backend npm run prisma:deploy

db-shell:
	$(COMPOSE) exec -it db psql -U jamanvaar_app -d jamanvaar

prune:
	docker system prune -af --volumes
