# Docker Development Setup

Run RAPID services locally with Docker Compose for development.

## Quick Start

```bash
# Start Redis (required for event bus)
docker compose -f docker-compose.dev.yml up -d redis

# Verify Redis is running
docker compose -f docker-compose.dev.yml ps

# View logs
docker compose -f docker-compose.dev.yml logs -f redis
```

## Services

| Service  | Port | Description                            |
| -------- | ---- | -------------------------------------- |
| redis    | 6379 | Event bus message broker               |
| redis-ui | 8081 | Redis Commander web UI (debug profile) |
| mcp      | 3100 | MCP server (HTTP transport)            |
| gateway  | 4000 | LiteLLM LLM gateway (gateway profile)  |

## Development Profiles

### Minimal (default)

```bash
docker compose -f docker-compose.dev.yml up -d
```

Starts: Redis, MCP server

### With Debug UI

```bash
docker compose -f docker-compose.dev.yml --profile debug up -d
```

Adds: Redis Commander at http://localhost:8081

### With LLM Gateway

```bash
docker compose -f docker-compose.dev.yml --profile gateway up -d
```

Adds: LiteLLM gateway at http://localhost:4000

### Full Stack

```bash
docker compose -f docker-compose.dev.yml --profile debug --profile gateway up -d
```

## Hot Reload

Source directories are mounted for development:

- `packages/rapid-mcp/src` → `/app/packages/rapid-mcp/src`
- `packages/rapid-eventbus/src` → `/app/packages/rapid-eventbus/src`
- `packages/core/src` → `/app/packages/core/src`

Changes to TypeScript files trigger rebuild when using `pnpm dev` locally.

## Environment Variables

Create a `.env` file for API keys:

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
LITELLM_MASTER_KEY=sk-rapid-dev
```

Or use 1Password integration:

```bash
rapid secrets load
source .envrc
docker compose -f docker-compose.dev.yml up -d
```

## Connecting from Host

### Event Bus

```typescript
import { EventBus } from '@a3t/rapid-eventbus';

const bus = new EventBus({
  redis: { url: 'redis://localhost:6379' },
  projectId: 'my-project',
});
await bus.connect();
```

### MCP Server

```bash
curl http://localhost:3100/health
```

## Troubleshooting

### Redis Connection Refused

```bash
# Check if Redis is running
docker compose -f docker-compose.dev.yml ps redis

# Restart Redis
docker compose -f docker-compose.dev.yml restart redis
```

### MCP Health Check Failing

```bash
# Check logs
docker compose -f docker-compose.dev.yml logs mcp

# Rebuild image
docker compose -f docker-compose.dev.yml build mcp
```

### Port Conflicts

```bash
# Check what's using port 6379
lsof -i :6379

# Use alternate ports
REDIS_PORT=6380 docker compose -f docker-compose.dev.yml up -d
```

## Cleanup

```bash
# Stop services
docker compose -f docker-compose.dev.yml down

# Remove volumes (data loss!)
docker compose -f docker-compose.dev.yml down -v

# Remove images
docker compose -f docker-compose.dev.yml down --rmi local
```

## Integration with rapid CLI

The `rapid dev` command automatically:

1. Starts Redis if not running
2. Connects to event bus
3. Registers agents

For manual control:

```bash
# Start services without rapid
docker compose -f docker-compose.dev.yml up -d redis

# Then start development
rapid dev --container=none
```
