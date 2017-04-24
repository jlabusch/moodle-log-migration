.PHONY: prep lint clean

DOCKER=docker

prep:
	mkdir -p db/new/data db/new/init db/old/data db/old/init

lint:
	make -C app lint

clean:
	sudo rm -fr db/old/data/*
	sudo rm -fr db/new/data/*
