# Contributing

Thanks for your interest in contributing! This document is a template —
replace the placeholders with the project's actual conventions.

## Getting started

1. Clone the repository.
2. Create a virtual environment and activate it:

   ```bash
   python -m venv .venv
   .venv\Scripts\Activate.ps1    # Windows (PowerShell)
   source .venv/bin/activate     # macOS / Linux
   ```

3. Install the project and dev tooling:

   ```bash
   pip install -r requirements-dev.txt
   pip install -e .
   ```

## Making changes

- Create a branch: `git checkout -b <type>/<short-description>` — e.g. `feat/add-login`.
- Keep changes focused; one logical change per pull request.
- Add or update tests for any behaviour you change (`tests/`).
- Run the checks before committing:

  ```bash
  pytest         # tests
  ruff check .   # lint
  mypy src       # type check
  ```

## Commit messages

<!-- TODO: adopt a convention, e.g. Conventional Commits -->

`<type>: <short summary>` — e.g. `feat: add registration flow`

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`.

## Pull requests

<!-- TODO: PR checklist, review policy, CI requirements -->

- Describe **what** changed and **why**.
- Link any related issues.

## Reporting bugs / suggesting features

Open an issue at <https://github.com/bob-the-doorknob/placeholder-name/issues>
and include steps to reproduce, expected vs actual behaviour, and environment
details.
