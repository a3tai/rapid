# Python Project

## Overview

Python project using modern tooling and best practices.

## Tech Stack

- **Python**: 3.11+
- **Package Manager**: Poetry or pip with pyproject.toml
- **Linting**: Ruff
- **Type Checking**: Pyright/Pylance
- **Testing**: pytest

## Commands

```bash
# Using Poetry
poetry install          # Install dependencies
poetry run python main.py  # Run application
poetry run pytest       # Run tests
poetry run ruff check . # Lint
poetry run ruff format . # Format

# Using pip
pip install -e ".[dev]"
python -m pytest
ruff check .
```

## Code Style

- Use type hints for all function signatures
- Follow PEP 8 naming conventions
- Use dataclasses or Pydantic for data structures
- Prefer `pathlib.Path` over `os.path`
- Use `asyncio` for I/O-bound concurrent operations

## Project Structure

```
src/
├── __init__.py
├── main.py           # Entry point
├── config.py         # Configuration
├── models/           # Data models
├── services/         # Business logic
└── utils/            # Utility functions
tests/
├── conftest.py       # pytest fixtures
├── test_*.py         # Test files
```

## Guidelines

- Run `ruff check .` before committing
- Ensure all tests pass with `pytest`
- Maintain test coverage above 80%
- Use virtual environments
- Document public APIs with docstrings

## Restrictions

- Do not use `print()` for logging - use `logging` module
- Do not ignore type errors - fix them
- Do not use mutable default arguments
- Do not use bare `except:` - catch specific exceptions
