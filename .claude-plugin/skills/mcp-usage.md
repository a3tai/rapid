---
description: Guidelines for using MCP servers effectively
---

# MCP Server Usage Guidelines

## Available Servers

Check configured MCP servers with: `rapid mcp list`

## Common Servers

### Context7
Use for up-to-date library documentation:
1. First resolve library ID: `mcp__context7__resolve-library-id`
2. Then query docs: `mcp__context7__query-docs`

### Tavily
Use for web searches and content extraction:
- `mcp__tavily__tavily_search` - Search the web
- `mcp__tavily__tavily_extract` - Extract content from URLs

## Best Practices

1. Always check if an MCP server is available before using it
2. Prefer MCP servers over manual web searches
3. Cache relevant documentation locally when possible
4. Use specific queries for better results
