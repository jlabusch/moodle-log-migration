.PHONY: lint

DOCKER=docker

lint:
	$(DOCKER) exec -it $$($(DOCKER) ps | grep moodle-log-migrator | awk '{print $$1}') ./node_modules/.bin/eslint ./lib/*.js

