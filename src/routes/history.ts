import { Router } from 'express';
import { AppContext } from '../context';
import { validateQuery } from '../middleware/validate';
import { historyQuerySchema } from '../utils/validation';
import { WisdomCase } from '../types';

export function historyRouter(ctx: AppContext): Router {
  const router = Router();

  router.get('/history', validateQuery(historyQuerySchema), async (req, res) => {
    const query = historyQuerySchema.parse(req.query);

    try {
      const cases = await ctx.db.queryHistory({
        diagnosis: query.diagnosis,
        codec: query.codec,
        errorContains: query.error_contains,
        owner: query.owner,
        permlink: query.permlink,
        since: query.since,
        until: query.until,
        limit: query.limit,
        skip: query.skip,
      });

      const shaped = query.full ? cases : cases.map(summarize);
      res.json({ count: shaped.length, cases: shaped });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}

function summarize(c: WisdomCase) {
  return {
    case_id: c.case_id,
    owner: c.owner,
    permlink: c.permlink,
    trigger: c.trigger,
    status: c.status,
    created_at: c.created_at,
    diagnosis: c.probe?.diagnosis ?? null,
    flags: c.probe?.flags ?? [],
    action_taken: c.encode?.action_taken ?? null,
    new_manifest_cid: c.encode?.new_manifest_cid ?? null,
    finalize_status: c.finalize?.status ?? null,
    result: c.result,
  };
}
