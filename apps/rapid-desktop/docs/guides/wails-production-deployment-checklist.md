# Wails UI - Production Deployment Checklist

## Pre-Deployment Phase (1-2 weeks before)

### Code Quality & Testing

- [ ] **Unit Tests**
  - Run full test suite: `npm run test`
  - Target minimum 80% code coverage
  - All tests passing with no warnings
  - Coverage report reviewed and approved
  - Command: `npm run test:coverage`

- [ ] **Integration Tests**
  - Test all Wails bindings with real daemon
  - Verify WebSocket event streaming
  - Test agent spawning and communication
  - Test task CRUD operations
  - Test context search and retrieval
  - Command: `npm run test:integration`

- [ ] **E2E Tests**
  - Run Playwright test suite against production build
  - Test critical user flows (chat, tasks, approvals)
  - Test error scenarios and recovery
  - Test performance under load
  - Command: `npm run test:e2e`

- [ ] **Type Checking**
  - No TypeScript errors: `npm run type-check`
  - No ESLint issues: `npm run lint`
  - All components properly typed
  - No `any` types in production code

- [ ] **Security Scanning**
  - SAST analysis completed: `npm run security:scan`
  - Dependencies audited: `npm audit`
  - No critical vulnerabilities
  - Review and document any acceptable risks

### Performance Validation

- [ ] **Bundle Analysis**
  - Main bundle < 500KB gzipped
  - Code splitting working: `npm run build:analyze`
  - No duplicate dependencies
  - Run: `npm run build && npm run analyze`

- [ ] **Performance Benchmarks**
  - Lighthouse score > 90
  - First paint < 2s on 3G connection
  - Time to Interactive < 4s
  - Memory baseline established
  - Command: `npm run test:performance`

- [ ] **Load Testing**
  - Tested with 1000+ events in feed
  - Tested with 500+ tasks in board
  - Tested with 2000+ messages in chat
  - No performance degradation over extended session
  - Script: `scripts/load-test.sh`

### Documentation & Runbooks

- [ ] **Deploy Guide Reviewed**
  - Deployment procedures documented
  - Rollback procedures defined
  - Emergency procedures tested
  - Estimated deployment time recorded

- [ ] **Troubleshooting Guide Updated**
  - Common issues documented
  - Diagnostic procedures included
  - Contact information current
  - Known limitations listed

- [ ] **Release Notes Prepared**
  - Feature summary written
  - Breaking changes listed
  - Migration guide if needed
  - Contributors acknowledged

### Team Preparation

- [ ] **Team Training**
  - Development team trained on new features
  - Support team trained on troubleshooting
  - Product team aligned on changelog
  - Sales team briefed on new capabilities

- [ ] **Stakeholder Sign-off**
  - Product management approval
  - Security review completed
  - Legal/compliance review completed
  - Executive stakeholder review

---

## Pre-Release Phase (24 hours before)

### Final Code Review

- [ ] **Code Diff Review**
  - All changes reviewed
  - No accidental debug code
  - No credentials or secrets in code
  - All imports and dependencies correct

- [ ] **Dependency Audit**
  - All dependencies up-to-date or pinned
  - No abandoned packages
  - License compliance verified
  - Security advisory checked

- [ ] **Environment Configuration**
  - Production environment variables set correctly
  - API endpoints pointing to production
  - Analytics tracking configured
  - Error reporting configured

### Build Artifacts Preparation

- [ ] **Multi-platform Builds**
  - macOS Intel build created and tested
  - macOS ARM (Apple Silicon) build created and tested
  - Windows x64 build created and tested
  - Linux x64 build created and tested
  - Command: `./scripts/build.sh v1.0.0`

- [ ] **Build Validation**
  - Each build runs without errors
  - Each build starts successfully
  - Each build connects to event server
  - File sizes reasonable and consistent

  ```bash
  ls -lh apps/rapid-desktop/dist/
  ```

- [ ] **Code Signing Verification**
  - macOS binaries signed with production certificate
  - Windows binaries signed with production certificate
  - Signatures verified with `codesign -v` (macOS) and `signtool` (Windows)
  - No certificate warnings

### Database & Data Checks

- [ ] **Database Migration**
  - Migration scripts tested in staging
  - Rollback scripts tested
  - Data backup taken
  - No blocking locks on production DB

- [ ] **Feature Flags**
  - New features behind flags if needed
  - Flags configured correctly for production
  - Kill switches tested
  - Gradual rollout plan documented if applicable

- [ ] **Analytics Events**
  - Event tracking tested
  - No PII in events
  - Event schema validated
  - Sampling rates configured correctly

### Infrastructure Readiness

- [ ] **Monitoring Configured**
  - Alerts set up for key metrics
  - Thresholds calibrated
  - Error tracking configured
  - Performance monitoring enabled

- [ ] **Log Aggregation**
  - Log forwarding configured
  - Log retention policies set
  - Search indices created
  - Sample queries tested

- [ ] **Capacity Planning**
  - Expected user load calculated
  - Infrastructure scaled appropriately
  - Database connection pools sized correctly
  - Rate limits configured

---

## Release Day Phase

### Pre-Release Tasks (Morning)

- [ ] **Final Sanity Checks**
  - All tests passing again
  - No new commits since last test run
  - Build artifacts ready
  - Release notes finalized

- [ ] **Deployment Plan Review**
  - Deployment team aligned
  - Communication channels open
  - Rollback plan reviewed
  - Stakeholders notified of release window

- [ ] **Monitoring Verification**
  - All monitoring dashboards accessible
  - Alert channels tested
  - On-call team briefed
  - Incident response plan reviewed

### Release Tasks

- [ ] **Create Release Tag**

  ```bash
  git tag -a v1.0.0 -m "Release version 1.0.0"
  git push origin v1.0.0
  ```

- [ ] **Create GitHub Release**
  - Tag created in Git
  - Release notes uploaded
  - Build artifacts attached
  - Marked as "Latest" if applicable

- [ ] **Distribution to Channels**
  - GitHub Releases updated
  - Homebrew formula updated (macOS)
    ```bash
    brew bump-formula-pr rapid-desktop --url=[tarball-url]
    ```
  - WinGet manifests updated (Windows)
  - Snap published (Linux)
  - Website download links updated

- [ ] **Auto-Update Configuration**
  - New version published to update server
  - Update check mechanism verified
  - Rollout strategy implemented (e.g., 5% -> 25% -> 100%)
  - Monitoring for update failures

- [ ] **Communication**
  - Release announcement sent to users
  - Blog post published
  - Social media posts scheduled
  - Support team notified

### Post-Release Monitoring (First Hour)

- [ ] **Real-Time Monitoring**
  - Error rate monitored closely
  - Performance metrics checked
  - User session health verified
  - Crash reports reviewed

- [ ] **Update Adoption Tracking**
  - Update download metrics checked
  - Update success rate monitored
  - Rollback criteria prepared if needed
  - Version distribution tracked

- [ ] **User Feedback**
  - Support tickets monitored
  - Community channels checked
  - Critical issues logged
  - Hotfix prioritization if needed

### Post-Release Monitoring (First Day)

- [ ] **Extended Monitoring**
  - Error trends analyzed
  - Performance degradation checked
  - User experience metrics reviewed
  - Database performance verified

- [ ] **Incident Response**
  - Any critical issues addressed immediately
  - Hotfixes prepared if needed
  - Root cause analysis started for issues
  - Communication with stakeholders maintained

---

## Rollback Plan

### Automatic Rollback Triggers

- [ ] Set up automatic rollback for:
  - Error rate > 10% (vs baseline)
  - P99 response time > 5s
  - Crash rate > 1%
  - Downtime > 30 minutes

### Manual Rollback Procedure

```bash
#!/bin/bash
# scripts/rollback.sh

PREVIOUS_VERSION=$1

if [ -z "$PREVIOUS_VERSION" ]; then
  echo "Usage: rollback.sh <version>"
  exit 1
fi

echo "Rolling back to $PREVIOUS_VERSION..."

# Stop current deployment
systemctl stop rapid-desktop || true

# Download previous build
wget https://github.com/rapid/rapid-desktop/releases/download/v${PREVIOUS_VERSION}/rapid-desktop-${PREVIOUS_VERSION}.tar.gz

# Extract
tar -xzf rapid-desktop-${PREVIOUS_VERSION}.tar.gz

# Restart
systemctl start rapid-desktop

# Verify
sleep 5
curl -s http://localhost:5173/health || echo "Health check failed"

echo "Rollback to $PREVIOUS_VERSION complete"
```

### Rollback Communication

- [ ] Notify all stakeholders of rollback
- [ ] Update status page
- [ ] Document incident for post-mortem
- [ ] Schedule retrospective meeting

---

## Post-Release Phase (3-7 days)

### Analysis & Metrics

- [ ] **Performance Analysis**
  - Compare metrics before/after deployment
  - Identify any regressions
  - Validate performance improvements
  - Document findings in release report

- [ ] **Error Analysis**
  - Review all errors from first week
  - Identify patterns or systematic issues
  - Prioritize fixes for next release
  - Update error handling documentation

- [ ] **User Adoption**
  - Track version adoption rate
  - Identify early adopters
  - Note any adoption blockers
  - Adjust rollout if needed

### Post-Release Support

- [ ] **Support Ticket Review**
  - All high-priority issues addressed
  - Common user questions documented
  - FAQ updated
  - Known issues documented

- [ ] **Bug Fix Release Plan**
  - Critical bugs identified
  - Prioritized fix list created
  - Bug fix release timeline determined
  - Regression tests written for issues

- [ ] **Feature Feedback**
  - User feedback collected
  - Product team reviews feedback
  - Next iteration priorities adjusted
  - Feature requests tracked

### Documentation Update

- [ ] **Release Retrospective**
  - What went well documented
  - What could be improved noted
  - Action items for next release identified
  - Retrospective meeting held with team

- [ ] **Deployment Process Improvements**
  - Process bottlenecks identified
  - Automation opportunities noted
  - Documentation improvements made
  - Training needs identified

- [ ] **Internal Documentation Update**
  - Release process updated
  - Architecture docs updated if needed
  - Deployment procedures refined
  - Team wiki updated

---

## Appendix A: Pre-Release Test Commands

```bash
# Full test suite
npm run test
npm run test:integration
npm run test:e2e

# Linting and type checking
npm run lint
npm run type-check

# Security checks
npm audit
npm run security:scan

# Performance analysis
npm run build:analyze
npm run test:performance

# Build for all platforms
./scripts/build.sh v1.0.0

# Smoke test
npm run build
npm start
# Manually verify: chat works, tasks load, events stream
```

---

## Appendix B: Deployment Checklist Template

Copy and customize for each release:

```yaml
Release: v1.0.0
Date: 2024-XX-XX
Manager: [Name]

Pre-Release:
  [ ] All tests passing
  [ ] Code review complete
  [ ] Performance benchmarks met
  [ ] Security audit complete
  [ ] Release notes ready

Release Day:
  [ ] Artifacts built
  [ ] Artifacts signed
  [ ] Distribution channels updated
  [ ] Monitoring active
  [ ] Team briefed

Post-Release:
  [ ] Monitoring for 24 hours
  [ ] Error rate acceptable
  [ ] User feedback positive
  [ ] Support team ready
  [ ] Retrospective scheduled

Incidents: [Log any issues]
Resolution: [How each issue was resolved]
Approved By: [Stakeholder sign-offs]
```

---

## Appendix C: Emergency Contacts

- **Release Manager**: [Phone/Email]
- **Platform Lead**: [Phone/Email]
- **Security Lead**: [Phone/Email]
- **Infrastructure Lead**: [Phone/Email]
- **Product Manager**: [Phone/Email]

---

## Appendix D: Success Criteria

### Deployment Success Metrics

- [ ] **Zero Data Loss**: All user data intact post-deployment
- [ ] **Error Rate**: < 0.1% in first hour, < 0.01% by hour 24
- [ ] **Performance**: P99 response time < 500ms
- [ ] **Availability**: 99.99% uptime
- [ ] **User Adoption**: > 50% update adoption by day 7
- [ ] **Support Volume**: No spike in support tickets
- [ ] **Feature Functionality**: All new features working as designed

### Deployment Failure Criteria (Triggers for Rollback)

- [ ] Critical errors reported by > 5% of users
- [ ] Any data loss or corruption reported
- [ ] System downtime > 15 minutes
- [ ] Security vulnerability discovered
- [ ] Performance degradation > 50%
- [ ] Unexpected breaking changes affecting > 10% of workflows
