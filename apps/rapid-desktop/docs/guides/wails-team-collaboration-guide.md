# Wails UI - Team Collaboration & Development Workflow

## Overview

This guide establishes best practices for collaborative development on the RAPID Wails UI project, including pair programming, code review, branching strategy, and team communication.

---

## 1. Team Structure & Responsibilities

### Core Roles

| Role                         | Responsibilities                                                        | Typical Time |
| ---------------------------- | ----------------------------------------------------------------------- | ------------ |
| **Frontend Lead**            | Architecture decisions, component design, performance optimization      | 40h/week     |
| **Backend Integration Lead** | Wails bindings, Go code, event server, daemon communication             | 30h/week     |
| **QA/Test Lead**             | Test strategy, test automation, performance testing, release validation | 20h/week     |
| **Product Designer**         | UI/UX decisions, design system maintenance, user feedback integration   | 10h/week     |
| **DevOps/Release**           | CI/CD, deployment automation, monitoring setup                          | 15h/week     |

### Team Communication

**Synchronous Channels:**

- Daily standup: 10:00 AM (15 minutes)
- Weekly planning: Monday 9:00 AM (30 minutes)
- Weekly retrospective: Friday 3:00 PM (30 minutes)

**Asynchronous Channels:**

- #wails-ui: General questions and discussion
- #wails-ui-design: Design and UI decisions
- #wails-ui-deployment: Release and deployment coordination
- GitHub Issues: Feature tracking and bugs

---

## 2. Branching Strategy (Git Flow)

### Branch Naming Conventions

```
main                      # Production-ready code
  ├── feature/[ISSUE]    # New features
  ├── bugfix/[ISSUE]     # Bug fixes
  ├── hotfix/[ISSUE]     # Critical production fixes
  └── docs/[TASK]        # Documentation updates
```

**Examples:**

- `feature/RAPID-123-approval-workflow`
- `bugfix/RAPID-456-websocket-reconnect`
- `hotfix/RAPID-789-memory-leak`
- `docs/deployment-guide`

### Branch Rules

- [ ] Branches must have descriptive names
- [ ] All branches created from `main`
- [ ] Branches deleted after merge
- [ ] Protected branch requiring PR review
- [ ] All checks must pass before merge
- [ ] Linear history preferred

### Creating a Feature Branch

```bash
# Update main
git checkout main
git pull origin main

# Create feature branch
git checkout -b feature/RAPID-123-approval-workflow

# Work on feature
# ...

# Keep branch updated
git fetch origin
git rebase origin/main

# Push to remote
git push -u origin feature/RAPID-123-approval-workflow

# Create PR via GitHub
```

---

## 3. Code Review Process

### Review Checklist (Before Requesting Review)

- [ ] Code follows project style guidelines
- [ ] All tests passing locally
- [ ] Type checking passes (`npm run type-check`)
- [ ] Linting passes (`npm run lint`)
- [ ] No console.log or debug code
- [ ] No credentials or secrets in code
- [ ] Performance impact considered
- [ ] Accessibility considerations addressed
- [ ] Documentation updated
- [ ] Commit messages clear and descriptive

### Creating a Pull Request

```markdown
## Description

Brief description of what this PR does and why.

## Related Issues

Closes #123

## Type of Change

- [x] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## How Has This Been Tested?

Describe test coverage and manual testing performed.

## Screenshots (if applicable)

[Attach screenshots for UI changes]

## Performance Impact

- [ ] No performance impact
- [ ] Improves performance
- [ ] Possible performance impact (describe)

## Checklist

- [x] Code follows project style
- [x] Tests pass locally
- [x] No new console warnings
- [x] Documentation updated
```

### Code Review Standards

**Code reviewers should check:**

1. **Correctness**
   - Logic is sound
   - Edge cases handled
   - No obvious bugs
   - Tests cover happy path and errors

2. **Code Quality**
   - Follows project conventions
   - No unnecessary complexity
   - Functions have single responsibility
   - Proper error handling

3. **Performance**
   - No performance regressions
   - Efficient algorithms
   - Appropriate memoization used
   - No unnecessary re-renders (React)

4. **Security**
   - No security vulnerabilities
   - Input validation present
   - No secrets in code
   - Dependencies are secure

5. **Testing**
   - Adequate test coverage
   - Tests are meaningful
   - Edge cases tested
   - Performance implications tested

### Review Comments Examples

**Good:**

```
The component will re-render on every state change here. Consider using
useCallback for the handler function to prevent unnecessary re-renders
of child components. See: https://react.dev/reference/react/useCallback
```

**Constructive:**

```
I notice the error handling here only catches network errors. What about
timeout or JSON parsing errors? We might want to add specific handling
for those cases, similar to how we handle them in ChatInput.
```

**Collaborative:**

```
I'm not familiar with this pattern. Can you explain the reasoning?
Is this a common pattern in the Wails community, or something you've
developed specifically?
```

### Review Timelines

- Standard PR: Review within 24 hours
- Urgent/Hotfix: Review within 2 hours
- Documentation: Review within 48 hours
- Feature freeze period: Extra scrutiny

### Approval Requirements

- [ ] At least 1 approval from frontend team
- [ ] At least 1 approval from backend team (if backend changes)
- [ ] At least 1 approval from QA (if tests modified)
- [ ] All CI checks passing
- [ ] Conflicts resolved with main

---

## 4. Pair Programming

### When to Pair Program

- Complex architectural decisions
- Onboarding new team members
- Debugging difficult issues
- Performance optimization work
- Security-critical features

### Pair Programming Setup

**Remote Pair Programming:**

1. **Using VS Code Live Share**

   ```bash
   # Host (Sharer)
   # Install VS Code Live Share extension
   # Click Live Share icon > Start collaboration session
   # Share link with partner

   # Guest (Joiner)
   # Click Live Share icon > Join collaboration session
   # Enter shared link
   ```

2. **Alternative: tmux + SSH**

   ```bash
   # On host machine
   tmux new-session -s rapid-dev
   ssh-keygen -t ed25519 -f ~/.ssh/rapid_dev
   # Share SSH key with pair

   # On guest machine
   ssh -i ~/.ssh/rapid_dev user@host
   tmux attach-session -t rapid-dev
   ```

3. **Terminal Sharing with Stream**
   - Host shares screen via Zoom/Google Meet
   - Guest observes and provides direction
   - Swap roles periodically

### Pair Programming Rules

- **Driver**: Controls keyboard/mouse, implements
- **Navigator**: Observes, suggests, catches errors
- **Swap every 15-30 minutes** to maintain engagement
- **Take breaks**: 50 min work / 10 min break
- **Keep communication active**: Explain decisions verbally
- **Document decisions**: Add comments to complex code sections

### Pair Programming Session Template

```markdown
## Pair Programming Session

Date: 2024-XX-XX
Time: 2 hours
Participants: Alice (Driver/Navigator), Bob (Navigator/Driver)

### Objectives

1. Implement approval workflow component
2. Debug WebSocket reconnection issue
3. Review performance benchmarks

### Segments

- 10:00-10:30 (Driver: Alice) - Component structure setup
- 10:30-11:00 (Driver: Bob) - Event handling logic
- 11:00-11:15 Break
- 11:15-11:45 (Driver: Bob) - WebSocket debugging
- 11:45-12:00 (Driver: Alice) - Code review & cleanup

### Outcomes

- Approval component 80% complete
- WebSocket bug identified (race condition)
- Created performance regression test

### Next Steps

- Complete component implementation (Alice)
- Deploy WebSocket fix (Bob)
- Review PR #234 (Both)
```

---

## 5. Collaborative Development Workflows

### Feature Development Workflow

```
┌──────────────────────────────────────────────────────┐
│ 1. Planning Phase                                    │
│    - Define requirements in GitHub issue             │
│    - Assign to team member                           │
│    - Estimate effort & timeline                      │
└──────────────────────┬───────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────┐
│ 2. Design Phase                                      │
│    - Create wireframes/mockups                       │
│    - Component design spec                           │
│    - API contract design                             │
│    - Design review meeting                           │
└──────────────────────┬───────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────┐
│ 3. Implementation Phase                              │
│    - Create feature branch                           │
│    - Implement component(s)                          │
│    - Write tests (60%+ coverage)                     │
│    - Performance check                               │
└──────────────────────┬───────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────┐
│ 4. Code Review Phase                                 │
│    - Submit PR with description                      │
│    - Assign reviewers                                │
│    - Address review comments                         │
│    - Resolve merge conflicts                         │
└──────────────────────┬───────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────┐
│ 5. Testing Phase                                     │
│    - Run full test suite                             │
│    - QA manual testing                               │
│    - Performance regression testing                  │
│    - Integration testing with daemon                 │
└──────────────────────┬───────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────┐
│ 6. Merge & Deploy                                    │
│    - Merge to main                                   │
│    - Build artifacts created                         │
│    - Deployed to staging                             │
│    - Deployed to production (if approved)            │
└──────────────────────────────────────────────────────┘
```

### Concurrent Development (Avoiding Conflicts)

**Recommended Approach:**

1. **Clear Feature Boundaries**
   - Feature A: Components A, B, C
   - Feature B: Components D, E, F
   - Feature C: Utility functions

2. **Component Ownership**
   - Frontend Lead: Owns component architecture decisions
   - Designer: Owns component styling and layouts
   - Developer A: Owns ChatView and related components
   - Developer B: Owns TaskBoard and related components

3. **Communication**
   - Daily sync on shared dependencies
   - API contracts defined upfront
   - Regular rebases to avoid conflicts
   - Branch reviews before pushing

### Integration Points

```
Frontend Team
    ├── ChatInput component → useWailsBinding (shared)
    ├── TaskBoard component → useWailsBinding (shared)
    └── EventFeed component → useEventStream (shared)
                                    │
                                    ▼
Backend Team
    ├── app.go (Wails bindings)
    ├── eventserver (Event broadcasting)
    └── client integration
```

---

## 6. Communication Patterns

### Daily Standup

**Format**: 15 minutes, async in Slack or sync meeting

```
Each person answers:
1. What did I accomplish yesterday?
2. What am I working on today?
3. What blockers do I have?

Example:
Alice:
- ✅ Merged ApprovalWorkflow component PR
- 🚀 Working on Settings view integration
- 🚫 Waiting for API response time estimates
```

### Weekly Planning

**Format**: 30 minutes, Monday 9:00 AM

```
Agenda:
1. Review completed work (10 min)
2. Discuss upcoming priorities (10 min)
3. Identify risks and dependencies (5 min)
4. Assignment and capacity check (5 min)

Output:
- Prioritized task list for week
- Assignments and capacity
- Risk mitigation plans
```

### Weekly Retrospective

**Format**: 30 minutes, Friday 3:00 PM

```
Discussion:
1. What went well? (Celebrate wins)
2. What could be improved?
3. What will we commit to next week?

Output:
- Team insights documented
- Process improvements identified
- Action items for next week
```

### Issue Discussions

**Async Discussion Process:**

1. **Create Issue** → Clear description with reproduction steps
2. **Collect Feedback** → Team comments with suggestions (24-48h window)
3. **Technical Decision** → Lead makes decision based on consensus
4. **Implementation** → Assigned developer starts work
5. **Review** → Standard PR review process

### Escalation Path

**Technical Disagreements:**

```
Developer A ↔ Developer B
    ↓ (no consensus)
Team Lead
    ↓ (needs architecture input)
Architecture Committee
    ↓ (needs product input)
Product Lead
```

**Timeline:** Max 24 hours for decision

---

## 7. Code Ownership & Responsibility Matrix

| Component        | Owner   | Reviewer | Backup  |
| ---------------- | ------- | -------- | ------- |
| ChatView         | Alice   | Bob      | Charlie |
| TaskBoard        | Bob     | Alice    | Charlie |
| ApprovalWorkflow | Charlie | Alice    | Bob     |
| SettingsView     | Alice   | Bob      | Charlie |
| EventFeed        | Bob     | Charlie  | Alice   |
| useEventStream   | Bob     | Charlie  | Alice   |
| useWailsBinding  | Alice   | Bob      | Charlie |
| Zustand Store    | Charlie | Alice    | Bob     |
| Go bindings      | Bob     | Charlie  | Alice   |
| EventServer      | Bob     | Charlie  | Alice   |

### Code Owner Responsibilities

- Maintains code quality in owned components
- Reviews PRs for owned code (min review requirement)
- Mentors other developers on owned code
- Updates documentation for owned code
- Monitors performance of owned components
- Conducts periodic refactoring/cleanup

---

## 8. Onboarding Checklist for New Team Members

### Week 1: Fundamentals

- [ ] Set up development environment

  ```bash
  git clone https://github.com/rapid/rapid-desktop.git
  cd rapid-desktop
  npm install
  ./scripts/dev-setup.sh
  ```

- [ ] Understand project structure
  - Read README.md
  - Review QUICK_REFERENCE.md
  - Explore source code organization

- [ ] Set up local development
  - Run `npm run dev` successfully
  - Connect to local RAPID daemon
  - Verify all components load

- [ ] Join communication channels
  - #wails-ui Slack
  - GitHub organization
  - Team calendar/wiki

- [ ] Attend team meetings
  - Daily standup
  - Weekly planning
  - Weekly retrospective

### Week 2: Architecture & Design

- [ ] Pair programming session with Frontend Lead
  - Component architecture
  - State management patterns
  - Wails integration

- [ ] Code review examples
  - Review 5 recent PRs with mentor
  - Understand review standards
  - Ask questions

- [ ] Documentation review
  - Read all architecture docs
  - Review design system
  - Review component guide

### Week 3: First Contribution

- [ ] Pick small bug or feature
  - Discuss with team
  - Start implementation
  - Get early feedback

- [ ] Create first PR
  - Follow PR template
  - Address review comments
  - Learn from feedback

- [ ] Pair programming for first PR
  - Review code together
  - Discuss decisions
  - Learn patterns in context

### Week 4: Productivity

- [ ] Independent work on features
  - Pick feature from backlog
  - Design and implement
  - Lead own code review

- [ ] Mentor check-in
  - Discuss learnings
  - Provide feedback
  - Identify growth areas

---

## 9. Conflict Resolution

### Technical Disagreements

**Process:**

1. **Respectful Discussion** (24 hours)
   - Each side presents reasoning
   - Data and evidence presented
   - Listen to understand

2. **Team Input** (24 hours)
   - Get feedback from team members
   - Identify consensus patterns
   - Document perspectives

3. **Leadership Decision**
   - Lead makes decision
   - Explanation provided to team
   - Decision respected by all

**Example:**

```
Disagreement: Should we use Zustand or Redux for state management?

Developer A: "Zustand is simpler, less boilerplate, good for our size"
Developer B: "Redux has better DevTools and larger ecosystem for debugging"

Team Input:
- Charlie agrees with Zustand simplicity
- Diana mentions Redux easier for large teams
- Eve notes Zustand sufficient for current needs

Decision: Use Zustand now, migrate to Redux if app grows 10x

Implementation:
- Document decision in ADR (Architecture Decision Record)
- Set review criteria for Redux migration triggers
- Team aligns on decision
```

### Communication Conflicts

**Process:**

1. **Private conversation** with involved parties
2. **Mediation** by team lead if needed
3. **Team reset** if impact on team dynamics
4. **Follow-up** to ensure resolution

---

## 10. Best Practices Summary

### For Everyone

✅ **Do:**

- Communicate early and often
- Ask for help when stuck
- Review code thoroughly
- Test before pushing
- Update documentation
- Celebrate team wins

❌ **Don't:**

- Work in isolation for days
- Skip tests to save time
- Commit directly to main
- Merge own code without review
- Leave console logs
- Create breaking changes without discussion

### For Code Review

✅ **Do:**

- Review promptly (within 24h)
- Be specific in suggestions
- Acknowledge good work
- Provide learning opportunities
- Keep tone collaborative

❌ **Don't:**

- Demand changes without explanation
- Block PRs over style preferences
- Leave reviews without actionable feedback
- Approve without reading code
- Make personal critiques

### For Pair Programming

✅ **Do:**

- Communicate thoughts clearly
- Swap roles regularly
- Take notes on decisions
- Test together
- Document learnings

❌ **Don't:**

- Let one person dominate
- Work in silence
- Skip breaks
- Forget to test
- Leave without documentation
