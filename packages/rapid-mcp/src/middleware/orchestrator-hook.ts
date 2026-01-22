/**
 * Orchestrator Hook Middleware
 *
 * Intercepts incoming MCP requests and ensures an orchestrator is running
 * when user-initiated messages arrive. This implements Phase 3 of the
 * lazy orchestrator instantiation system.
 *
 * Reference: /workspace/.rapid/LAZY_ORCHESTRATOR_DESIGN.md (lines 49-63)
 */

import type { Request, Response, NextFunction } from 'express';
import { ensureOrchestratorRunning } from '../orchestrator-manager.js';
import type { ServerContext } from '../server.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('orchestrator-hook');

/**
 * Check if a request is from a user (not an agent)
 *
 * User requests lack agent metadata like agentId or agentName in headers.
 * Agent requests include X-Agent-Id or X-Agent-Name headers.
 */
function isUserRequest(req: Request): boolean {
  // Check for agent identification headers
  const hasAgentId = !!req.headers['x-agent-id'];
  const hasAgentName = !!req.headers['x-agent-name'];

  // If no agent headers, assume this is a user request
  return !hasAgentId && !hasAgentName;
}

/**
 * Express middleware that ensures orchestrator is running for user requests
 *
 * This middleware:
 * 1. Checks if the incoming request is from a user (vs an agent)
 * 2. If user request, calls ensureOrchestratorRunning() asynchronously
 * 3. Does NOT block the request - orchestrator spawn happens in background
 * 4. Logs spawn events and errors
 *
 * @param context - Server context with project directory
 * @returns Express middleware function
 */
export function createOrchestratorHook(context: ServerContext) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check if this is a user request
      const isUser = isUserRequest(req);

      if (isUser) {
        logger.info('[orchestrator-hook] User request detected, ensuring orchestrator is running');

        // Spawn orchestrator asynchronously (don't block request)
        ensureOrchestratorRunning(context).catch((err) => {
          logger.error('[orchestrator-hook] Failed to ensure orchestrator running', err);
          // Don't fail the request - orchestrator spawn is best-effort
        });
      } else {
        logger.debug('[orchestrator-hook] Agent request detected, skipping orchestrator check');
      }

      // Continue to next middleware/handler
      next();
    } catch (err) {
      logger.error('[orchestrator-hook] Unexpected error in middleware', err);
      // Don't fail the request - continue processing
      next();
    }
  };
}
