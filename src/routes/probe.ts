import { randomUUID } from 'crypto';
import { Router } from 'express';
import path from 'path';
import { AppContext } from '../context';
import { validateBody } from '../middleware/validate';
import { probeBodySchema } from '../utils/validation';
import { diagnose } from '../services/DiagnosisEngine';
import { ensureCaseDir } from '../utils/workDir';
import { ProbeResult } from '../types';

export function probeRouter(ctx: AppContext): Router {
  const router = Router();

  router.post('/probe', validateBody(probeBodySchema), async (req, res) => {
    const body = probeBodySchema.parse(req.body);
    const caseId = body.case_id ?? randomUUID();
    const owner = body.owner ?? null;
    const permlink = body.permlink ?? null;

    try {
      const response = await ctx.caseLogger.withLogging(
        { caseId, owner, permlink, trigger: 'reported' },
        'probe_requested',
        'probe_result',
        body,
        async () => {
          const dir = await ensureCaseDir(ctx.config.workDir, caseId);
          const inputPath = path.join(dir, 'input');

          const downloadStart = Date.now();
          let probe: ProbeResult;
          let raw: unknown = null;

          try {
            await ctx.ipfsService.downloadToFile(body.cid, inputPath);
            ({ probe, raw } = await ctx.probeService.probeFile(inputPath));
          } catch (downloadErr) {
            // A download failure (source unavailable/corrupt after retry) is a
            // valid diagnostic result, not a server error — surface it as
            // diagnosis="corrupt-input" like any other unreadable input.
            probe = {
              codec: null,
              pix_fmt: null,
              color_range: null,
              resolution: null,
              alignment_ok: false,
              has_audio: false,
              audio_codec: null,
              duration_seconds: null,
              corrupt: true,
              ffprobe_error: `download failed: ${(downloadErr as Error).message}`,
            };
          }
          const downloadMs = Date.now() - downloadStart;

          const result = diagnose(probe);

          const response = { case_id: caseId, cid: body.cid, ...result };

          return {
            response,
            caseUpdate: {
              status: 'probed' as const,
              probe: {
                at: new Date(),
                input_cid: body.cid,
                download_ms: downloadMs,
                codec: probe.codec,
                pix_fmt: probe.pix_fmt,
                color_range: probe.color_range,
                resolution: probe.resolution,
                has_audio: probe.has_audio,
                duration_seconds: probe.duration_seconds,
                alignment_ok: probe.alignment_ok,
                corrupt: probe.corrupt,
                probe_error: probe.ffprobe_error,
                flags: result.flags,
                diagnosis: result.diagnosis,
                ffprobe_raw: raw,
              },
              result: result.fixable ? ('pending' as const) : ('unfixable' as const),
            },
          };
        }
      );

      res.json(response);
    } catch (err) {
      res.status(500).json({ case_id: caseId, error: (err as Error).message });
    }
  });

  return router;
}
