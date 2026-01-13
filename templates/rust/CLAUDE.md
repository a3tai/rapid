# Rust Project

## Overview

Rust project following idiomatic patterns and best practices.

## Tech Stack

- **Rust**: Stable toolchain
- **Build**: Cargo
- **Linting**: Clippy
- **Formatting**: rustfmt

## Commands

```bash
# Build
cargo build

# Build release
cargo build --release

# Run
cargo run

# Test
cargo test

# Lint
cargo clippy

# Format
cargo fmt

# Check (fast compile check)
cargo check

# Documentation
cargo doc --open
```

## Code Style

- Follow Rust API guidelines
- Use `rustfmt` for formatting
- Address all `clippy` warnings
- Prefer `Result` over `panic!`
- Use meaningful error types

## Project Structure

```
src/
├── main.rs           # Binary entry point
├── lib.rs            # Library entry point
├── config.rs         # Configuration
├── error.rs          # Error types
└── modules/          # Feature modules
tests/
├── integration/      # Integration tests
```

## Guidelines

- Run `cargo clippy` before committing
- Ensure all tests pass with `cargo test`
- Document public APIs with `///` doc comments
- Use `#[derive]` for common traits
- Prefer owned types in public APIs

## Error Handling

```rust
// Use Result for fallible operations
fn process_data(input: &str) -> Result<Output, Error> {
    let parsed = parse(input)?;
    let result = transform(parsed)?;
    Ok(result)
}
```

## Restrictions

- Do not use `unwrap()` in library code
- Do not use `unsafe` without justification
- Do not ignore compiler warnings
- Do not use `println!` for logging - use `tracing` or `log`
