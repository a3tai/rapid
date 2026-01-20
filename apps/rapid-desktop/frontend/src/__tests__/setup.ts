import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock window.go for Wails
global.window = {
  ...global.window,
  go: {
    main: {
      App: {
        GetConfig: vi.fn(),
        SaveConfig: vi.fn(),
        GetAgents: vi.fn(),
        GetTasks: vi.fn(),
        GetConversation: vi.fn(),
        GetStatus: vi.fn(),
      },
    },
  },
} as any

// Mock import.meta.env
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_MCP_URL: 'http://localhost:3100/mcp',
  },
})

// Mock fetch for tests
global.fetch = vi.fn()
