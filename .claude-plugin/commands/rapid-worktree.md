---
description: Manage git worktrees for branch isolation
allowed-tools: Bash(rapid:*, git:*)
argument-hint: <create|list|remove> [branch]
---

Manage git worktrees for isolated feature branch development.

## Usage

- `/rapid-worktree list` - List all worktrees
- `/rapid-worktree create <branch>` - Create a worktree for a branch
- `/rapid-worktree remove <path>` - Remove a worktree

Run: `rapid worktree $ARGUMENTS`
