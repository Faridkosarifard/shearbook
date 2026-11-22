Contributing
============

Thank you for considering a change to ShearBook.

Development setup
-----------------

::

    python3 -m venv .venv
    source .venv/bin/activate
    pip install -e ".[dev]"
    cp .env.example .env   # then put real secrets in .env
    shearbook init-db
    shearbook seed
    shearbook create-admin -u admin -p 'choose-a-password'
    shearbook serve

In two other terminals::

    cd admin && npm install && npm run dev
    cd bot && npm install && npm start

Tests and lint::

    make lint
    make test
    make bot-test
    make admin-test

Guidelines
----------

- Keep the default customer WhatsApp locale German, with English available
  through ``CUSTOMER_LOCALE``.
- Do not add extra Markdown files; use ``.rst`` or ``.txt`` for further docs.
  ``README.md`` is the only Markdown file in the project.
- Do not commit ``.env``, ``credentials/``, session data, or anything that
  identifies a real salon or customer.
- Python code is formatted with Ruff. New API behaviour needs tests.
