import { randomUUID } from 'crypto';
import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { AppContext } from '../context';
import { validateBody } from '../middleware/validate';
import { encodeBodySchema } from '../utils/validation';
import { diagnose } from '../services/DiagnosisEngine';
import { EncodeFailedError, LockedError } from '../services/EncodeService';
import { ensureCaseDir, removeCaseDir } from '../utils/workDir';
import { ProbeResult } from '../types';

export function encodeRouter(ctx: AppContext): Router {
  const router = Router();

  router.post('/encode', validateBody(encodeBodySchema), async (req, res) => {
    const body = encodeBodySchema.parse(req.body);
    const caseId = body.case_id ?? randomUUID();
    const lockKey = `${body.owner}/${body.permlink}`;

    try {
      ctx.encodeService.acquireLock(lockKey);
    } catch (err) {
      if (err instanceof LockedError) {
        return res.status(409).json({ case_id: caseId, error: err.message });
      }
      throw err;
    }

    try {
      const response = await ctx.caseLogger.withLogging(
        { caseId, owner: body.owner, permlink: body.permlink, trigger: 'reported' },
        'encode_requested',
        'encode_result',
        body,
        async () => {
          const dir = await ensureCaseDir(ctx.config.workDir, caseId);
          const inputPath = path.join(dir, 'input');

          // Reuse a probe already done for this case (e.g. by a prior
          // /probe call); otherwise defensively probe now — /encode must
          // work even if the agent calls it directly.
          const existingCase = await ctx.db.getCase(caseId);
          let probe: ProbeResult;

          if (existingCase?.probe) {
            probe = {
              codec: existingCase.probe.codec,
              pix_fmt: existingCase.probe.pix_fmt,
              color_range: existingCase.probe.color_range,
              resolution: existingCase.probe.resolution,
              alignment_ok: existingCase.probe.alignment_ok,
              has_audio: existingCase.probe.has_audio,
              audio_codec: null,
              duration_seconds: existingCase.probe.duration_seconds,
              corrupt: existingCase.probe.corrupt,
              ffprobe_error: existingCase.probe.probe_error,
            };
            await fs.access(inputPath).catch(async () => {
              await ctx.ipfsService.downloadToFile(body.cid, inputPath);
            });
          } else {
            await ctx.ipfsService.downloadToFile(body.cid, inputPath);
            const probed = await ctx.probeService.probeFile(inputPath);
            probe = probed.probe;
          }

          const diagnosis = diagnose(probe);
          const sourceHeight = probe.resolution?.height ?? 1080;

          const encodeStart = Date.now();
          const outcome = await ctx.encodeService.encode(inputPath, dir, {
            short: body.short,
            premium: body.premium,
            sourceHeight,
            hasAudio: probe.has_audio,
          });
          const encodeMs = Date.now() - encodeStart;

          const uploadStart = Date.now();
          const newManifestCid = await ctx.ipfsService.uploadDirectoryToHotnode(outcome.outputDir);
          const uploadMs = Date.now() - uploadStart;

          const response = {
            case_id: caseId,
            diagnosis: diagnosis.diagnosis,
            action_taken: outcome.actionTaken,
            new_manifest_cid: newManifestCid,
            encode_ms: encodeMs,
            upload_ms: uploadMs,
          };

          return {
            response,
            caseUpdate: {
              status: 'encoded' as const,
              encode: {
                at: new Date(),
                action_taken: outcome.actionTaken,
                encode_ms: encodeMs,
                upload_ms: uploadMs,
                output_size_bytes: null,
                new_manifest_cid: newManifestCid,
                encode_error: null,
              },
              result: 'fixed' as const,
            },
          };
        }
      );

      res.json(response);
    } catch (err) {
      if (err instanceof EncodeFailedError) {
        return res.status(422).json({ case_id: caseId, error: err.message });
      }
      res.status(500).json({ case_id: caseId, error: (err as Error).message });
    } finally {
      ctx.encodeService.releaseLock(lockKey);
      await removeCaseDir(ctx.config.workDir, caseId);
    }
  });

  return router;
}
