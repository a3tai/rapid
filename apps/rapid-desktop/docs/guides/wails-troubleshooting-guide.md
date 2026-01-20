# Wails UI - Production Troubleshooting Guide

## Overview

This guide provides comprehensive troubleshooting procedures for production Wails UI deployments. It covers common issues, diagnostic procedures, and resolution strategies.

---

## 1. WebSocket Connection Issues

### Symptom: "WebSocket connection failed" in browser console

**Root causes:**
- Event server not started
- Port already in use
- Firewall blocking connection
- Incorrect WebSocket URL

**Diagnostic steps:**

```bash
# Check if Go backend is running
ps aux | grep -i wails

# Verify event server is listening
netstat -tuln | grep LISTEN | grep -E ':(3000|3001|3002)'

# Check application logs
tail -f /var/log/rapid-desktop/app.log

# Test WebSocket connectivity
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==" \
  -H "Sec-WebSocket-Version: 13" \
  http://localhost:3000/ws
```

**Resolution:**

```typescript
// In frontend/src/hooks/useEventStream.ts
// Add detailed error logging:
const useEventStream = () => {
  useEffect(() => {
    const connectWebSocket = async () => {
      try {
        const url = await window.runtime.Call('GetEventServerURL');
        console.log('Connecting to WebSocket:', url);
        const ws = new WebSocket(url);

        ws.onerror = (error) => {
          console.error('WebSocket error:', {
            message: error.message,
            type: error.type,
            timestamp: new Date().toISOString()
          });
          // Trigger retry logic
        };
      } catch (error) {
        console.error('Failed to get WebSocket URL:', error);
      }
    };
    connectWebSocket();
  }, []);
};
```

**In Go backend (main.go):**

```go
// Add connection logging
func (es *EventServer) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[ERROR] WebSocket upgrade failed: %v", err)
		http.Error(w, "upgrade failed", http.StatusInternalServerError)
		return
	}
	defer ws.Close()

	client := &Client{send: make(chan interface{}, 256)}
	es.register <- client

	log.Printf("[INFO] WebSocket client connected from %s", r.RemoteAddr)

	go client.writePump(ws)
	client.readPump(ws)

	log.Printf("[INFO] WebSocket client disconnected from %s", r.RemoteAddr)
}
```

---

## 2. High Memory Usage

### Symptom: Application memory grows over time, crashes after hours of operation

**Root causes:**
- Message buffer overflow
- Goroutine leaks in event server
- React component memory leaks
- Virtual list not properly cleaning up
- Store state growing unbounded

**Diagnostic steps:**

```bash
# Monitor memory in real-time
top -p $(pgrep -f 'rapid-desktop') -o PID,%CPU,%MEM,VIRT,RES,COMM

# Check goroutine count
curl http://localhost:6060/debug/pprof/goroutine > goroutines.txt

# Capture heap profile
curl http://localhost:6060/debug/pprof/heap > heap.prof
go tool pprof heap.prof
```

**In React frontend, add memory profiling:**

```typescript
// frontend/src/utils/performance.ts - Extended
export class MemoryProfiler {
  static startMonitoring(threshold = 100) {
    setInterval(() => {
      if (performance.memory) {
        const { usedJSHeapSize, jsHeapSizeLimit } = performance.memory;
        const percentUsed = (usedJSHeapSize / jsHeapSizeLimit) * 100;

        console.log(`Memory: ${(usedJSHeapSize / 1024 / 1024).toFixed(2)}MB / ${(jsHeapSizeLimit / 1024 / 1024).toFixed(2)}MB (${percentUsed.toFixed(1)}%)`);

        if (percentUsed > threshold) {
          console.warn(`[ALERT] Memory usage at ${percentUsed.toFixed(1)}%`);
        }
      }
    }, 5000);
  }

  static getHeapSnapshot() {
    return performance.memory;
  }
}

// Start monitoring in App.tsx
useEffect(() => {
  MemoryProfiler.startMonitoring(85); // Alert at 85%
}, []);
```

**In Go backend (pkg/eventserver/server.go):**

```go
// Add message buffer management
type EventServer struct {
	clients      map[*Client]bool
	broadcast    chan SystemEvent
	register     chan *Client
	unregister   chan *Client
	maxClients   int
	bufferSize   int
	metricsCheck ticker
}

// Prevent unbounded growth
func (es *EventServer) Start(ctx context.Context) error {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			numClients := len(es.clients)
			log.Printf("[METRICS] Connected clients: %d, Goroutines: %d",
				numClients, runtime.NumGoroutine())

			// Alert if goroutines growing
			if runtime.NumGoroutine() > 500 {
				log.Printf("[WARNING] High goroutine count: %d", runtime.NumGoroutine())
			}
		// ... rest of event handling
		}
	}
}
```

**Resolution - Cleanup strategies:**

```typescript
// Add cleanup to useEventStream hook
useEffect(() => {
  let messageBuffer: SystemEvent[] = [];
  const batchSize = 50;

  const flushMessages = () => {
    if (messageBuffer.length > 0) {
      addEvents(messageBuffer.splice(0, batchSize));
    }
  };

  const flushInterval = setInterval(flushMessages, 5000);

  return () => {
    clearInterval(flushInterval);
    flushMessages(); // Flush remaining
  };
}, []);

// Implement message retention policy
const useRapidStore = create<RapidStore>((set) => ({
  // ... existing code
  addEvent: (event: SystemEvent) => set((state) => {
    const events = [event, ...state.events];
    // Keep only last 10000 events
    return {
      events: events.slice(0, 10000)
    };
  })
}));
```

---

## 3. Slow Response Times

### Symptom: UI takes >2 seconds to respond to user actions, event stream laggy

**Root causes:**
- Unoptimized component re-renders
- Large message payloads
- Blocking operations in event handler
- Virtual scroll not working properly
- Zustand selectors causing unnecessary re-renders

**Diagnostic procedure:**

```bash
# Profile React performance (in browser DevTools)
# 1. Open Chrome DevTools > Profiler
# 2. Click record, perform action, stop
# 3. Check which components took longest to render

# Check network latency
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000
# Create curl-format.txt:
# ============================================================
#     time_namelookup:  %{time_namelookup}s
#        time_connect:  %{time_connect}s
#     time_appconnect:  %{time_appconnect}s
#    time_pretransfer:  %{time_pretransfer}s
#       time_redirect:  %{time_redirect}s
# time_starttransfer:  %{time_starttransfer}s
#                      ----------
#         time_total:  %{time_total}s
```

**React Performance Optimization:**

```typescript
// frontend/src/components/EventFeed.tsx - Memoize with selector splitting
import { memo } from 'react';
import { useShallow } from 'zustand/react';

// Split selectors to prevent unnecessary re-renders
export const EventFeed = memo(() => {
  const events = useRapidStore(useShallow(state => state.events));
  const autoScroll = useRapidStore(state => state.ui.eventAutoScroll);

  return (
    <div className="event-feed">
      {events.map(event => (
        <EventItem key={event.id} event={event} />
      ))}
    </div>
  );
});

EventFeed.displayName = 'EventFeed';

// Memoize event item component
const EventItem = memo(({ event }: { event: SystemEvent }) => (
  <div className="event-item">
    {/* Event content */}
  </div>
));

EventItem.displayName = 'EventItem';
```

**Go backend optimization:**

```go
// Batch messages to reduce allocation pressure
type MessageBatcher struct {
	messages []SystemEvent
	maxSize  int
	ch       chan []SystemEvent
	mu       sync.Mutex
}

func (mb *MessageBatcher) Add(msg SystemEvent) {
	mb.mu.Lock()
	defer mb.mu.Unlock()

	mb.messages = append(mb.messages, msg)
	if len(mb.messages) >= mb.maxSize {
		go func() {
			mb.ch <- mb.messages
			mb.messages = make([]SystemEvent, 0, mb.maxSize)
		}()
	}
}

// Use in event broadcasting
func (es *EventServer) PublishEvent(event SystemEvent) {
	select {
	case es.broadcast <- event:
	case <-time.After(5 * time.Second):
		log.Printf("[WARNING] Broadcast channel blocked")
	}
}
```

---

## 4. Agent Communication Failures

### Symptom: "Failed to spawn agent", "RPC call timeout", agent operations hang

**Root causes:**
- Daemon not responding
- RPC call timeout too short
- Network partition
- Daemon out of memory
- Agent process crashed

**Diagnostic steps:**

```bash
# Check if RAPID daemon is running
rapid status

# Check daemon logs
tail -f ~/.rapid/daemon.log

# Test RPC connectivity
curl -X POST http://localhost:9000/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "GetAgents",
    "params": [],
    "id": 1
  }'

# Monitor daemon process
watch -n 1 'ps aux | grep rapid'
```

**Enhanced error handling in Go bindings (app.go):**

```go
func (a *App) SpawnAgent(persona string, task string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	log.Printf("[INFO] Spawning agent: persona=%s, task=%s", persona, task)

	response, err := a.daemonClient.call(ctx, "PersonaSpawn", map[string]interface{}{
		"name": persona,
		"task": task,
	})

	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			log.Printf("[ERROR] RPC timeout: PersonaSpawn exceeded 30s")
			return "", fmt.Errorf("agent spawn timeout: daemon not responding")
		}
		log.Printf("[ERROR] RPC failed: %v", err)
		return "", fmt.Errorf("agent spawn failed: %w", err)
	}

	agentID := response.(map[string]interface{})["agent_id"].(string)

	// Publish event
	a.eventServer.PublishEvent(SystemEvent{
		ID:        uuid.New().String(),
		Type:      "completion",
		Title:     "Agent spawned",
		Content:   fmt.Sprintf("Spawned %s agent: %s", persona, agentID),
		Timestamp: time.Now().Unix(),
	})

	return agentID, nil
}
```

**Frontend error handling (hooks/useAgentBinding.ts):**

```typescript
export function useAgentBinding() {
  const { call } = useWailsBinding();

  return {
    spawnAgent: async (persona: string, task: string) => {
      try {
        const result = await call<{ agentId: string }>('SpawnAgent', persona, task);
        return result.agentId;
      } catch (error) {
        if (error.message.includes('timeout')) {
          throw new Error('Agent spawn timed out. Daemon may be unresponsive.');
        }
        throw error;
      }
    },

    stopAgent: async (agentId: string) => {
      try {
        await call('StopAgent', agentId);
      } catch (error) {
        throw new Error(`Failed to stop agent: ${error.message}`);
      }
    },

    getAgentLogs: async (agentId: string) => {
      try {
        return await call<string>('GetAgentLogs', agentId);
      } catch (error) {
        throw new Error(`Failed to fetch logs: ${error.message}`);
      }
    }
  };
}
```

---

## 5. Data Persistence Issues

### Symptom: Settings lost after restart, task data not syncing, context entries disappearing

**Root causes:**
- localStorage full or disabled
- Context engine not writing to disk
- Race conditions in save operations
- Missing write permissions

**Resolution - Implement robust persistence:**

```typescript
// frontend/src/utils/storage.ts - New utility module
export class PersistenceManager {
  private static readonly STORAGE_KEYS = {
    SETTINGS: 'rapid-settings',
    TASKS: 'rapid-tasks',
    CONTEXT: 'rapid-context-cache',
    UI_STATE: 'rapid-ui-state'
  };

  static saveWithBackup<T>(key: string, data: T): void {
    try {
      // Check available space
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);

      const json = JSON.stringify(data);
      const backupKey = `${key}-backup`;

      // Save existing as backup
      const existing = localStorage.getItem(key);
      if (existing) {
        localStorage.setItem(backupKey, existing);
      }

      // Save new data
      localStorage.setItem(key, json);
      console.log(`[Storage] Saved ${key}`);
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.error('[Storage] localStorage full - attempting cleanup');
        this.pruneOldData();
        // Retry once
        localStorage.setItem(key, JSON.stringify(data));
      } else {
        console.error('[Storage] Save failed:', error);
      }
    }
  }

  static loadWithFallback<T>(key: string, fallback: T): T {
    try {
      const data = localStorage.getItem(key);
      if (!data) {
        // Try backup
        const backupData = localStorage.getItem(`${key}-backup`);
        if (backupData) {
          return JSON.parse(backupData);
        }
        return fallback;
      }
      return JSON.parse(data);
    } catch (error) {
      console.error(`[Storage] Load failed for ${key}:`, error);
      // Try backup
      const backupData = localStorage.getItem(`${key}-backup`);
      if (backupData) {
        try {
          return JSON.parse(backupData);
        } catch { }
      }
      return fallback;
    }
  }

  private static pruneOldData(): void {
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('rapid-')) continue;

      try {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        if (data.timestamp && now - data.timestamp > maxAge) {
          localStorage.removeItem(key);
          console.log(`[Storage] Pruned old entry: ${key}`);
        }
      } catch { }
    }
  }
}

// Use in Zustand store
export const useRapidStore = create<RapidStore>(
  persist(
    (set) => ({
      // ... store definition
    }),
    {
      name: 'rapid-store',
      storage: {
        getItem: (name) => {
          return PersistenceManager.loadWithFallback(name, null);
        },
        setItem: (name, value) => {
          PersistenceManager.saveWithBackup(name, value);
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
          localStorage.removeItem(`${name}-backup`);
        }
      }
    }
  )
);
```

---

## 6. Context Bus Connection Loss

### Symptom: Events stop flowing, UI shows "Disconnected" status for extended period

**Root causes:**
- Network interruption
- Event bus Redis connection dropped
- WebSocket connection dropped
- Daemon crashed

**Resolution - Implement auto-recovery:**

```typescript
// frontend/src/hooks/useEventStream.ts - Enhanced
export function useEventStream() {
  const { addEvent, setConnected } = useRapidStore();
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const MAX_RETRIES = 5;
  const reconnectDelay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connect = async () => {
      try {
        const wsURL = await window.runtime.Call('GetEventServerURL');

        ws = new WebSocket(wsURL);

        ws.onopen = () => {
          console.log('[WebSocket] Connected');
          setConnected(true);
          setReconnectAttempts(0);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            addEvent(data);
          } catch (error) {
            console.error('[WebSocket] Failed to parse message:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('[WebSocket] Error:', error);
          setConnected(false);
        };

        ws.onclose = () => {
          console.log('[WebSocket] Disconnected');
          setConnected(false);

          // Attempt reconnect
          if (reconnectAttempts < MAX_RETRIES) {
            console.log(`[WebSocket] Reconnecting in ${reconnectDelay}ms (attempt ${reconnectAttempts + 1}/${MAX_RETRIES})`);
            reconnectTimeout = setTimeout(() => {
              setReconnectAttempts(prev => prev + 1);
              connect();
            }, reconnectDelay);
          } else {
            console.error('[WebSocket] Max reconnection attempts reached');
            toast.error('Lost connection to RAPID daemon. Please restart the application.');
          }
        };
      } catch (error) {
        console.error('[WebSocket] Connection failed:', error);
        setConnected(false);
        setReconnectAttempts(prev => prev + 1);
      }
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [addEvent, setConnected, reconnectAttempts]);
}
```

---

## 7. Performance Regression Detection

### Procedure: Establish baseline and detect regressions

**Create benchmark suite (frontend/src/__tests__/performance.test.ts):**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryProfiler } from '../utils/performance';

describe('Performance Benchmarks', () => {
  let startMem: number;

  beforeEach(() => {
    startMem = performance.memory?.usedJSHeapSize || 0;
  });

  it('should render 1000 messages without memory leak', () => {
    const store = useRapidStore.getState();

    for (let i = 0; i < 1000; i++) {
      store.addMessage({
        id: `msg-${i}`,
        content: `Message ${i}`,
        role: 'assistant',
        timestamp: Date.now()
      });
    }

    const endMem = performance.memory?.usedJSHeapSize || 0;
    const growth = endMem - startMem;
    const perMessage = growth / 1000;

    console.log(`Memory growth: ${(growth / 1024 / 1024).toFixed(2)}MB for 1000 messages`);
    console.log(`Per-message overhead: ${(perMessage / 1024).toFixed(2)}KB`);

    // Should not exceed 5MB for 1000 messages
    expect(growth).toBeLessThan(5 * 1024 * 1024);
  });

  it('should handle rapid event updates', async () => {
    const startTime = performance.now();
    const store = useRapidStore.getState();

    for (let i = 0; i < 500; i++) {
      store.addEvent({
        id: `evt-${i}`,
        type: 'discovery',
        title: `Event ${i}`,
        content: 'Test event',
        timestamp: Date.now()
      });
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    console.log(`500 events processed in ${duration.toFixed(2)}ms`);

    // Should complete in < 500ms
    expect(duration).toBeLessThan(500);
  });
});
```

**Baseline measurements:**
- Message rendering: <2ms per 100 messages
- Event processing: <1ms per 100 events
- Memory per message: <100 bytes
- Memory per event: <150 bytes
- Initial bundle size: <500KB gzipped
- First paint: <2 seconds

---

## 8. Emergency Procedures

### Hard Restart Procedure

```bash
#!/bin/bash
# scripts/emergency-restart.sh

echo "Performing emergency restart..."

# Kill all rapid processes
pkill -f rapid-desktop
pkill -f wails
pkill -f "daemon"

# Wait for graceful shutdown
sleep 2

# Clear stale connections
lsof +D ~/.rapid | awk 'NR>1 {print $2}' | xargs kill -9 2>/dev/null || true

# Clear local storage
rm -rf ~/.rapid/cache/*

# Restart application
rapid dev &

echo "Emergency restart complete. Application starting..."
```

### Factory Reset Procedure

```bash
#!/bin/bash
# scripts/factory-reset.sh

echo "WARNING: This will delete all local data. Type 'yes' to confirm."
read -r CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Cancelled"
  exit 1
fi

# Back up current state
mkdir -p ~/.rapid/backups
cp -r ~/.rapid ~/.rapid/backups/backup-$(date +%s)

# Clear all data
rm -rf ~/.rapid/cache/*
rm -rf ~/.rapid/context/*
rm -rf ~/.rapid/logs/*

# Reset localStorage
# Note: Manual in browser - DevTools > Application > Local Storage > Clear All

echo "Factory reset complete. Please restart the application."
```

---

## 9. Monitoring Checklist

Daily monitoring tasks:

- [ ] Check memory usage trends (should stay <500MB)
- [ ] Verify no increase in goroutine count over time
- [ ] Review error logs for recurring patterns
- [ ] Test WebSocket connectivity
- [ ] Verify backup jobs completed successfully
- [ ] Check daemon restart count (should be 0)

---

## 10. Support Contact

For additional support:
- GitHub Issues: https://github.com/rapid/rapid-desktop/issues
- Documentation: https://rapid.dev/docs
- Community Slack: https://rapid.slack.com

