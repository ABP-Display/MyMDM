.PHONY: server-test server-run web-install web-build android-build docker-config

JAVA17_HOME ?= $(shell brew --prefix openjdk@17 2>/dev/null)/libexec/openjdk.jdk/Contents/Home

server-test:
	cd server && php artisan test

server-run:
	cd server && php artisan serve --host=127.0.0.1 --port=8080

web-install:
	cd server && npm install

web-build:
	cd server && npm run build

android-build:
	cd android && JAVA_HOME="$(JAVA17_HOME)" gradle assembleDebug

docker-config:
	docker compose config

