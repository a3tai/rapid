# Contributing to RAPID

We appreciate your interest in contributing to RAPID! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to treat all contributors with respect and kindness. We're committed to providing a welcoming environment for everyone.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+
- Docker Desktop
- devcontainer CLI: `npm install -g @devcontainers/cli`

### Setup

```bash
# Clone the repository
git clone https://github.com/a3tai/rapid.git
cd rapid

# Install dependencies
pnpm install

# Build packages
pnpm build

# Run tests
pnpm test
```

## Development Workflow

### Branch Naming

Use descriptive branch names following this pattern:

- `feat/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code refactoring
- `docs/description` - Documentation updates
- `chore/description` - Maintenance tasks

### Making Changes

1. Create a new branch from `main`
2. Make your changes following our code style
3. Add tests for new functionality
4. Update documentation as needed
5. Commit with clear, descriptive messages

### Code Style

```bash
# Format code
pnpm format

# Run linter
pnpm lint

# Type check
pnpm typecheck
```

### Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test -- --watch

# Coverage report
pnpm test -- --coverage
```

## Commit Guidelines

We follow conventional commit messages:

```
feat: add new feature
fix: resolve bug
docs: update documentation
refactor: improve code structure
test: add test coverage
chore: maintenance tasks
```

### Git Signing

All commits must be signed with GPG:

```bash
# Set up signing key
git config --global user.signingKey YOUR_KEY_ID
git config --global commit.gpgsign true

# Or sign individual commits
git commit -S -m "commit message"
```

## Pull Request Process

1. **Update from main**: Rebase your branch on the latest main
2. **Run checks locally**: Ensure all tests pass and linter is happy
3. **Open PR**: Use a clear title and description
4. **Pass CI**: All automated checks must pass
5. **Code review**: Address feedback from reviewers
6. **Squash merge**: Final PR merges are squashed

### PR Description Template

```markdown
## Summary

[1-3 sentences about what this PR does]

## Changes

- [ ] Feature 1
- [ ] Feature 2
- [ ] Fix 1

## Testing

[How to test these changes]

## Related Issues

Closes #123
```

## Package Structure

### Core Packages

- **@a3t/rapid-core** - Core functionality (config, containers, agents)
- **@a3t/rapid** - CLI tool
- **@a3t/rapid-schema** - JSON schema and types
- **@a3t/rapid-docs** - Documentation

### Before Publishing

1. Update version in package.json and CHANGELOG
2. Update documentation
3. Run full test suite: `pnpm test`
4. Ensure no secrets are exposed: `rg "sk-|pk-|ghp_"`

## Documentation

- Keep README.md updated
- Document new commands in [docs/guides/cli-reference.md](./docs/guides/cli-reference.md)
- Update type definitions with JSDoc comments
- Add examples to documentation

## Reporting Issues

### Bug Reports

Include:

- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment (OS, Node version, etc.)

### Feature Requests

Include:

- Use case and motivation
- Proposed solution
- Alternative approaches considered

## Project Structure

```
rapid/
├── apps/docs/               # Documentation site (Astro)
├── packages/
│   ├── cli/                 # CLI tool
│   ├── core/                # Core library
│   ├── schema/              # JSON schema
│   └── preview-proxy/       # Cloudflare Pages proxy
├── templates/               # Project templates
├── docs/                    # Markdown documentation
└── .github/                 # GitHub workflows and config
```

## Performance Considerations

- Keep type checking fast - avoid complex generics
- Minimize dependencies
- Profile CLI performance: `time rapid dev`
- Test with large monorepos

## Security

- **Never commit secrets** to any branch
- Use environment variables for sensitive data
- Keep dependencies updated
- Report security issues privately to maintainers

## Questions?

- Open a [GitHub Discussion](https://github.com/a3tai/rapid/discussions)
- Check existing [documentation](./docs)
- Review [issues](https://github.com/a3tai/rapid/issues) for similar questions

## License

All contributions are licensed under the MIT License.

---

Thank you for contributing to RAPID! 🚀
