import express, { Request, Response, NextFunction } from 'express';
import { loadConfig, validateConfig } from './config/config';
import { Database } from './db/mongodb';
import { buildContext } from './context';
import { createApiKeyAuthMiddleware } from './middleware/apiKeyAuth';
import { jobsRouter } from './routes/jobs';
import { videoRouter } from './routes/video';
import { probeRouter } from './routes/probe';
import { encodeRouter } from './routes/encode';
import { finalizeRouter } from './routes/finalize';
import { historyRouter } from './routes/history';
import { sweepStaleWorkDirs } from './utils/workDir';

async function main(): Promise<void> {
  const config = loadConfig();

  for (const problem of validateConfig(config)) {
    console.warn(`[config] ${problem}`);
  }

  const db = new Database(config.mongoUri);
  await db.connect(config.mongoDbName);

  const ctx = buildContext(config, db);

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'videofixer' });
  });

  const requireApiKey = createApiKeyAuthMiddleware(config.videofixerApiKey);
  app.use(requireApiKey);

  app.use(jobsRouter(ctx));
  app.use(videoRouter(ctx));
  app.use(probeRouter(ctx));
  app.use(encodeRouter(ctx));
  app.use(finalizeRouter(ctx));
  app.use(historyRouter(ctx));

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  const server = app.listen(config.port, () => {
    console.log(`videofixer listening on port ${config.port}`);
  });

  // Backstop against orphaned work directories from crashed/never-finalized
  // cases — MAX_CONCURRENT_JOBS=1 means at most one should ever be "live."
  const sweepInterval = setInterval(async () => {
    const removed = await sweepStaleWorkDirs(config.workDir, config.workDirSweepMaxAgeHours);
    if (removed.length > 0) {
      console.log(`[cleanup] swept ${removed.length} stale work directory(ies): ${removed.join(', ')}`);
    }
  }, 30 * 60 * 1000);

  const shutdown = async () => {
    console.log('Shutting down videofixer...');
    clearInterval(sweepInterval);
    server.close();
    await db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
