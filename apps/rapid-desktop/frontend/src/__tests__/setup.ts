/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

// Suppress React 18 concurrent mode warnings in tests
const originalError = console.error
beforeEach(() => {
  console.error = (...args: any[]) => {
    if (args[0]?.includes?.('Should not already be working')) return
    if (args[0]?.includes?.('act(...)')) return
    originalError.call(console, ...args)
  }
})

// Cleanup after each test
afterEach(() => {
  cleanup()
  console.error = originalError
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
