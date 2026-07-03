import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  port: number;
  logLevel: string;

  videofixerApiKey: string;

  mongoUri: string;
  mongoDbName: string;

  embedBaseUrl: string;
  embedAdminPassword: string;
  embedWebhookApiKey: string;

  ipfsGatewayUrl: string;
  ipfsHotnodeEndpoint: string;

  workDir: string;
  workDirSweepMaxAgeHours: number;

  maxConcurrentJobs: number;
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env.PORT || '3200', 10),
    logLevel: process.env.LOG_LEVEL || 'info',

    videofixerApiKey: process.env.VIDEOFIXER_API_KEY || '',

    mongoUri: process.env.MONGODB_URI || '',
    mongoDbName: process.env.MONGODB_DATABASE || 'videofixer',

    embedBaseUrl: process.env.EMBED_BASE_URL || '',
    embedAdminPassword: process.env.EMBED_ADMIN_PASSWORD || '',
    embedWebhookApiKey: process.env.EMBED_WEBHOOK_API_KEY || '',

    ipfsGatewayUrl: process.env.IPFS_GATEWAY_URL || 'https://ipfs.3speak.tv/ipfs',
    ipfsHotnodeEndpoint: process.env.IPFS_HOTNODE_ENDPOINT || '',

    workDir: process.env.WORK_DIR || './work',
    workDirSweepMaxAgeHours: parseInt(process.env.WORK_DIR_SWEEP_MAX_AGE_HOURS || '6', 10),

    maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '1', 10),
  };
}

export function validateConfig(config: Config): string[] {
  const problems: string[] = [];
  if (!config.videofixerApiKey) problems.push('VIDEOFIXER_API_KEY is not set — agent requests cannot be authenticated');
  if (!config.mongoUri) problems.push('MONGODB_URI is not set');
  if (!config.embedBaseUrl) problems.push('EMBED_BASE_URL is not set');
  if (!config.embedAdminPassword) problems.push('EMBED_ADMIN_PASSWORD is not set — GET /jobs will fail');
  if (!config.embedWebhookApiKey) problems.push('EMBED_WEBHOOK_API_KEY is not set — POST /finalize will fail');
  if (!config.ipfsHotnodeEndpoint) problems.push('IPFS_HOTNODE_ENDPOINT is not set — POST /encode uploads will fail');
  return problems;
}
