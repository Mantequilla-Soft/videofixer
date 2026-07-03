import { describe, expect, it } from 'vitest';
import { CaseLogger } from '../src/services/CaseLogger';
import { Database } from '../src/db/mongodb';
import { AuditLogEntry, WisdomCase } from '../src/types';

class FakeDatabase {
  ensureCaseCalls: Array<{ caseId: string; seed: Partial<WisdomCase> }> = [];
  auditLogEntries: AuditLogEntry[] = [];
  updateCaseCalls: Array<{ caseId: string; update: Partial<WisdomCase> }> = [];

  async ensureCase(caseId: string, seed: Partial<WisdomCase>): Promise<void> {
    this.ensureCaseCalls.push({ caseId, seed });
  }

  async appendAuditLog(entry: AuditLogEntry): Promise<void> {
    this.auditLogEntries.push(entry);
  }

  async updateCase(caseId: string, update: Partial<WisdomCase>): Promise<void> {
    this.updateCaseCalls.push({ caseId, update });
  }
}

function makeLogger() {
  const fakeDb = new FakeDatabase();
  const logger = new CaseLogger(fakeDb as unknown as Database);
  return { fakeDb, logger };
}

describe('CaseLogger.withLogging', () => {
  it('seeds the case and logs a requested + result entry on success, then applies the case update', async () => {
    const { fakeDb, logger } = makeLogger();

    const response = await logger.withLogging(
      { caseId: 'case-1', owner: 'alice', permlink: 'abc123', trigger: 'reported' },
      'probe_requested',
      'probe_result',
      { cid: 'QmXYZ' },
      async () => ({ response: { ok: true }, caseUpdate: { status: 'probed' } })
    );

    expect(response).toEqual({ ok: true });

    expect(fakeDb.ensureCaseCalls).toHaveLength(1);
    expect(fakeDb.ensureCaseCalls[0]).toMatchObject({
      caseId: 'case-1',
      seed: { owner: 'alice', permlink: 'abc123', trigger: 'reported' },
    });

    expect(fakeDb.auditLogEntries).toHaveLength(2);
    expect(fakeDb.auditLogEntries[0]).toMatchObject({ case_id: 'case-1', stage: 'probe_requested', request: { cid: 'QmXYZ' } });
    expect(fakeDb.auditLogEntries[1]).toMatchObject({ case_id: 'case-1', stage: 'probe_result', response: { ok: true } });

    expect(fakeDb.updateCaseCalls).toHaveLength(1);
    expect(fakeDb.updateCaseCalls[0]).toMatchObject({ caseId: 'case-1', update: { status: 'probed' } });
  });

  it('still logs a requested entry and an error entry when the work function throws, then rethrows', async () => {
    const { fakeDb, logger } = makeLogger();

    await expect(
      logger.withLogging(
        { caseId: 'case-2', owner: 'alice', permlink: 'abc123', trigger: 'reported' },
        'encode_requested',
        'encode_result',
        { cid: 'QmXYZ' },
        async () => {
          throw new Error('ffmpeg exploded');
        }
      )
    ).rejects.toThrow('ffmpeg exploded');

    // Even though the work threw partway through, the "requested" entry from
    // before the call and an "error" entry after it must both exist — this
    // is the guarantee the whole autonomy model depends on: no silent gaps.
    expect(fakeDb.auditLogEntries).toHaveLength(2);
    expect(fakeDb.auditLogEntries[0].stage).toBe('encode_requested');
    expect(fakeDb.auditLogEntries[1]).toMatchObject({ stage: 'error', error: 'ffmpeg exploded' });

    expect(fakeDb.updateCaseCalls).toHaveLength(1);
    expect(fakeDb.updateCaseCalls[0]).toMatchObject({
      caseId: 'case-2',
      update: { status: 'error', notes: 'ffmpeg exploded' },
    });
  });

  it('does not call updateCase when the work function succeeds but returns no caseUpdate', async () => {
    const { fakeDb, logger } = makeLogger();

    await logger.withLogging(
      { caseId: 'case-3', owner: null, permlink: null, trigger: 'reported' },
      'finalize_requested',
      'finalize_result',
      {},
      async () => ({ response: { done: true } })
    );

    expect(fakeDb.updateCaseCalls).toHaveLength(0);
  });
});
