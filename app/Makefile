.PHONY: lint

DOCKER=sudo docker
COMPOSE=sudo docker-compose

lint:
	$(DOCKER) exec -it $$($(COMPOSE) ps | grep app_1 | awk '{print $$1}') ./node_modules/.bin/eslint ./lib/*.js

