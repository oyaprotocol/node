import { Request, Response, NextFunction } from 'express';

const API_BEARER_TOKEN = process.env.API_BEARER_TOKEN;

/**
 * Middleware to protect endpoints with Bearer token authorization.
 * Expects Authorization: Bearer <token> header matching API_BEARER_TOKEN.
 */
export function bearerAuth(req: Request, res: Response, next: NextFunction) {
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