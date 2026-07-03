import { Database } from '../db/mongodb';
import { AuditLogEntry, WisdomCase } from '../types';

export interface CaseContext {
  caseId: string;
  owner: string | null;
  permlink: string | null;
  trigger: 'reported' | 'failed-job-scan';
}

/**
 * Centralizes the "log every action automatically" requirement in one
 * place, rather than leaving each route to remember to do it. A case is
 * seeded on the *_requested entry (before work starts) and updated on the
 * *_result/error entry (after), inside a try/finally, so a crash mid-call
 * still leaves a "requested but no result" record instead of no record at
 * all — the audit log is the safety net for an agent with full autonomy to
 * finalize without human review, so silent gaps aren't acceptable.
 */
export class CaseLogger {
  constructor(private db: Database) {}

  async withLogging<T>(
    ctx: CaseContext,
    requestStage: AuditLogEntry['stage'],
    resultStage: AuditLogEntry['stage'],
    request: unknown,
    fn: () => Promise<{ response: unknown; caseUpdate?: Partial<WisdomCase> }>
  ): Promise<unknown> {
    await this.db.ensureCase(ctx.caseId, { owner: ctx.owner, permlink: ctx.permlink, trigger: ctx.trigger });
    await this.append(ctx, requestStage, request, null, null);

    try {
      const { response, caseUpdate } = await fn();
      await this.append(ctx, resultStage, null, response, null);
      if (caseUpdate) {
        await this.db.updateCase(ctx.caseId, caseUpdate);
      }
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.append(ctx, 'error', null, null, message);
      await this.db.updateCase(ctx.caseId, { status: 'error', notes: message });
      throw err;
    }
  }

  private async append(
    ctx: CaseContext,
    stage: AuditLogEntry['stage'],
    request: unknown,
    response: unknown,
    error: string | null
  ): Promise<void> {
    await this.db.appendAuditLog({
      case_id: ctx.caseId,
      owner: ctx.owner,
      permlink: ctx.permlink,
      stage,
      at: new Date(),
      request,
      response,
      error,
    });
  }
}
