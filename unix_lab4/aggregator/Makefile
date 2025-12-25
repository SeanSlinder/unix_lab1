.PHONY: up down logs ps build scale1 scale3 scale6

up:
	docker compose up --build

down:
	docker compose down -v

build:
	docker compose build --no-cache

logs:
	docker compose logs -f --tail=200

ps:
	docker compose ps

scale1:
	docker compose up --build --scale worker=1

scale3:
	docker compose up --build --scale worker=3

scale6:
	docker compose up --build --scale worker=6
