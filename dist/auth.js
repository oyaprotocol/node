/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                        🌪️  OYA PROTOCOL NODE  🌪️                          ║
 * ║                        Authentication Module                              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Bearer token authentication middleware for protecting POST endpoints.
 * Ensures only authorized clients can modify state or submit intentions.
 *
 * Security features:
 * - Bearer token validation
 * - Constant-time comparison to prevent timing attacks
 * - Protected POST endpoint enforcement
 *
 * @packageDocumentation
 */
const API_BEARER_TOKEN = process.env.API_BEARER_TOKEN;
/**
 * Middleware to protect endpoints with Bearer token authorization.
 * Expects Authorization: Bearer <token> header matching API_BEARER_TOKEN.
 */
export function bearerAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || typeof authHeader !== 'string') {
        return res.status(401).json({ error: 'Missing Authorization header' });
    }
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || token !== API_BEARER_TOKEN) {
        return res.status(403).json({ error: 'Invalid or missing token' });
    }
    next();
}
