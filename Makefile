PORT ?= 3000
HOST ?= 127.0.0.1

.PHONY: start test
start:
	npm run dev -- --hostname $(HOST) --port $(PORT)

test:
	npm test
