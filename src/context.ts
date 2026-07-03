import { Config } from './config/config';
import { Database } from './db/mongodb';
import { CaseLogger } from './services/CaseLogger';
import { EmbedClient } from './services/EmbedClient';
import { EncodeService } from './services/EncodeService';
import { IpfsService } from './services/IpfsService';
import { ProbeService } from './services/ProbeService';

export interface AppContext {
  config: Config;
  db: Database;
  embedClient: EmbedClient;
  ipfsService: IpfsService;
  probeService: ProbeService;
  encodeService: EncodeService;
  caseLogger: CaseLogger;
}

export function buildContext(config: Config, db: Database): AppContext {
  const embedClient = new EmbedClient(config.embedBaseUrl, config.embedAdminPassword, config.embedWebhookApiKey);
  const ipfsService = new IpfsService(config.ipfsGatewayUrl, config.ipfsHotnodeEndpoint);
  const probeService = new ProbeService();
  const encodeService = new EncodeService();
  const caseLogger = new CaseLogger(db);

  return { config, db, embedClient, ipfsService, probeService, encodeService, caseLogger };
}
