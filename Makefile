.PHONY: prep clean

prep:
	mkdir -p db/new/data db/new/init db/old/data db/old/init

clean:
	sudo rm -fr db/old/data/*
	sudo rm -fr db/new/data/*
