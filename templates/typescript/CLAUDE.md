# TypeScript Project

## Overview

TypeScript/Node.js project using modern tooling and best practices.

## Tech Stack

- **Runtime**: Node.js 20 LTS
- **Language**: TypeScript 5.x
- **Package Manager**: pnpm (preferred), npm, yarn
- **Linting**: ESLint with TypeScript support
- **Formatting**: Prettier

## Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm dev

# Build
pnpm build

# Test
pnpm test

# Lint
pnpm lint

# Type check
pnpm typecheck
```

## Code Style

- Use `async/await` for asynchronous operations
- Prefer named exports over default exports
- Use strict TypeScript configuration
- Add JSDoc comments to public functions
- Use Zod or similar for runtime validation

## Project Structure

```
src/
├── index.ts          # Entry point
├── config/           # Configuration
├── lib/              # Core library code
├── utils/            # Utility functions
└── types/            # TypeScript type definitions
```

## Guidelines

- Run `pnpm lint` before committing
- Ensure all tests pass with `pnpm test`
- Keep functions small and focused
- Use meaningful variable and function names
- Handle errors explicitly

## Restrictions

- Do not modify `tsconfig.json` without discussion
- Do not add dependencies without justification
- Do not disable TypeScript strict mode
- Do not use `any` type - use `unknown` if needed
