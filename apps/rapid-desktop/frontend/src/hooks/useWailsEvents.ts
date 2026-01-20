import { useEffect, useRef } from 'react'
import { useAppStore } from '../stores/app'

// Wails event listener types
declare global {
  interface Window {
    runtime?: {
      EventsOn: (eventName: string, callback: (data: any) => void) => () => void
      EventsOff: (eventName: string) => void
    }
  }
}

/**
 * Hook to listen for Wails events and sync to store
 * This handles real-time updates from the Go backend
 */
export function useWailsEvents() {
  const store = useAppStore()
  const unlistenersRef = useRef<Array<() => void>>([])

  useEffect(() => {
    const runtime = window.runtime

    if (!runtime?.EventsOn) {
      console.log('[WailsEvents] Runtime not available')
      return
    }

    // Listen for agents updates
    const unlistenAgents = runtime.EventsOn('rapid:agents', (event: any) => {
      try {
        if (event.data && Array.isArray(event.data)) {
          store.setAgents(event.data)
        }
      } catch (err) {
        console.error('[WailsEvents] Error syncing agents:', err)
      }
    })

    // Listen for tasks updates
    const unlistenTasks = runtime.EventsOn('rapid:tasks', (event: any) => {
      try {
        if (event.data && Array.isArray(event.data)) {
          store.setTasks(event.data)
        }
      } catch (err) {
        console.error('[WailsEvents] Error syncing tasks:', err)
      }
    })

    // Listen for messages updates
    const unlistenMessages = runtime.EventsOn('rapid:messages', (event: any) => {
      try {
        if (event.data && Array.isArray(event.data)) {
          store.setMessages(event.data)
        }
      } catch (err) {
        console.error('[WailsEvents] Error syncing messages:', err)
      }
    })

    // Listen for status updates
    const unlistenStatus = runtime.EventsOn('rapid:status', (event: any) => {
      try {
        if (event.data) {
          store.setDaemonStatus(event.data)
        }
      } catch (err) {
        console.error('[WailsEvents] Error syncing status:', err)
      }
    })

    unlistenersRef.current = [
      unlistenAgents,
      unlistenTasks,
      unlistenMessages,
      unlistenStatus,
    ]

    console.log('[WailsEvents] Event listeners registered')

    return () => {
      unlistenersRef.current.forEach((unlisten) => {
        if (typeof unlisten === 'function') {
          unlisten()
        }
      })
      console.log('[WailsEvents] Event listeners cleaned up')
    }
  }, [store])

  return {
    isReady: Boolean(window.runtime?.EventsOn),
  }
}
