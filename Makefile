.PHONY: format lint

format:
	poetry run black .
	poetry run isort .

lint:
	poetry run black --check .
	poetry run isort --check-only .


init:
	poetry run alembic upgrade head
	poetry run python seed.py
