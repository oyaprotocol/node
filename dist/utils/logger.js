/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                           Logger Utility                                  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Centralized logging utility providing structured output with tslog.
 *
 * - Main logger: Branded console output controlled by LOG_LEVEL
 * - Diagnostic logger: JSON output with source locations via DIAGNOSTIC_LOGGER
 * - Child loggers: Module-specific loggers with name prefixes
 *
 * @packageDocumentation
 */
import { Logger } from 'tslog';
/**
 * Base log template used by all loggers
 * @internal
 */
const BASE_LOG_TEMPLATE = '\x1b[35m[\x1b[1mOYA NODE 🌪️ \x1b[22m]\x1b[0m [{{yyyy}}-{{mm}}-{{dd}} {{hh}}:{{MM}}:{{ss}}] [{{logLevelName}}] ';
/**
 * Main application logger instance
 *
 * Provides structured logging with branded output format.
 * Log level controlled by LOG_LEVEL environment variable.
 *
 * @example
 * ```typescript
 * logger.info('Block created', { blockNumber: 123 })
 * // Output: [OYA NODE 🌪️] [2024-09-24 15:30:45] [INFO] Block created { blockNumber: 123 }
 * ```
 *
 * @public
 */
export const logger = new Logger({
    type: 'pretty',
    prettyLogTemplate: BASE_LOG_TEMPLATE,
    minLevel: parseInt(process.env.LOG_LEVEL || '3'), // 0=silly, 1=trace, 2=debug, 3=info, 4=warn, 5=error, 6=fatal
    hideLogPositionForProduction: true,
    stylePrettyLogs: true,
    prettyLogTimeZone: 'UTC',
    prettyErrorTemplate: '\n{{errorName}} {{errorMessage}}\n{{errorStack}}',
    prettyErrorStackTemplate: '  • {{fileName}}\t{{method}}\n\t{{filePathWithLine}}',
    prettyErrorParentNamesSeparator: ' → ',
    prettyLogStyles: {
        logLevelName: {
            '*': ['bold', 'dim'],
            ERROR: ['bold', 'red'],
            WARN: ['bold', 'yellow'],
            INFO: ['bold', 'green'],
            DEBUG: ['bold', 'blue'],
            TRACE: ['bold', 'magenta'],
            FATAL: ['bold', 'bgRed', 'white'],
        },
    },
});
/**
 * Check if debug mode is enabled
 *
 * @internal
 */
const diagnosticEnabled = process.env.DIAGNOSTIC_LOGGER === 'true';
/**
 * Diagnostic logger for detailed output
 *
 * Outputs detailed JSON logs with source locations when DIAGNOSTIC_LOGGER
 * environment variable is set to 'true'. When disabled, all methods are no-ops
 * for zero performance overhead.
 *
 * @example
 * ```typescript
 * // Enable with: DIAGNOSTIC_LOGGER=true
 * diagnostic.trace('Entering processIntentions', { cache: intentionCache })
 * diagnostic.debug('Signature verification', { address, signature })
 * // Output (JSON): {"_meta": {"date": "...", "path": {...}}, "msg": "...", ...}
 * ```
 *
 * @public
 */
export const diagnostic = diagnosticEnabled
    ? new Logger({
        name: 'DIAGNOSTIC',
        type: 'json',
        minLevel: 0, // Show all levels
        hideLogPositionForProduction: false, // Always show source locations
        prettyInspectOptions: {
            depth: null, // Unlimited object inspection depth
            colors: false,
        },
    })
    : {
        silly: () => { },
        trace: () => { },
        debug: () => { },
        info: () => { },
        warn: () => { },
        error: () => { },
        fatal: () => { },
    };
/**
 * Create a child logger with additional context
 *
 * Creates a sub-logger that inherits configuration from the main logger
 * but includes additional contextual information in every log message.
 *
 * @param name - Name for the child logger (e.g., 'Proposer', 'Controller')
 * @param metadata - Optional metadata to include with every log
 * @returns Child logger instance
 *
 * @example
 * ```typescript
 * const proposerLogger = createLogger('Proposer', { nodeId: '0x123...' })
 * proposerLogger.info('Block submitted')
 * // Output: [OYA NODE 🌪️] [2024-09-24 15:30:45] [INFO] [Proposer] Block submitted
 * ```
 *
 * @public
 */
export function createLogger(name, metadata) {
    const childLogger = logger.getSubLogger({
        name,
        ...(metadata && { defaultMeta: metadata }),
    });
    // Override the template to include the child name
    childLogger.settings.prettyLogTemplate = BASE_LOG_TEMPLATE + '[' + name + '] ';
    return childLogger;
}
/**
 * Log level enum for reference
 *
 * @public
 */
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["SILLY"] = 0] = "SILLY";
    LogLevel[LogLevel["TRACE"] = 1] = "TRACE";
    LogLevel[LogLevel["DEBUG"] = 2] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 3] = "INFO";
    LogLevel[LogLevel["WARN"] = 4] = "WARN";
    LogLevel[LogLevel["ERROR"] = 5] = "ERROR";
    LogLevel[LogLevel["FATAL"] = 6] = "FATAL";
})(LogLevel || (LogLevel = {}));
