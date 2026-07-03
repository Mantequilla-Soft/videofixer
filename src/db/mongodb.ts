import { MongoClient, Db, Collection } from 'mongodb';
import { AuditLogEntry, WisdomCase } from '../types';

export interface HistoryQuery {
  diagnosis?: string;
  codec?: string;
  errorContains?: string;
  owner?: string;
  permlink?: string;
  since?: Date;
  until?: Date;
  limit: number;
  skip: number;
}

export class Database {
  private client: MongoClient;
  private db: Db | null = null;
  private auditLog: Collection<AuditLogEntry> | null = null;
  private cases: Collection<WisdomCase> | null = null;

  constructor(connectionString: string) {
    this.client = new MongoClient(connectionString);
  }

  async connect(dbName: string): Promise<void> {
    await this.client.connect();
    this.db = this.client.db(dbName);

    this.auditLog = this.db.collection<AuditLogEntry>('audit_log');
    await this.auditLog.createIndex({ case_id: 1, at: 1 });
    await this.auditLog.createIndex({ owner: 1, permlink: 1, at: -1 });
    await this.auditLog.createIndex({ at: -1 });

    this.cases = this.db.collection<WisdomCase>('cases');
    await this.cases.createIndex({ case_id: 1 }, { unique: true });
    await this.cases.createIndex({ owner: 1, permlink: 1, created_at: -1 });
    await this.cases.createIndex({ 'probe.diagnosis': 1 });
    await this.cases.createIndex({ created_at: -1 });

    console.log('videofixer connected to MongoDB');
  }

  async appendAuditLog(entry: AuditLogEntry): Promise<void> {
    if (!this.auditLog) throw new Error('Database not connected');
    await this.auditLog.insertOne(entry);
  }

  async ensureCase(caseId: string, seed: Partial<WisdomCase>): Promise<void> {
    if (!this.cases) throw new Error('Database not connected');
    const now = new Date();
    await this.cases.updateOne(
      { case_id: caseId },
      {
        $setOnInsert: {
          case_id: caseId,
          owner: seed.owner ?? null,
          permlink: seed.permlink ?? null,
          trigger: seed.trigger ?? 'reported',
          status: 'probing',
          created_at: now,
          result: 'pending',
          verified_playback: null,
          notes: null,
        },
        $set: { updated_at: now },
      },
      { upsert: true }
    );
  }

  async updateCase(caseId: string, update: Partial<WisdomCase>): Promise<void> {
    if (!this.cases) throw new Error('Database not connected');
    await this.cases.updateOne(
      { case_id: caseId },
      { $set: { ...update, updated_at: new Date() } },
      { upsert: true }
    );
  }

  async getCase(caseId: string): Promise<WisdomCase | null> {
    if (!this.cases) throw new Error('Database not connected');
    return this.cases.findOne({ case_id: caseId });
  }

  async queryHistory(query: HistoryQuery): Promise<WisdomCase[]> {
    if (!this.cases) throw new Error('Database not connected');
    const filter: Record<string, unknown> = {};

    if (query.diagnosis) filter['probe.diagnosis'] = query.diagnosis;
    if (query.codec) filter['probe.codec'] = query.codec;
    if (query.owner) filter.owner = query.owner;
    if (query.permlink) filter.permlink = query.permlink;

    if (query.errorContains) {
      const re = { $regex: query.errorContains, $options: 'i' };
      filter.$or = [
        { 'probe.probe_error': re },
        { 'encode.encode_error': re },
        { 'finalize.error': re },
      ];
    }

    if (query.since || query.until) {
      const range: Record<string, Date> = {};
      if (query.since) range.$gte = query.since;
      if (query.until) range.$lte = query.until;
      filter.created_at = range;
    }

    return this.cases
      .find(filter)
      .sort({ created_at: -1 })
      .skip(query.skip)
      .limit(query.limit)
      .toArray();
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
