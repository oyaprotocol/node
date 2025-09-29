import {
	logger,
	diagnostic,
	createLogger,
	LogLevel,
} from '../src/utils/logger.js'

describe('Logger Tests', () => {
	it('should log at different levels', () => {
		console.log('\n=== Testing Main Logger ===\n')

		logger.silly('This is a silly log')
		logger.trace('This is a trace log')
		logger.debug('This is a debug log')
		logger.info('This is an info log', { extra: 'data' })
		logger.warn('This is a warning', { count: 42 })
		logger.error('This is an error', new Error('Test error'))
		logger.fatal('This is fatal')
	})

	it('should create child loggers with context', () => {
		console.log('\n=== Testing Child Loggers ===\n')

		const proposerLogger = createLogger('Proposer', { nodeId: '0x123' })
		proposerLogger.info('Block created', { blockNumber: 100 })

		const controllerLogger = createLogger('Controller')
		controllerLogger.warn('Database connection slow', { latency: 500 })
	})

	it('should handle complex objects', () => {
		console.log('\n=== Testing Complex Objects ===\n')

		const complexData = {
			block: {
				number: 123,
				hash: '0xabc...def',
				intentions: [
					{ from: '0x111', to: '0x222', amount: 1000 },
					{ from: '0x333', to: '0x444', amount: 2000 },
				],
			},
			metadata: {
				timestamp: new Date(),
				proposer: process.env.PROPOSER_ADDRESS || '0x536d259A6D175b4c971d2e6a8d5191087363c724',
			},
		}

		logger.info('Processing block', complexData)
	})

	it('should test diagnostic logger', () => {
		console.log('\n=== Testing Diagnostic Logger ===\n')
		console.log(
			'Diagnostic mode enabled:',
			process.env.DIAGNOSTIC_LOGGER === 'true'
		)

		diagnostic.trace('Trace level diagnostic', { step: 1 })
		diagnostic.debug('Debug level', { cache: ['item1', 'item2'] })
		diagnostic.info('Info level diagnostic', {
			performance: { cpu: 0.8, memory: 0.6 },
		})
	})

	it('should demonstrate log levels', () => {
		console.log('\n=== Log Level Reference ===\n')
		console.log('LogLevel.SILLY =', LogLevel.SILLY)
		console.log('LogLevel.TRACE =', LogLevel.TRACE)
		console.log('LogLevel.DEBUG =', LogLevel.DEBUG)
		console.log('LogLevel.INFO =', LogLevel.INFO)
		console.log('LogLevel.WARN =', LogLevel.WARN)
		console.log('LogLevel.ERROR =', LogLevel.ERROR)
		console.log('LogLevel.FATAL =', LogLevel.FATAL)
		console.log(
			'\nCurrent LOG_LEVEL env var:',
			process.env.LOG_LEVEL || '3 (default)'
		)
	})
})
