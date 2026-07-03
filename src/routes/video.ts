import { Router } from 'express';
import { AppContext } from '../context';

export function videoRouter(ctx: AppContext): Router {
  const router = Router();

  router.get('/video/:permlink', async (req, res) => {
    try {
      const video = await ctx.embedClient.getVideo(req.params.permlink);
      if (!video) {
        return res.status(404).json({ error: 'Video not found' });
      }
      res.json(video);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch video from embed service', detail: (err as Error).message });
    }
  });

  return router;
}
