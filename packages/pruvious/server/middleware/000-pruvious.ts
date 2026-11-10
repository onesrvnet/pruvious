import {
  parseBody,
  removeExpiredCacheEntries,
  resolveContextLanguage,
  resolveCurrentUser,
  triggerQueueProcessingThrottled,
} from '#pruvious/server'
import { randomIdentifier } from '@pruvious/utils'
import { PathMatcher } from '@pruvious/utils/path-matcher'
import { logRequest } from '../../modules/pruvious/debug/logs'

let matcher: PathMatcher

/**
 * Minimum time between two expired cache cleanups in one server instance.
 * Cache reads already skip expired entries, so the cleanup only frees space.
 */
const CACHE_CLEANUP_INTERVAL = 60_000

let lastCacheCleanup = 0

/**
 * Server middleware for Pruvious API routes.
 *
 * The middleware performs the following operations:
 *
 * - Defines the `event.context.pruvious` object.
 * - Generates and assigns a unique request debug ID to `event.context.pruvious.requestDebugId`.
 * - Determines the request language and assigns it to `event.context.pruvious.language`.
 * - Validates user authentication status and sets the `event.context.pruvious.auth` context.
 * - Parses the request body and populates `event.context.pruvious.input` and `event.context.pruvious.files`.
 * - Logs the request.
 * - Removes expired cache entries (at most once per minute).
 * - Initiates the job queue processing sequence (throttled, see `triggerQueueProcessingThrottled`).
 */
export default defineEventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig()
  const path = event.path.split('?')[0]!

  if (!matcher) {
    matcher = new PathMatcher({
      include: runtimeConfig.pruvious.api.middleware.include,
      exclude: runtimeConfig.pruvious.api.middleware.exclude,
    })
  }

  if (matcher.test(path)) {
    // Initialize context
    event.context.pruvious ??= {} as any

    // Debug ID
    event.context.pruvious.requestDebugId = runtimeConfig.pruvious.debug.logs.enabled ? randomIdentifier() : ''

    // Language, auth, body
    await Promise.all([resolveContextLanguage(), resolveCurrentUser(), parseBody(event)])

    // Log request
    event.waitUntil(logRequest())

    // Cache
    const now = Date.now()
    if (now - lastCacheCleanup >= CACHE_CLEANUP_INTERVAL) {
      lastCacheCleanup = now
      event.waitUntil(removeExpiredCacheEntries().catch(() => 0))
    }

    // Queue
    if (runtimeConfig.pruvious.queue.mode === 'auto') {
      const trigger = triggerQueueProcessingThrottled()
      if (trigger) {
        event.waitUntil(trigger)
      }
    }
  }
})
