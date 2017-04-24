.PHONY: prep lint clean

DOCKER=docker

prep:
	mkdir -p db/new/data db/new/init db/old/data db/old/init

lint:
	$(DOCKER) exec -it $$($(DOCKER) ps | grep moodle-log-migrator | awk '{print $$1}') ./node_modules/.bin/eslint ./lib/*.js

clean:
	sudo rm -fr db/old/data/*
	sudo rm -fr db/new/data/*
