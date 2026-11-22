.PHONY: install dev lint test bot-install admin-install admin-build

install:
	python -m pip install -e ".[dev]"

lint:
	ruff check src tests
	ruff format --check src tests
	mypy

test:
	pytest --cov --cov-report=term-missing

bot-install:
	cd bot && npm install

admin-install:
	cd admin && npm install

admin-build:
	cd admin && npm run build

admin-test:
	cd admin && npm test

bot-test:
	cd bot && npm test
