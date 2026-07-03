import { Request, Response, NextFunction } from 'express';

/**
 * Single static API key for the Hermes agent — mirrors
 * 3speakembed/src/middleware/auth.ts's header conventions.
 */
export function createApiKeyAuthMiddleware(apiKey: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const provided = (req.headers['x-api-key'] as string) || req.headers['authorization']?.replace('Bearer ', '');

    if (!provided) {
      return res.status(401).json({ error: 'API key required in X-API-Key or Authorization header' });
    }

    if (provided !== apiKey) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    next();
  };
}
