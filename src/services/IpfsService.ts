import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

async function getAllFiles(dirPath: string): Promise<string[]> {
  const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getAllFiles(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

export class IpfsService {
  constructor(private gatewayUrl: string, private hotnodeEndpoint: string) {}

  /**
   * Downloads a CID from the configured IPFS gateway to a local file.
   * One retry with a short backoff — a bad gateway fetch is otherwise
   * indistinguishable from a genuinely corrupt/unavailable source.
   */
  async downloadToFile(cid: string, destPath: string): Promise<void> {
    const url = `${this.gatewayUrl}/${cid}`;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await axios.get(url, {
          responseType: 'stream',
          timeout: 5 * 60 * 1000,
        });

        await new Promise<void>((resolve, reject) => {
          const writer = fs.createWriteStream(destPath);
          response.data.pipe(writer);
          writer.on('finish', resolve);
          writer.on('error', reject);
          response.data.on('error', reject);
        });

        return;
      } catch (err) {
        lastError = err as Error;
        if (attempt === 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    throw lastError ?? new Error('Download failed for unknown reason');
  }

  /**
   * Uploads a directory to the IPFS hot node with wrap-with-directory=true,
   * returning the resulting directory CID. Ported from
   * 3SpeakEncoderNew/src/services/IPFSService.ts uploadDirectoryToHotnode().
   */
  async uploadDirectoryToHotnode(dirPath: string): Promise<string> {
    if (!this.hotnodeEndpoint) {
      throw new Error('IPFS_HOTNODE_ENDPOINT is not configured');
    }

    const files = await getAllFiles(dirPath);
    const form = new FormData();
    let totalSize = 0;
    const streams: fs.ReadStream[] = [];

    for (const filePath of files) {
      const relativePath = path.relative(dirPath, filePath);
      const stats = await fsPromises.stat(filePath);
      totalSize += stats.size;

      const stream = fs.createReadStream(filePath);
      streams.push(stream);
      form.append('file', stream, { filename: relativePath, filepath: relativePath });
    }

    const cleanup = () => {
      for (const stream of streams) {
        try {
          if (!stream.destroyed) stream.destroy();
        } catch {
          // ignore
        }
      }
    };

    // Base 60s + ~1 MB/s expected throughput, capped at 20 minutes.
    const timeoutMs = Math.min(60_000 + (totalSize / (1024 * 1024)) * 1000, 20 * 60 * 1000);
    const uploadUrl = `${this.hotnodeEndpoint}?wrap-with-directory=true`;

    try {
      const response = await axios.post(uploadUrl, form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: timeoutMs,
        responseType: 'text',
        validateStatus: (status) => status < 400,
      });

      const lines: string[] = String(response.data).trim().split('\n').filter(Boolean);
      let directoryHash = '';

      for (const line of lines) {
        try {
          const result = JSON.parse(line);
          if (!result.Name) {
            directoryHash = result.Hash;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!directoryHash) {
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const result = JSON.parse(lines[i]);
            if (result.Hash) {
              directoryHash = result.Hash;
              break;
            }
          } catch {
            continue;
          }
        }
      }

      if (!directoryHash) {
        throw new Error('Could not extract directory hash from hotnode response');
      }

      return directoryHash;
    } finally {
      cleanup();
    }
  }
}
