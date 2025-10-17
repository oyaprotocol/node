/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                         Cache Configuration                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Centralized cache configuration settings for the application.
 *
 * @packageDocumentation
 */

/**
 * Time-to-live for ENS name resolution cache.
 * ENS records rarely change, so 1 hour is a safe default.
 * Value: 3,600,000 milliseconds (1 hour)
 */
export const ENS_CACHE_TTL = 60 * 60 * 1000 // 1 hour in milliseconds
