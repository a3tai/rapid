# GitHub PR Automation with RAPID

Complete end-to-end example of automating pull request reviews using RAPID's multi-agent system.

## Overview

This example demonstrates how to:
1. Receive GitHub PR webhooks
2. Create analysis tasks for multi-agent code review
3. Coordinate multiple workers reviewing different aspects (style, tests, security)
4. Aggregate results and post as PR comment
5. Implement HITL approval gate for critical findings

## Architecture

```
GitHub PR Created
       ↓
   Webhook
       ↓
  Webhook Handler
       ↓
   Orchestrator
       ↓
   ┌────┴────┬──────────┬───────────┐
   ↓         ↓          ↓           ↓
Style    Tests      Security    Performance
Review   Review     Review      Review
   ↓         ↓          ↓           ↓
   └────┬────┴──────────┴───────────┘
        ↓
Result Aggregator
        ↓
   Critical Issue? ───Yes──→ HITL Approval
        ↓ No
GitHub Comment Posted
```

## Prerequisites

```bash
# Install dependencies
npm install express @octokit/rest @octokit/webhooks

# Set up environment variables
export GITHUB_TOKEN="ghp_..."
export GITHUB_WEBHOOK_SECRET="your-webhook-secret"
export RAPID_REDIS_URL="redis://localhost:6379"
```

## Project Structure

```
pr-automation/
├── src/
│   ├── webhook-handler.ts    # Receives GitHub webhooks
│   ├── orchestrator.ts        # Creates and assigns tasks
│   ├── workers/
│   │   ├── style-reviewer.ts  # Style and formatting checks
│   │   ├── test-reviewer.ts   # Test coverage analysis
│   │   ├── security-reviewer.ts # Security vulnerability scan
│   │   └── perf-reviewer.ts   # Performance analysis
│   ├── aggregator.ts          # Collects and combines results
│   └── github-client.ts       # Posts comments to PR
├── .rapid/
│   └── personas/
│       ├── orchestrator.yaml
│       ├── style-reviewer.yaml
│       ├── test-reviewer.yaml
│       ├── security-reviewer.yaml
│       └── perf-reviewer.yaml
└── rapid.json
```

---

## Step 1: Webhook Handler

Create a webhook endpoint to receive GitHub PR events:

**File: `src/webhook-handler.ts`**

```typescript
import express from 'express';
import { Webhooks } from '@octokit/webhooks';
import { EventBus } from '@a3t/rapid-eventbus';

const app = express();
const webhooks = new Webhooks({
  secret: process.env.GITHUB_WEBHOOK_SECRET!,
});

// Initialize event bus
const eventBus = new EventBus({
  redis: { url: process.env.RAPID_REDIS_URL },
  projectId: 'pr-automation',
});

// Handle pull request events
webhooks.on('pull_request.opened', async ({ payload }) => {
  const { pull_request, repository } = payload;

  console.log(`📥 PR #${pull_request.number} opened: ${pull_request.title}`);

  // Send coordination message to orchestrator
  await eventBus.send({
    type: 'coordination',
    fromAgent: {
      id: 'webhook-handler',
      name: 'GitHub Webhook Handler',
    },
    priority: 'high',
    payload: {
      title: `New PR: ${pull_request.title}`,
      content: JSON.stringify({
        action: 'review_pr',
        pr_number: pull_request.number,
        pr_title: pull_request.title,
        pr_url: pull_request.html_url,
        repo: `${repository.owner.login}/${repository.name}`,
        author: pull_request.user.login,
        branch: pull_request.head.ref,
        base_branch: pull_request.base.ref,
        diff_url: pull_request.diff_url,
        files_changed: pull_request.changed_files,
        additions: pull_request.additions,
        deletions: pull_request.deletions,
      }, null, 2),
      actionable: true,
    },
  });
});

// Express route for GitHub webhooks
app.post('/webhooks/github', express.json(), (req, res) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  webhooks.verify(req.body, signature);
  webhooks.receive({
    id: req.headers['x-github-delivery'] as string,
    name: req.headers['x-github-event'] as any,
    payload: req.body,
  });
  res.status(200).send('OK');
});

// Start server
app.listen(3000, () => {
  console.log('✅ Webhook handler listening on port 3000');
});

export { eventBus };
```

---

## Step 2: Orchestrator Agent

Create tasks and assign to specialized reviewers:

**File: `src/orchestrator.ts`**

```typescript
import { EventBus } from '@a3t/rapid-eventbus';
import { Octokit } from '@octokit/rest';

interface PRReviewRequest {
  pr_number: number;
  pr_title: string;
  pr_url: string;
  repo: string;
  author: string;
  branch: string;
  base_branch: string;
  diff_url: string;
  files_changed: number;
  additions: number;
  deletions: number;
}

// Initialize event bus
const eventBus = new EventBus({
  redis: { url: process.env.RAPID_REDIS_URL },
  projectId: 'pr-automation',
});

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// Register orchestrator
await eventBus.register({
  id: 'orchestrator-123',
  name: 'PR Review Orchestrator',
  worktree: 'main',
});

console.log('🤖 Orchestrator started, listening for PR events...');

// Poll for PR review requests
while (true) {
  const messages = await eventBus.getMessages({
    types: ['coordination'],
    limit: 10,
  });

  for (const message of messages) {
    const payload = message.payload as Record<string, any>;

    if (payload.title?.startsWith('New PR:')) {
      const pr: PRReviewRequest = JSON.parse(payload.content);

      console.log(`\n📋 Creating review tasks for PR #${pr.pr_number}`);

      // Fetch PR files
      const [owner, repo] = pr.repo.split('/');
      const { data: files } = await octokit.pulls.listFiles({
        owner,
        repo,
        pull_number: pr.pr_number,
      });

      // Create review tasks
      const taskIds = await createReviewTasks(pr, files);

      // Send coordination message with task IDs
      await eventBus.send({
        type: 'coordination',
        fromAgent: {
          id: 'orchestrator-123',
          name: 'PR Review Orchestrator',
        },
        priority: 'normal',
        payload: {
          title: `Review tasks created for PR #${pr.pr_number}`,
          content: `Created ${taskIds.length} review tasks:\n${taskIds.map((id, i) => `${i + 1}. ${id}`).join('\n')}`,
          actionable: false,
          context: {
            pr_number: pr.pr_number,
            task_ids: taskIds,
          },
        },
      });
    }
  }

  await sleep(5000); // Poll every 5 seconds
}

async function createReviewTasks(
  pr: PRReviewRequest,
  files: any[]
): Promise<string[]> {
  const taskIds: string[] = [];

  // 1. Style Review Task
  const styleTaskId = await task_create({
    title: `Style review: PR #${pr.pr_number}`,
    description: `Check code formatting and style guidelines for ${files.length} files`,
    priority: 'normal',
    createdBy: 'orchestrator-123',
    requiredCapabilities: ['read', 'grep', 'bash'],
    tags: ['style', 'review', `pr-${pr.pr_number}`],
    estimatedDuration: 600,
    metadata: {
      pr_number: pr.pr_number,
      repo: pr.repo,
      files: files.map(f => f.filename),
    },
  });
  taskIds.push(styleTaskId.task.id);

  // 2. Test Coverage Review Task
  const testTaskId = await task_create({
    title: `Test review: PR #${pr.pr_number}`,
    description: `Analyze test coverage for changes in PR #${pr.pr_number}`,
    priority: 'normal',
    createdBy: 'orchestrator-123',
    requiredCapabilities: ['read', 'bash'],
    tags: ['tests', 'review', `pr-${pr.pr_number}`],
    estimatedDuration: 900,
    metadata: {
      pr_number: pr.pr_number,
      repo: pr.repo,
      branch: pr.branch,
    },
  });
  taskIds.push(testTaskId.task.id);

  // 3. Security Review Task
  const securityTaskId = await task_create({
    title: `Security review: PR #${pr.pr_number}`,
    description: `Scan for security vulnerabilities in PR #${pr.pr_number}`,
    priority: 'high',
    createdBy: 'orchestrator-123',
    requiredCapabilities: ['read', 'grep', 'bash'],
    tags: ['security', 'review', `pr-${pr.pr_number}`],
    estimatedDuration: 1200,
    metadata: {
      pr_number: pr.pr_number,
      repo: pr.repo,
      files: files.map(f => f.filename),
    },
  });
  taskIds.push(securityTaskId.task.id);

  // 4. Performance Review Task
  const perfTaskId = await task_create({
    title: `Performance review: PR #${pr.pr_number}`,
    description: `Analyze performance impact of changes in PR #${pr.pr_number}`,
    priority: 'normal',
    createdBy: 'orchestrator-123',
    requiredCapabilities: ['read', 'grep'],
    tags: ['performance', 'review', `pr-${pr.pr_number}`],
    estimatedDuration: 600,
    metadata: {
      pr_number: pr.pr_number,
      repo: pr.repo,
      additions: pr.additions,
      deletions: pr.deletions,
    },
  });
  taskIds.push(perfTaskId.task.id);

  // 5. Aggregation Task (depends on all reviews)
  const aggregateTaskId = await task_create({
    title: `Aggregate review results: PR #${pr.pr_number}`,
    description: `Collect and format review findings for PR #${pr.pr_number}`,
    priority: 'normal',
    createdBy: 'orchestrator-123',
    requiredCapabilities: ['bus_messages'],
    dependencies: [
      styleTaskId.task.id,
      testTaskId.task.id,
      securityTaskId.task.id,
      perfTaskId.task.id,
    ],
    tags: ['aggregate', `pr-${pr.pr_number}`],
    estimatedDuration: 300,
    metadata: {
      pr_number: pr.pr_number,
      repo: pr.repo,
      pr_url: pr.pr_url,
    },
  });
  taskIds.push(aggregateTaskId.task.id);

  return taskIds;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## Step 3: Review Workers

### Style Reviewer

**File: `src/workers/style-reviewer.ts`**

```typescript
import { EventBus } from '@a3t/rapid-eventbus';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const eventBus = new EventBus({
  redis: { url: process.env.RAPID_REDIS_URL },
  projectId: 'pr-automation',
});

// Register agent
await eventBus.register({
  id: 'style-reviewer-456',
  name: 'Style Reviewer',
  worktree: 'style-review',
});

console.log('👔 Style reviewer started, waiting for tasks...');

// Poll for style review tasks
while (true) {
  const tasks = await task_list({
    status: 'pending',
    tags: ['style', 'review'],
  });

  for (const task of tasks.tasks) {
    // Claim task
    await task_claim({
      id: task.id,
      agentId: 'style-reviewer-456',
    });

    console.log(`\n📝 Reviewing style for ${task.title}`);

    // Run linting/formatting checks
    const issues: string[] = [];

    try {
      // Run ESLint
      const { stdout: eslintOutput } = await execAsync('npm run lint -- --format json');
      const eslintResults = JSON.parse(eslintOutput);

      for (const result of eslintResults) {
        if (result.errorCount > 0 || result.warningCount > 0) {
          issues.push(`${result.filePath}:\n${result.messages.map(m =>
            `  - Line ${m.line}: ${m.message} (${m.ruleId})`
          ).join('\n')}`);
        }
      }

      // Run Prettier check
      const { stdout: prettierOutput } = await execAsync(
        'npx prettier --check "src/**/*.{ts,tsx}"'
      );
    } catch (error: any) {
      if (error.stdout) {
        issues.push(`Formatting issues found:\n${error.stdout}`);
      }
    }

    // Complete task with findings
    await task_complete({
      id: task.id,
      summary: issues.length === 0
        ? 'No style issues found ✅'
        : `Found ${issues.length} style issue(s)`,
    });

    // Send completion message
    await eventBus.send({
      type: 'completion',
      fromAgent: {
        id: 'style-reviewer-456',
        name: 'Style Reviewer',
      },
      priority: issues.length > 5 ? 'high' : 'normal',
      payload: {
        title: `Style review completed: ${task.title}`,
        content: issues.length === 0
          ? '✅ No style issues found. Code follows formatting guidelines.'
          : `⚠️ Found ${issues.length} style issue(s):\n\n${issues.join('\n\n')}`,
        actionable: issues.length > 0,
        context: {
          task_id: task.id,
          pr_number: task.metadata?.pr_number,
          issue_count: issues.length,
          severity: issues.length > 5 ? 'high' : 'low',
        },
      },
    });
  }

  await sleep(5000);
}
```

### Test Coverage Reviewer

**File: `src/workers/test-reviewer.ts`**

```typescript
import { EventBus } from '@a3t/rapid-eventbus';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const eventBus = new EventBus({
  redis: { url: process.env.RAPID_REDIS_URL },
  projectId: 'pr-automation',
});

await eventBus.register({
  id: 'test-reviewer-789',
  name: 'Test Coverage Reviewer',
  worktree: 'test-review',
});

console.log('🧪 Test reviewer started, waiting for tasks...');

while (true) {
  const tasks = await task_list({
    status: 'pending',
    tags: ['tests', 'review'],
  });

  for (const task of tasks.tasks) {
    await task_claim({
      id: task.id,
      agentId: 'test-reviewer-789',
    });

    console.log(`\n🧪 Analyzing test coverage for ${task.title}`);

    // Run tests with coverage
    const { stdout } = await execAsync('npm test -- --coverage --json');
    const coverage = JSON.parse(stdout);

    const findings: string[] = [];

    // Check overall coverage
    const totalCoverage = coverage.total;
    if (totalCoverage.lines.pct < 80) {
      findings.push(`⚠️ Line coverage (${totalCoverage.lines.pct}%) is below 80% threshold`);
    }
    if (totalCoverage.branches.pct < 75) {
      findings.push(`⚠️ Branch coverage (${totalCoverage.branches.pct}%) is below 75% threshold`);
    }

    // Check for untested files
    const untestedFiles = Object.entries(coverage)
      .filter(([file, stats]: [string, any]) =>
        stats.lines?.pct === 0 && file !== 'total'
      )
      .map(([file]) => file);

    if (untestedFiles.length > 0) {
      findings.push(`⚠️ Untested files:\n${untestedFiles.map(f => `  - ${f}`).join('\n')}`);
    }

    await task_complete({
      id: task.id,
      summary: findings.length === 0
        ? 'Test coverage looks good ✅'
        : `Coverage issues found`,
    });

    await eventBus.send({
      type: 'completion',
      fromAgent: {
        id: 'test-reviewer-789',
        name: 'Test Coverage Reviewer',
      },
      priority: findings.length > 0 ? 'high' : 'normal',
      payload: {
        title: `Test review completed: ${task.title}`,
        content: findings.length === 0
          ? `✅ Test coverage meets requirements:\n- Lines: ${totalCoverage.lines.pct}%\n- Branches: ${totalCoverage.branches.pct}%`
          : `⚠️ Coverage concerns:\n\n${findings.join('\n\n')}`,
        actionable: findings.length > 0,
        context: {
          task_id: task.id,
          pr_number: task.metadata?.pr_number,
          coverage: totalCoverage,
        },
      },
    });
  }

  await sleep(5000);
}
```

### Security Reviewer

**File: `src/workers/security-reviewer.ts`**

```typescript
import { EventBus } from '@a3t/rapid-eventbus';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const eventBus = new EventBus({
  redis: { url: process.env.RAPID_REDIS_URL },
  projectId: 'pr-automation',
});

await eventBus.register({
  id: 'security-reviewer-012',
  name: 'Security Reviewer',
  worktree: 'security-review',
});

console.log('🔒 Security reviewer started, waiting for tasks...');

while (true) {
  const tasks = await task_list({
    status: 'pending',
    tags: ['security', 'review'],
  });

  for (const task of tasks.tasks) {
    await task_claim({
      id: task.id,
      agentId: 'security-reviewer-012',
    });

    console.log(`\n🔒 Scanning security for ${task.title}`);

    const vulnerabilities: Array<{
      severity: string;
      type: string;
      file: string;
      line: number;
      description: string;
    }> = [];

    // Run npm audit
    try {
      const { stdout } = await execAsync('npm audit --json');
      const auditResult = JSON.parse(stdout);

      if (auditResult.metadata.vulnerabilities.total > 0) {
        vulnerabilities.push({
          severity: 'high',
          type: 'Dependency Vulnerability',
          file: 'package.json',
          line: 0,
          description: `Found ${auditResult.metadata.vulnerabilities.total} vulnerable dependencies`,
        });
      }
    } catch (error: any) {
      // npm audit exits with non-zero on vulnerabilities
      if (error.stdout) {
        const auditResult = JSON.parse(error.stdout);
        vulnerabilities.push({
          severity: 'high',
          type: 'Dependency Vulnerability',
          file: 'package.json',
          line: 0,
          description: `Found ${auditResult.metadata.vulnerabilities.total} vulnerable dependencies`,
        });
      }
    }

    // Check for common security anti-patterns
    const files = task.metadata?.files || [];
    for (const file of files) {
      const { stdout } = await execAsync(`grep -n "eval(" ${file} || true`);
      if (stdout) {
        vulnerabilities.push({
          severity: 'critical',
          type: 'Code Injection',
          file,
          line: parseInt(stdout.split(':')[0]),
          description: 'Use of eval() detected - potential code injection vulnerability',
        });
      }
    }

    // Check for critical issues requiring HITL approval
    const criticalIssues = vulnerabilities.filter(v => v.severity === 'critical');

    if (criticalIssues.length > 0) {
      // Send approval request
      await eventBus.send({
        type: 'approval_request',
        fromAgent: {
          id: 'security-reviewer-012',
          name: 'Security Reviewer',
        },
        priority: 'urgent',
        payload: {
          title: `Critical security issues found in PR #${task.metadata?.pr_number}`,
          content: `Found ${criticalIssues.length} critical security issue(s):\n\n${criticalIssues.map(v =>
            `❌ ${v.type} in ${v.file}:${v.line}\n   ${v.description}`
          ).join('\n\n')}`,
          actionable: true,
          context: {
            request_id: `security-${task.id}`,
            action: 'approve_pr_merge',
            risk_level: 'critical',
            pr_number: task.metadata?.pr_number,
          },
        },
      });

      console.log('⚠️  Critical issues found - HITL approval requested');
    }

    await task_complete({
      id: task.id,
      summary: vulnerabilities.length === 0
        ? 'No security issues found ✅'
        : `Found ${vulnerabilities.length} security issue(s)`,
    });

    await eventBus.send({
      type: 'completion',
      fromAgent: {
        id: 'security-reviewer-012',
        name: 'Security Reviewer',
      },
      priority: criticalIssues.length > 0 ? 'urgent' : 'normal',
      payload: {
        title: `Security review completed: ${task.title}`,
        content: vulnerabilities.length === 0
          ? '✅ No security vulnerabilities detected'
          : `⚠️ Found ${vulnerabilities.length} security issue(s):\n\n${vulnerabilities.map(v =>
            `${v.severity === 'critical' ? '❌' : '⚠️'} [${v.severity.toUpperCase()}] ${v.type}\n` +
            `   File: ${v.file}:${v.line}\n` +
            `   ${v.description}`
          ).join('\n\n')}`,
        actionable: vulnerabilities.length > 0,
        context: {
          task_id: task.id,
          pr_number: task.metadata?.pr_number,
          vulnerability_count: vulnerabilities.length,
          critical_count: criticalIssues.length,
          requires_approval: criticalIssues.length > 0,
        },
      },
    });
  }

  await sleep(5000);
}
```

---

## Step 4: Result Aggregator

Collect and format all review findings:

**File: `src/aggregator.ts`**

```typescript
import { EventBus } from '@a3t/rapid-eventbus';
import { Octokit } from '@octokit/rest';

const eventBus = new EventBus({
  redis: { url: process.env.RAPID_REDIS_URL },
  projectId: 'pr-automation',
});

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

await eventBus.register({
  id: 'aggregator-345',
  name: 'Result Aggregator',
  worktree: 'main',
});

console.log('📊 Result aggregator started, waiting for tasks...');

while (true) {
  const tasks = await task_list({
    status: 'pending',
    tags: ['aggregate'],
  });

  for (const task of tasks.tasks) {
    await task_claim({
      id: task.id,
      agentId: 'aggregator-345',
    });

    console.log(`\n📊 Aggregating results for ${task.title}`);

    const prNumber = task.metadata?.pr_number;
    const repo = task.metadata?.repo;

    // Get all completion messages for this PR
    const messages = await eventBus.getMessages({
      types: ['completion'],
      limit: 100,
    });

    const reviewResults = messages.filter(m =>
      m.payload.context?.pr_number === prNumber
    );

    // Aggregate findings
    const styleFindings = reviewResults.find(m =>
      m.fromAgent.name === 'Style Reviewer'
    );
    const testFindings = reviewResults.find(m =>
      m.fromAgent.name === 'Test Coverage Reviewer'
    );
    const securityFindings = reviewResults.find(m =>
      m.fromAgent.name === 'Security Reviewer'
    );
    const perfFindings = reviewResults.find(m =>
      m.fromAgent.name === 'Performance Reviewer'
    );

    // Format PR comment
    const comment = `## 🤖 RAPID Multi-Agent Code Review

### 📋 Summary

${reviewResults.length} automated reviews completed:

${styleFindings ? `✅ Style Review` : '⏳ Style Review (pending)'}
${testFindings ? `✅ Test Coverage Review` : '⏳ Test Coverage (pending)'}
${securityFindings ? `✅ Security Review` : '⏳ Security Review (pending)'}
${perfFindings ? `✅ Performance Review` : '⏳ Performance Review (pending)'}

---

### 👔 Style & Formatting

${styleFindings?.payload.content || 'No findings'}

---

### 🧪 Test Coverage

${testFindings?.payload.content || 'No findings'}

---

### 🔒 Security

${securityFindings?.payload.content || 'No findings'}

---

### ⚡ Performance

${perfFindings?.payload.content || 'No findings'}

---

${securityFindings?.payload.context?.requires_approval
  ? `⚠️ **Action Required**: This PR contains critical security issues and requires human approval before merging.`
  : `✅ **Automated checks passed**. No critical issues found.`
}

<sub>Generated by [RAPID Multi-Agent System](https://github.com/your-org/rapid)</sub>
`;

    // Post comment to GitHub
    const [owner, repoName] = repo.split('/');
    await octokit.issues.createComment({
      owner,
      repo: repoName,
      issue_number: prNumber,
      body: comment,
    });

    console.log(`✅ Posted review comment to PR #${prNumber}`);

    await task_complete({
      id: task.id,
      summary: `Review results posted to PR #${prNumber}`,
    });

    await eventBus.send({
      type: 'completion',
      fromAgent: {
        id: 'aggregator-345',
        name: 'Result Aggregator',
      },
      priority: 'normal',
      payload: {
        title: `Results posted to PR #${prNumber}`,
        content: `All review findings have been aggregated and posted to ${task.metadata?.pr_url}`,
        actionable: false,
        context: {
          task_id: task.id,
          pr_number: prNumber,
        },
      },
    });
  }

  await sleep(5000);
}
```

---

## Step 5: Configuration

### rapid.json

```json
{
  "$schema": "https://getrapid.dev/schema/v1/rapid.json",
  "version": "1.0",
  "name": "pr-automation",

  "eventBus": {
    "enabled": true,
    "redis": {
      "url": "${env:RAPID_REDIS_URL}"
    }
  },

  "personas": {
    "directory": ".rapid/personas",
    "team": [
      "orchestrator",
      "style-reviewer",
      "test-reviewer",
      "security-reviewer",
      "perf-reviewer",
      "aggregator"
    ],
    "autoSpawn": true,
    "orchestrator": "orchestrator"
  },

  "secrets": {
    "provider": "1password",
    "vault": "Development",
    "items": {
      "GITHUB_TOKEN": "op://Development/GitHub/token",
      "GITHUB_WEBHOOK_SECRET": "op://Development/GitHub/webhook-secret"
    }
  }
}
```

### Persona Definitions

**File: `.rapid/personas/style-reviewer.yaml`**

```yaml
name: style-reviewer
description: Code style and formatting reviewer

model: haiku  # Fast and cost-effective

systemPrompt: |
  You are a style and formatting reviewer. Check code for:
  - Consistent formatting (indentation, spacing)
  - Naming conventions
  - Code organization
  - Linting rule compliance

  Report issues clearly with file, line number, and suggested fixes.

personality:
  - thorough
  - concise

tools:
  - read
  - grep
  - bash

triggers:
  - on_request

maxTurns: 15
canSpawn: false
```

**File: `.rapid/personas/security-reviewer.yaml`**

```yaml
name: security-reviewer
description: Security vulnerability scanner

model: sonnet  # Better for security analysis

systemPrompt: |
  You are a security reviewer. Scan for:
  - OWASP Top 10 vulnerabilities
  - Dependency vulnerabilities
  - Code injection risks
  - Authentication/authorization issues
  - Sensitive data exposure

  For CRITICAL issues, request HITL approval via approval_request message.

personality:
  - cautious
  - thorough

tools:
  - read
  - grep
  - bash
  - bus_send

triggers:
  - on_request

maxTurns: 20
canSpawn: false
```

---

## Step 6: Deployment

### Docker Compose Setup

**File: `docker-compose.yml`**

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

  webhook-handler:
    build: .
    command: npm run webhook
    ports:
      - "3000:3000"
    environment:
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - GITHUB_WEBHOOK_SECRET=${GITHUB_WEBHOOK_SECRET}
      - RAPID_REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  orchestrator:
    build: .
    command: npm run orchestrator
    environment:
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - RAPID_REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  style-reviewer:
    build: .
    command: rapid start style-reviewer
    environment:
      - RAPID_REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  test-reviewer:
    build: .
    command: rapid start test-reviewer
    environment:
      - RAPID_REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  security-reviewer:
    build: .
    command: rapid start security-reviewer
    environment:
      - RAPID_REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  aggregator:
    build: .
    command: npm run aggregator
    environment:
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - RAPID_REDIS_URL=redis://redis:6379
    depends_on:
      - redis

volumes:
  redis-data:
```

### GitHub Webhook Configuration

1. Go to your repository settings
2. Navigate to **Webhooks** → **Add webhook**
3. Set **Payload URL**: `https://your-domain.com/webhooks/github`
4. Set **Content type**: `application/json`
5. Set **Secret**: Your webhook secret
6. Select events: **Pull requests**
7. Click **Add webhook**

---

## Step 7: Running the System

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Check agent status
rapid bus agents

# View tasks
rapid tasks list

# Monitor event bus messages
rapid bus messages --follow
```

---

## Expected Workflow

1. **Developer opens PR** → GitHub sends webhook
2. **Webhook handler** receives event → sends coordination message to orchestrator
3. **Orchestrator** creates 5 tasks:
   - Style review
   - Test coverage review
   - Security review
   - Performance review
   - Aggregate results (depends on all above)
4. **Workers** claim and execute their tasks in parallel
5. **Security reviewer** finds critical issue → sends `approval_request` message
6. **Human reviewer** uses `rapid approve <request-id> --yes` to approve
7. **Aggregator** waits for all reviews → collects results → posts GitHub comment
8. **PR comment** appears with comprehensive review findings

---

## Timeline Example

```
T+0s:   PR opened → Webhook received
T+2s:   Orchestrator creates 5 tasks
T+5s:   All 4 reviewers claim tasks simultaneously
T+10s:  Style reviewer completes (fast, Haiku model)
T+30s:  Performance reviewer completes
T+45s:  Test reviewer completes
T+60s:  Security reviewer completes → CRITICAL ISSUE FOUND
T+65s:  Approval request sent to humans
        [Human reviews and approves via CLI]
T+120s: Aggregator collects all results
T+125s: GitHub comment posted

Total: ~2 minutes (vs 10+ minutes manual review!)
```

---

## Benefits

✅ **Fast**: 4 parallel reviews complete in ~1 minute
✅ **Consistent**: Same checks applied to every PR
✅ **Comprehensive**: Style, tests, security, performance all covered
✅ **Safe**: HITL approval gate for critical issues
✅ **Transparent**: Full review results posted as PR comment
✅ **Cost-Effective**: Haiku for simple checks, Sonnet for complex analysis

---

## Next Steps

- **Extend reviews**: Add more specialized reviewers (accessibility, i18n, etc.)
- **Custom checks**: Implement project-specific review logic
- **Integration**: Connect to Slack, Jira, or other tools
- **Metrics**: Track review time, issue frequency, approval rates
- **Learning**: Agents learn from past reviews to improve accuracy

---

## Related Documentation

- [Multi-Agent System Architecture](../architecture/multi-agent-system.md)
- [Event Bus Documentation](../../packages/rapid-eventbus/README.md)
- [Task Management](concurrent-execution.md)
- [HITL Approval Workflow](../architecture/hitl-workflow.md)
