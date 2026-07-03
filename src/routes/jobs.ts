import { Router } from 'express';
import { AppContext } from '../context';
import { validateQuery } from '../middleware/validate';
import { jobsQuerySchema } from '../utils/validation';

export function jobsRouter(ctx: AppContext): Router {
  const router = Router();

  router.get('/jobs', validateQuery(jobsQuerySchema), async (req, res) => {
    const { status, limit } = jobsQuerySchema.parse(req.query);
    try {
      const result = await ctx.embedClient.getJobs(status, limit);
      res.json(result);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch jobs from embed service', detail: (err as Error).message });
    }
  });

  return router;
}
