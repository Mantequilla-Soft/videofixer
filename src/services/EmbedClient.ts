import axios from 'axios';
import { EmbedJobView, EmbedVideo, JobStatus } from '../types';

export interface WebhookCompletePayload {
  owner: string;
  permlink: string;
  status: 'complete';
  manifest_cid: string;
}

export interface WebhookFailedPayload {
  owner: string;
  permlink: string;
  status: 'failed';
  error: string;
}

export type WebhookPayload = WebhookCompletePayload | WebhookFailedPayload;

/**
 * Thin client for the 3speakembed service. videofixer holds these
 * credentials itself so the agent never needs to know 3speakembed exists
 * as a separate system — it only ever talks to videofixer.
 */
export class EmbedClient {
  constructor(private baseUrl: string, private adminPassword: string, private webhookApiKey: string) {}

  async getJobs(status: JobStatus, limit: number): Promise<{ jobs: EmbedJobView[]; count: number }> {
    const response = await axios.get(`${this.baseUrl}/admin/jobs`, {
      params: { status, limit },
      headers: { 'X-Admin-Password': this.adminPassword },
      timeout: 15000,
    });
    return response.data;
  }

  async getVideo(permlink: string): Promise<EmbedVideo | null> {
    try {
      const response = await axios.get(`${this.baseUrl}/video/${encodeURIComponent(permlink)}`, {
        timeout: 15000,
      });
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return null;
      }
      throw err;
    }
  }

  async callWebhook(payload: WebhookPayload): Promise<unknown> {
    const response = await axios.post(
      `${this.baseUrl}/webhook`,
      { ...payload, encoder_id: 'videofixer', timestamp: new Date().toISOString() },
      {
        headers: { 'X-API-Key': this.webhookApiKey, 'Content-Type': 'application/json' },
        timeout: 30000,
      }
    );
    return response.data;
  }
}
