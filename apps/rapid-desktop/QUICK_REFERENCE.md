# RAPID Desktop - Quick Reference (Wails v3)

## Documentation Index

### Architecture & Design
- [WAILS_UI_PROJECT_OVERVIEW.md](docs/designs/WAILS_UI_PROJECT_OVERVIEW.md) - Project summary, features, team assignments
- [wails-ui-complete-design.md](docs/designs/wails-ui-complete-design.md) - 12-section complete design (49KB)
- [WAILS_ARCHITECTURE_VISUALIZATION.md](docs/designs/WAILS_ARCHITECTURE_VISUALIZATION.md) - 9 architecture diagrams
- [IMPLEMENTATION_SUMMARY.md](docs/guides/IMPLEMENTATION_SUMMARY.md) - Phase 1-3 deliverables

### Development Guides
- [wails-developer-quickstart.md](docs/guides/wails-developer-quickstart.md) - Setup and first-time development
- [wails-component-development-guide.md](docs/guides/wails-component-development-guide.md) - Component patterns and examples
- [wails-state-management-patterns.md](docs/guides/wails-state-management-patterns.md) - 10 advanced Zustand patterns

### Production Operations (Phase 6) ← NEW
- **[PRODUCTION_READINESS_SUMMARY.md](docs/guides/PRODUCTION_READINESS_SUMMARY.md)** - Overview of Phase 6 deliverables
- [wails-troubleshooting-guide.md](docs/guides/wails-troubleshooting-guide.md) - 10 major issue categories with solutions
- [wails-production-deployment-checklist.md](docs/guides/wails-production-deployment-checklist.md) - Complete deployment procedures
- [wails-team-collaboration-guide.md](docs/guides/wails-team-collaboration-guide.md) - Team structure, code review, pair programming
- [wails-security-hardening-guide.md](docs/guides/wails-security-hardening-guide.md) - Security best practices and hardening

### Deployment & Release
- [wails-deployment-guide.md](docs/guides/wails-deployment-guide.md) - Multi-platform builds, distribution channels, auto-update
- [.github/workflows/wails-build.yml](../../../.github/workflows/wails-build.yml) - CI/CD pipeline

---

## Component Inventory

### Phase 1-3 Core Components (Complete)
- [ ] ChatMessage - ✓ Display messages with role/timestamp
- [ ] ChatInput - ✓ Text input with Cmd+Enter support
- [ ] TaskBoard - ✓ Kanban board with 4 columns
- [ ] EventFeed - ✓ Real-time event display
- [ ] AgentPanel - ✓ Active agents list
- [ ] ContextBrowser - ✓ Memory type tabs with search

### Phase 4 Advanced Components (Complete)
- [x] ApprovalWorkflow - ✓ HITL approval requests with risk levels
- [x] VirtualList - ✓ Efficient 1000+ item rendering
- [x] SettingsView - ✓ Connection, appearance, advanced settings

### Phase 6 Monitoring (NEW)
- [x] PerformanceMonitor - ✓ Real-time metrics dashboard
  - Memory usage, CPU, response time, error rate tracking
  - 60-second history charts
  - Performance recommendations
  - **Location**: `frontend/src/components/PerformanceMonitor.tsx`

---

## Common Development Tasks

### Setup & Installation
```bash
# One-time setup
./scripts/dev-setup.sh

# Start development
npm run dev

# Build for testing
npm run build

# Build for all platforms
./scripts/build.sh v1.0.0
```

### Testing
```bash
# Run all tests
npm run test

# Run with coverage
npm run test:coverage

# E2E tests
npm run test:e2e

# Type checking
npm run type-check

# Linting
npm run lint
```

### Security
```bash
# Security audit
./scripts/security-audit.sh

# Dependency check
npm audit

# SAST scanning
npm run security:scan
```

### Code Review Checklist
- [ ] Code follows project style
- [ ] All tests passing
- [ ] Type checking passes
- [ ] Linting passes
- [ ] No console.log or debug code
- [ ] No secrets or credentials
- [ ] Performance impact considered
- [ ] Accessibility addressed
- [ ] Documentation updated
- [ ] Commit messages clear

### Git Workflow
```bash
# Create feature branch
git checkout -b feature/RAPID-123-description

# Keep updated with main
git fetch origin
git rebase origin/main

# Push for review
git push -u origin feature/RAPID-123-description

# After approval, merge on GitHub
```

---

## Wails Bindings Quick Reference

### Chat Operations
- `SendMessage(content: string)` → Send chat message
- `GetConversation(limit: number)` → Get message history

### Agent Operations
- `GetAgents()` → List active agents
- `SpawnAgent(persona: string, task: string)` → Start new agent
- `StopAgent(agentId: string)` → Stop agent
- `GetAgentLogs(agentId: string)` → Get agent output

### Task Operations
- `GetTasks()` → List all tasks
- `CreateTask(title: string, priority: string)` → Create task
- `UpdateTask(taskId: string, updates: object)` → Update task
- `AssignTask(taskId: string, agentId: string)` → Assign task

### Approval Operations
- `GetPendingApprovals()` → List approval requests
- `ApproveAction(approvalId: string, reason: string)` → Approve
- `RejectAction(approvalId: string, reason: string)` → Reject

### Context Operations
- `SearchContext(query: string)` → Search knowledge base
- `AddContextEntry(type: string, content: string)` → Add entry
- `DeleteContextEntry(entryId: string)` → Remove entry

### System Operations
- `GetStatus()` → System health
- `ExportLogs()` → Download logs
- `GetEventServerURL()` → WebSocket URL for events

---

## Hook Quick Reference

### useEventStream()
Subscribes to real-time events from daemon
```typescript
const { addEvent, setConnected } = useRapidStore()
useEventStream() // Automatic subscription
```

### useWailsBinding()
Generic hook for calling Wails bindings
```typescript
const { call } = useWailsBinding()
const result = await call<MessageType>('SendMessage', content)
```

### Specialized Hooks
- `useChatBinding()` - SendMessage, GetConversation
- `useAgentBinding()` - GetAgents, SpawnAgent, StopAgent, GetAgentLogs
- `useTaskBinding()` - GetTasks, CreateTask, UpdateTask, AssignTask
- `useApprovalBinding()` - GetPendingApprovals, ApproveAction, RejectAction
- `useContextBinding()` - SearchContext, AddContextEntry, DeleteContextEntry
- `useSystemBinding()` - GetStatus, ExportLogs, GetEventServerURL

---

## Debugging Checklist

### WebSocket Connection Issues
```bash
# Test WebSocket connectivity
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==" \
  -H "Sec-WebSocket-Version: 13" \
  http://localhost:3000/ws

# Check if backend is running
ps aux | grep wails

# View logs
tail -f /var/log/rapid-desktop/app.log
```

### Memory Issues
```bash
# Monitor real-time
top -p $(pgrep -f 'rapid-desktop')

# Check goroutines
curl http://localhost:6060/debug/pprof/goroutine
```

### Performance Issues
```bash
# Bundle size
npm run build:analyze

# Performance test
npm run test:performance

# Chrome DevTools Profiler
# 1. Open DevTools > Performance tab
# 2. Click record, perform action, stop
# 3. Check render times
```

### Code Issues
```bash
# Type errors
npm run type-check

# Linting
npm run lint

# Tests
npm run test

# Comprehensive check
npm run build
```

---

## Performance Thresholds

### Frontend Metrics (Target)
- First paint: < 2 seconds
- Time to Interactive: < 4 seconds
- P99 response time: < 500ms
- Memory per message: < 100 bytes
- Bundle size: < 500KB gzipped
- Lighthouse score: > 90

### Backend Metrics (Target)
- Average response time: < 100ms
- P99 response time: < 500ms
- Memory per event: < 150 bytes
- Memory per goroutine: < 2MB
- Event throughput: > 100/sec
- Goroutine count: < 300

### Monitoring Alerts
- Memory > 80%: Warning
- Memory > 95%: Critical
- Error rate > 5%: Warning
- Response time > 1s: Warning
- Goroutines > 300: Warning

---

## Key Files & Locations

### Frontend
- **Store**: `frontend/src/store/useRapidStore.ts` (4.2KB)
- **Hooks**: `frontend/src/hooks/` (useEventStream, useWailsBinding + 5 specialized)
- **Components**: `frontend/src/components/` (11+ components)
- **Utils**: `frontend/src/utils/` (performance, validation, sanitization)
- **Styles**: `frontend/tailwind.config.js`, `frontend/postcss.config.js`

### Backend
- **Main**: `main.go` (2.9KB) - Wails entry point & WebSocket server
- **Bindings**: `app.go` (8.9KB) - 30+ Wails bindings
- **Event Server**: `pkg/eventserver/server.go` (4.4KB)
- **Daemon Client**: `pkg/client/daemon.go` (8.3KB)

### Configuration
- **Tailwind**: `frontend/tailwind.config.js` - Design system colors
- **Vite**: `frontend/vite.config.ts` - Build configuration
- **TypeScript**: `frontend/tsconfig.json` - Compiler options
- **Go**: `go.mod`, `go.sum` - Go dependencies

### Deployment
- **CI/CD**: `.github/workflows/wails-build.yml` - Multi-platform automation
- **Build Script**: `scripts/build.sh` - Platform-specific builds
- **Dev Setup**: `scripts/dev-setup.sh` - Environment initialization

---

## Team Information

| Role | Responsibility | Time |
|------|-----------------|------|
| Frontend Lead | Component architecture, performance | 40h |
| Backend Integration | Wails bindings, Go code, events | 30h |
| QA/Test | Test strategy, automation, release | 20h |
| Product Designer | UI/UX, design system, feedback | 10h |
| DevOps/Release | CI/CD, deployment, monitoring | 15h |

**Communication:**
- Daily standup: 10:00 AM (15 min)
- Weekly planning: Mon 9:00 AM (30 min)
- Weekly retro: Fri 3:00 PM (30 min)

---

## Troubleshooting Quick Links

**Issue** → **Solution**
- WebSocket won't connect → See `wails-troubleshooting-guide.md` § 1
- Memory keeps growing → See `wails-troubleshooting-guide.md` § 2
- Slow responses → See `wails-troubleshooting-guide.md` § 3
- Agent spawn fails → See `wails-troubleshooting-guide.md` § 4
- Settings lost on restart → See `wails-troubleshooting-guide.md` § 5
- Events stop flowing → See `wails-troubleshooting-guide.md` § 6
- Performance regression → See `wails-troubleshooting-guide.md` § 7
- Emergency restart needed → See `wails-troubleshooting-guide.md` § 8

---

## Release Checklist

Before production deployment:
- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] No ESLint warnings
- [ ] Security audit passed
- [ ] Performance benchmarks met
- [ ] Bundle size acceptable
- [ ] Code coverage > 80%
- [ ] Release notes prepared
- [ ] Deployment checklist completed
- [ ] Team trained and ready
- [ ] Rollback plan tested

**See**: `wails-production-deployment-checklist.md` for full checklist

---

## Code Style Guidelines

**React Components**
- Named exports
- Props interface before component
- Memoize expensive components
- Use hooks for state
- No default exports

**TypeScript**
- Explicit types (no `any`)
- Interfaces for props/state
- Strict mode enabled
- Union types over booleans

**Go**
- Error handling on every call
- Logging for diagnostics
- Input validation before use
- Constants for magic numbers
- Comments on exported functions

**Styling**
- Tailwind classes only
- Dark theme default (#0F172A)
- Brand cyan: #06B6D4
- Utility functions for repeated patterns

---

## Resources

- **GitHub**: https://github.com/rapid/rapid-desktop
- **RAPID Docs**: https://rapid.dev/docs
- **Wails Docs**: https://wails.io
- **React Docs**: https://react.dev
- **Zustand Docs**: https://github.com/pmndrs/zustand
- **Tailwind CSS**: https://tailwindcss.com

---

## Version Information

- **React**: 18.2
- **Zustand**: 4.4.6
- **Wails**: 2.8.1
- **Go**: 1.20+
- **Node**: 18+
- **TypeScript**: 5.0+

---

## Last Updated

Phase 6 Production Readiness - January 2026

**Next Phase**: Advanced integrations and extended features (Phase 7+)
