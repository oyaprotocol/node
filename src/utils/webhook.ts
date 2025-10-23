// utils/webhook.ts
import { getEnvConfig } from '../utils/env.js'
import { diagnostic, createLogger } from '../utils/logger.js'
import { setTimeout as delay } from 'timers/promises'

const log = createLogger('Webhook')

type Payload = Record<string, unknown>

type SendOptions = {
	timeoutMs?: number
	maxRetries?: number
}

export async function sendWebhook(
	payload: Payload,
	opts: SendOptions = {}
): Promise<void> {
	const {
		WEBHOOK_URL,
		WEBHOOK_SECRET,
		WEBHOOK_TIMEOUT_MS,
		WEBHOOK_MAX_RETRIES,
	} = getEnvConfig()
	const timeoutMs = Number(opts.timeoutMs ?? WEBHOOK_TIMEOUT_MS ?? 6000)
	const maxRetries = Number(opts.maxRetries ?? WEBHOOK_MAX_RETRIES ?? 6)

	if (!WEBHOOK_URL || !WEBHOOK_SECRET) {
		throw new Error('Missing WEBHOOK_URL or WEBHOOK_SECRET')
	}

	try {
		new URL(WEBHOOK_URL)
	} catch {
		throw new Error(`WEBHOOK_URL is not a valid URL: ${WEBHOOK_URL}`)
	}

	const body = JSON.stringify(payload)
	let attempt = 0
	let backoff = 500
	let lastError: unknown = null

	while (attempt < maxRetries) {
		attempt++
		const started = Date.now()

		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), timeoutMs)

		try {
			log.info(
				`Webhook attempt ${attempt}/${maxRetries} → ${WEBHOOK_URL} (payload ${body.length} bytes)`
			)

			const res = await fetch(WEBHOOK_URL, {
				method: 'POST',
				signal: controller.signal,
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${WEBHOOK_SECRET}`,
				},
				body,
			})

			clearTimeout(timeout)

			const took = Date.now() - started
			const ok = res.ok
			const status = res.status
			const text = !ok ? (await res.text()).slice(0, 1024) : ''

			diagnostic.debug('Webhook response', { status, took, ok })
			if (!ok) {
				if (status === 409) {
					log.warn('Webhook got 409 (duplicate) — treating as success')
					return
				}

				const retryable =
					status === 408 || status === 429 || (status >= 500 && status <= 599)
				const msg = `Webhook HTTP ${status} in ${took}ms. Body: ${text || '(empty)'}`
				if (!retryable) {
					throw new Error(`Non-retriable error: ${msg}`)
				}

				lastError = new Error(msg)
				log.warn(`${msg} — will retry`)
			} else {
				log.info(`Webhook delivered in ${took}ms (attempt ${attempt})`)
				return
			}
		} catch (err: unknown) {
			clearTimeout(timeout)
			lastError = err

			if (err instanceof Error && err.name === 'AbortError') {
				log.warn(
					`Webhook attempt ${attempt} aborted after ${timeoutMs}ms — will retry`
				)
			} else {
				log.warn(
					`Webhook attempt ${attempt} failed: ${stringifyErr(err)} — will retry`
				)
			}
		}

		await delay(backoff + Math.floor(Math.random() * 250))
		backoff = Math.min(backoff * 2, 15000)
	}

	const redacted = redactSecret(WEBHOOK_SECRET)
	diagnostic.error('Webhook failed; giving up', {
		url: WEBHOOK_URL,
		secretPreview: redacted,
		attempts: maxRetries,
		lastError: stringifyErr(lastError),
	})

	throw new Error(
		`Webhook failed after ${maxRetries} attempts: ${stringifyErr(lastError)}`
	)
}

function redactSecret(secret: string | undefined) {
	if (!secret) return '(missing)'
	if (secret.length <= 8) return '********'
	return `${secret.slice(0, 2)}***${secret.slice(-4)}`
}

function hasCode(e: unknown): e is { code: string | number } {
	return (
		typeof e === 'object' &&
		e !== null &&
		'code' in e &&
		(typeof (e as Record<string, unknown>).code === 'string' ||
			typeof (e as Record<string, unknown>).code === 'number')
	)
}

function stringifyErr(err: unknown): string {
	if (!err) return 'unknown error'
	if (typeof err === 'string') return err

	if (err instanceof Error) {
		const code = hasCode(err)
			? ` code=${String((err as { code: string | number }).code)}`
			: ''
		return `${err.name}: ${err.message}${code}`
	}

	try {
		return JSON.stringify(err)
	} catch {
		return String(err)
	}
}
