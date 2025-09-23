/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                       TypeScript Declarations                             ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Module declarations for packages without TypeScript definitions.
 * Enables TypeScript compilation for JavaScript-only dependencies.
 *
 * Declared modules:
 * - helia - IPFS implementation in JavaScript
 * - \@helia/strings - String handling for Helia IPFS
 * - dotenv - Environment variable management
 *
 * @packageDocumentation
 */

declare module 'helia'
declare module 'helia/dist/index.min.js'
declare module '@helia/strings'
declare module 'dotenv'
