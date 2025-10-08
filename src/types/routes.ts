/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                          Route Type Definitions                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * TypeScript type definitions for Express route configuration and logging.
 *
 * @packageDocumentation
 */

import type { Router } from 'express'

/**
 * Route mount configuration
 *
 * Represents a mounted Express router with its base path.
 */
export interface RouteMount {
	basePath: string
	router: Router
}

/**
 * Endpoint information extracted from Express router
 *
 * Contains metadata about an API endpoint including its HTTP method,
 * path, and authentication requirements.
 */
export interface EndpointInfo {
	method: string
	path: string
	protected: boolean
}

/**
 * Express router layer internal structure
 *
 * Represents the internal structure of Express router layers.
 * Used for extracting route information from the router stack.
 */
export interface RouterLayer {
	route?: {
		path: string
		methods: Record<string, boolean>
	}
}
