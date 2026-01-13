# Universal Project

## Overview

Multi-language development environment with support for TypeScript, Python, Go, and Rust.

## Available Languages

| Language | Version | Package Manager |
|----------|---------|-----------------|
| Node.js/TypeScript | 20 LTS | npm, pnpm, yarn |
| Python | 3.11 | pip, poetry |
| Go | 1.22 | go modules |
| Rust | stable | cargo |

## Common Commands

### Node.js/TypeScript
```bash
npm install && npm run dev
pnpm install && pnpm dev
```

### Python
```bash
pip install -e . && python main.py
poetry install && poetry run python main.py
```

### Go
```bash
go mod tidy && go run .
```

### Rust
```bash
cargo build && cargo run
```

## Guidelines

- Use the appropriate language for the task
- Follow each language's conventions
- Keep dependencies minimal
- Write tests for all languages used

## Project Structure

```
.
├── src/              # Source code (language-specific subdirs)
├── scripts/          # Build and utility scripts
├── docs/             # Documentation
└── tests/            # Test files
```

## Restrictions

- Do not mix languages unnecessarily
- Keep each language's code in separate directories
- Use consistent error handling patterns across languages
