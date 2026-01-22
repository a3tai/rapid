/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../stores/app';
import { Events } from '@wailsio/runtime';

// Get store actions directly to avoid re-renders (these don't change)
const getStoreActions = () => useAppStore.getState();

/**
 * Hook to listen for Wails events and sync to store
 * This handles real-time updates from the Go backend
 * NOTE: Uses merge functions to preserve existing data and prevent flickering
 */
export function useWailsEvents() {
  const unlistenersRef = useRef<Array<Function>>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Wails v3 uses Events module from @wailsio/runtime
    if (!Events?.On) {
      console.log('[WailsEvents] Events module not available');
      return;
    }

    // Listen for agents updates - use merge to preserve existing data
    const unlistenAgents = Events.On('rapid:agents', (event: any) => {
      try {
        const data = event?.data;
        if (data && Array.isArray(data)) {
          getStoreActions().mergeAgents(data);
        }
      } catch (err) {
        console.error('[WailsEvents] Error syncing agents:', err);
      }
    });

    // Listen for tasks updates - use merge to preserve existing data
    const unlistenTasks = Events.On('rapid:tasks', (event: any) => {
      try {
        const data = event?.data;
        if (data && Array.isArray(data)) {
          getStoreActions().mergeTasks(data);
        }
      } catch (err) {
        console.error('[WailsEvents] Error syncing tasks:', err);
      }
    });

    // Listen for messages updates - use merge to preserve history
    const unlistenMessages = Events.On('rapid:messages', (event: any) => {
      try {
        const data = event?.data;
        if (data && Array.isArray(data)) {
          getStoreActions().mergeMessages(data);
        }
      } catch (err) {
        console.error('[WailsEvents] Error syncing messages:', err);
      }
    });

    // Listen for status updates
    const unlistenStatus = Events.On('rapid:status', (event: any) => {
      try {
        const data = event?.data;
        if (data) {
          getStoreActions().setDaemonStatus(data);
        }
      } catch (err) {
        console.error('[WailsEvents] Error syncing status:', err);
      }
    });

    unlistenersRef.current = [unlistenAgents, unlistenTasks, unlistenMessages, unlistenStatus];
    setIsReady(true);

    console.log('[WailsEvents] Event listeners registered');

    return () => {
      unlistenersRef.current.forEach((unlisten) => {
        if (typeof unlisten === 'function') {
          unlisten();
        }
      });
      console.log('[WailsEvents] Event listeners cleaned up');
    };
  }, []); // Empty deps - event listeners only need to be set up once

  return {
    isReady,
  };
}
