# Go Project

## Overview

Go project following standard conventions and best practices.

## Tech Stack

- **Go**: 1.22+
- **Linting**: golangci-lint
- **Testing**: go test
- **Hot Reload**: Air

## Commands

```bash
# Run application
go run .

# Build
go build -o bin/app .

# Test
go test ./...

# Test with coverage
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out

# Lint
golangci-lint run

# Hot reload (development)
air
```

## Code Style

- Follow standard Go conventions
- Use `gofmt` / `goimports` for formatting
- Keep functions small and focused
- Use meaningful package names
- Handle all errors explicitly

## Project Structure

```
.
├── cmd/              # Application entry points
│   └── app/
│       └── main.go
├── internal/         # Private application code
│   ├── config/
│   ├── handlers/
│   └── services/
├── pkg/              # Public library code
├── api/              # API definitions (OpenAPI, proto)
└── scripts/          # Build and utility scripts
```

## Guidelines

- Run `golangci-lint run` before committing
- Ensure all tests pass with `go test ./...`
- Use `context.Context` for cancellation
- Prefer composition over inheritance
- Use interfaces for dependencies

## Error Handling

```go
// Always handle errors
result, err := doSomething()
if err != nil {
    return fmt.Errorf("doSomething failed: %w", err)
}
```

## Restrictions

- Do not use `panic()` for error handling
- Do not ignore errors with `_`
- Do not use global state
- Do not use `init()` functions unless necessary
