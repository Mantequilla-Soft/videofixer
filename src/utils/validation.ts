import { z } from 'zod';

export const jobsQuerySchema = z.object({
  status: z.enum(['pending', 'encoding', 'completed', 'failed']).default('failed'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const probeBodySchema = z.object({
  cid: z.string().min(1),
  owner: z.string().optional(),
  permlink: z.string().optional(),
  case_id: z.string().optional(),
});

export const encodeBodySchema = z.object({
  cid: z.string().min(1),
  owner: z.string().min(1),
  permlink: z.string().min(1),
  case_id: z.string().optional(),
  short: z.boolean(),
  premium: z.boolean(),
});

export const finalizeBodySchema = z
  .object({
    owner: z.string().min(1),
    permlink: z.string().min(1),
    status: z.enum(['complete', 'failed']),
    manifest_cid: z.string().optional(),
    error: z.string().optional(),
    case_id: z.string().optional(),
  })
  .refine((body) => (body.status === 'complete' ? Boolean(body.manifest_cid) : true), {
    message: 'manifest_cid is required when status is "complete"',
    path: ['manifest_cid'],
  })
  .refine((body) => (body.status === 'failed' ? Boolean(body.error) : true), {
    message: 'error is required when status is "failed"',
    path: ['error'],
  });

export const historyQuerySchema = z.object({
  diagnosis: z.string().optional(),
  codec: z.string().optional(),
  error_contains: z.string().optional(),
  owner: z.string().optional(),
  permlink: z.string().optional(),
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  skip: z.coerce.number().int().min(0).default(0),
  full: z.coerce.boolean().default(false),
});
