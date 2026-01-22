# RAPID Event Bus Connectivity Issue - Diagnosis

## Problem Summary

The RAPID agent orchestrator is failing to connect to the Redis event bus, causing all bus operations to fail with "fetch failed" errors.

## Root Cause

The agent container is configured to connect to Redis at `redis://host.docker.internal:6379`, but this host is not reachable from within the container. The symptoms are:

1. All `mcp__rapid__bus_*` operations fail with "fetch failed"
2. The agent loop continues to restart (iterations 1-9) but cannot register with the bus
3. Multiple defunct Node.js processes indicate repeated crashes/failures
4. No inter-agent communication is possible

## Environment Analysis

### Current State
- **Agent Container**: Running inside Docker (container ID: 35be721b379d)
- **Redis URL**: `redis://host.docker.internal:6379` (from REDIS_URL env var)
- **Network Connectivity**: host.docker.internal not in /etc/hosts, cannot resolve
- **Redis Service**: Not accessible from agent container
- **MCP Server**: Not responding at localhost:3100

### Expected Architecture (from docker-compose.dev.yml)

The RAPID stack should have:

1. **Redis Service** (`rapid-dev-redis`)
   - Image: redis:7-alpine
   - Network: rapid-dev-net
   - Port: 6379
   - Should be accessible as `redis://redis:6379` within the network

2. **MCP Server** (`rapid-dev-mcp`)
   - Build from docker/Dockerfile.mcp
   - Network: rapid-dev-net
   - Port: 3100
   - Depends on Redis
   - Uses `REDIS_URL=redis://redis:6379`

3. **Agent Container** (current container)
   - Should be on the same network to access Redis
   - Currently NOT connected to rapid-dev-net

## Issues Identified

### 1. Network Connectivity
The agent container is not connected to the `rapid-dev-net` Docker network where Redis should be running.

### 2. Redis Service Not Running
Based on the inability to resolve the `redis` hostname, the Redis service from docker-compose is likely not started or not accessible.

### 3. MCP Server Not Running
The MCP server at localhost:3100 is not responding, which is needed for RAPID tool operations.

### 4. Incorrect Redis URL
The agent is trying to use `host.docker.internal:6379` instead of `redis:6379` (the internal Docker network hostname).

## Recommended Fixes

### Option 1: Start the Full RAPID Stack (Recommended)

Start the complete development stack using docker-compose:

```bash
# From the host machine (not inside the agent container)
cd /path/to/rapid
docker compose -f docker-compose.dev.yml up -d

# Check that services are running
docker compose -f docker-compose.dev.yml ps

# View logs
docker compose -f docker-compose.dev.yml logs -f
```

Then ensure the agent container is:
- Connected to the `rapid-dev-net` network, OR
- Updated to use the correct Redis connection string

### Option 2: Update Agent Environment

If running the agent standalone, update the REDIS_URL to point to an accessible Redis instance:

```bash
# Option A: Use a Redis instance accessible from the container
export REDIS_URL=redis://actual-redis-host:6379

# Option B: Run Redis in the same container or as a sidecar
# (not recommended for production)
```

### Option 3: Fix Network Configuration

Connect the agent container to the rapid-dev-net network:

```bash
# From the host machine
docker network connect rapid-dev-net <agent-container-id>
```

## Testing the Fix

After implementing a fix, verify connectivity:

```bash
# Inside the agent container
curl http://redis:6379 2>&1  # Should get Redis protocol response
curl http://localhost:3100/health  # Should return MCP server health status

# Test Redis connectivity with Node.js (if redis-cli not available)
node -e "require('net').connect(6379, 'redis').on('connect', () => console.log('Redis connected!'))"
```

## Next Steps

1. **Immediate**: Determine the intended deployment method (docker-compose vs standalone)
2. **Deploy**: Start the required services (Redis + MCP server)
3. **Configure**: Ensure agent container can reach Redis via correct URL
4. **Verify**: Test bus registration and message passing
5. **Monitor**: Check .rapid/logs/agent.log for successful bus operations

## Related Files

- `/workspace/docker-compose.dev.yml` - Service definitions
- `/workspace/rapid.json` - RAPID configuration
- `/workspace/.rapid/logs/agent.log` - Agent execution logs
- `REDIS_URL` environment variable - Current value: `redis://host.docker.internal:6379`

## Impact

Without a working event bus:
- ❌ No inter-agent communication
- ❌ No task coordination between agents
- ❌ No agent discovery or registration
- ❌ Context sharing and learning disabled
- ❌ Multi-agent workflows cannot function
- ✅ Local agent execution still works (file operations, bash commands)
