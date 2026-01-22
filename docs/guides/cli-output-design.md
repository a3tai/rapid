# CLI Output Design Guide

Design standards for consistent, user-friendly CLI status commands in RAPID.

## Principles

1. **Visual Hierarchy** - Clear section structure with consistent indentation
2. **Status Indicators** - Unified symbols and colors for status states
3. **Alignment** - Consistent spacing and column alignment
4. **Clarity** - Concise labels and helpful next-step hints
5. **Accessibility** - Color + symbols (not color-only), clear text alternatives

## Output Format Standards

### Section Headers

```
  SECTION LABEL
  ─────────────────────
```

- Use `logger.brand()` for section titles
- Add separator line with dashes (─)
- 2-space indent from left
- Followed by blank line

### Items/Lists

```
    ✓ Item name         details here
    ○ Disabled item     more info
    ? Unknown state     optional notes
```

Indentation levels:

- Section label: 2 spaces
- Item indicator: 4 spaces
- Continuation text: 4 spaces

### Status Indicators

| State             | Symbol | Color        | Usage                         |
| ----------------- | ------ | ------------ | ----------------------------- |
| Active/Success    | ✓      | brand (cyan) | Running, installed, available |
| Inactive/Disabled | ○      | dim (gray)   | Not running, not installed    |
| Partial/Warning   | ⚠      | yellow       | Partial status, warnings      |
| Unknown           | ?      | dim (gray)   | Indeterminate state           |
| Error             | ✗      | red          | Failed, error                 |

### Color Coding

- `logger.brand()` - Primary status, highlighted items (cyan)
- `logger.dim()` - Secondary info, disabled items (gray)
- `logger.bold()` - Important labels, default markers
- `logger.success()` - Success state (green)
- `logger.error()` - Error state (red)

### Column Alignment

For multi-column data (like worktree status):

```typescript
// Calculate max width for first column
const maxLen = Math.max(...items.map((i) => i.label.length));

// Pad and align
const padded = label.padEnd(maxLen);
console.log(`  ${padded} - ${secondColumn}`);
```

### Next Steps Section

At the bottom of status output:

```
  Quick Actions
  ─────────────
    • Run: rapid dev        Start coding in container
    • Run: rapid agent list Show available agents
```

Format:

- Section header with separator
- Bullet points with command + description
- 2-space section indent, 4-space items

## Command-Specific Patterns

### `rapid status`

Current: ✅ Good reference implementation

Structure:

1. Config info (path, root)
2. Container status (with hierarchy)
3. Agents (with default marker)
4. Secrets (with provider info)
5. Auth status
6. Quick actions

### `rapid agent list`

Current: ✅ Good - Simple and clean

Structure:

1. Header
2. List of agents with status icons
3. (default) marker for default agent
4. Version in dimmed text

### `rapid worktree status`

Current: ⚠️ Needs improvement

Recommended structure:

1. Section header "Worktree Agent Assignments" with separator
2. Aligned column output:
   ```
   main         - orchestrator (active)
   feat/auth    - worker-1 (active)
   feat/tests   - test-writer (idle)
   ```
3. Status indicators for agent state
4. Quick actions linking to spawn/bus commands

## Implementation Checklist

- [ ] Apply header format to all status commands
- [ ] Standardize indentation to 2/4 spaces
- [ ] Use consistent status indicator symbols
- [ ] Align multi-column output with padEnd()
- [ ] Add "Quick Actions" or "Next Steps" section
- [ ] Ensure color + symbols (no color-only)
- [ ] Test with `--json` flag output
- [ ] Add helpful hints for common operations

## Examples

### Before (worktree status)

```
Worktree Agent Assignments

main         - orchestrator (active)
feat/auth    - worker-1 (active)
```

### After (improved)

```
  Worktree Agent Assignments
  ──────────────────────────────

    main         - ✓ orchestrator (active)
    feat/auth    - ✓ worker-1 (active)
    feat/tests   - ○ test-writer (idle)

  Next Steps
  ──────────
    • Run: rapid worktree spawn <persona> <branch>
    • Run: rapid bus list  (for real-time agent status)
```

## Related Tools

- `logger.brand()`, `logger.dim()`, `logger.bold()` - Text styling
- `ora()` - Spinner during operations
- JSON output with `--json` flag for programmatic use
- Table/column formatting with `padEnd()` for alignment
