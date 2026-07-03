import { randomUUID } from 'crypto';
import { Router } from 'express';
import { AppContext } from '../context';
import { validateBody } from '../middleware/validate';
import { finalizeBodySchema } from '../utils/validation';

export function finalizeRouter(ctx: AppContext): Router {
  const router = Router();

  router.post('/finalize', validateBody(finalizeBodySchema), async (req, res) => {
    const body = finalizeBodySchema.parse(req.body);
    const caseId = body.case_id ?? randomUUID();

    try {
      const response = await ctx.caseLogger.withLogging(
        { caseId, owner: body.owner, permlink: body.permlink, trigger: 'reported' },
        'finalize_requested',
        'finalize_result',
        body,
        async () => {
          const embedResponse =
            body.status === 'complete'
              ? await ctx.embedClient.callWebhook({
                  owner: body.owner,
                  permlink: body.permlink,
                  status: 'complete',
                  manifest_cid: body.manifest_cid as string,
                })
              : await ctx.embedClient.callWebhook({
                  owner: body.owner,
                  permlink: body.permlink,
                  status: 'failed',
                  error: body.error as string,
                });

          const response = { case_id: caseId, owner: body.owner, permlink: body.permlink, embed_response: embedResponse };

          return {
            response,
            caseUpdate: {
              status: 'finalized' as const,
              finalize: {
                at: new Date(),
                status: body.status,
                manifest_cid: body.manifest_cid ?? null,
                error: body.error ?? null,
                embed_response: embedResponse,
              },
              result: body.status === 'complete' ? ('fixed' as const) : ('unfixable' as const),
            },
          };
        }
      );

      res.json(response);
    } catch (err) {
      res.status(502).json({ case_id: caseId, error: `Failed to finalize via embed webhook: ${(err as Error).message}` });
    }
  });

  return router;
}
