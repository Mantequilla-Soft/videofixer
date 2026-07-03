import fs from 'fs/promises';
import path from 'path';

export function caseDir(workDir: string, caseId: string): string {
  return path.join(workDir, caseId);
}

export async function ensureCaseDir(workDir: string, caseId: string): Promise<string> {
  const dir = caseDir(workDir, caseId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function removeCaseDir(workDir: string, caseId: string): Promise<void> {
  const dir = caseDir(workDir, caseId);
  await fs.rm(dir, { recursive: true, force: true });
}

/**
 * Backstop against orphaned directories from crashed/never-finalized cases —
 * MAX_CONCURRENT_JOBS=1 means at most one directory should ever be "live," so
 * anything older than maxAgeHours is safe to assume abandoned.
 */
export async function sweepStaleWorkDirs(workDir: string, maxAgeHours: number): Promise<string[]> {
  const removed: string[] = [];
  let entries: string[];
  try {
    entries = await fs.readdir(workDir);
  } catch {
    return removed;
  }

  const cutoffMs = Date.now() - maxAgeHours * 60 * 60 * 1000;

  for (const entry of entries) {
    const full = path.join(workDir, entry);
    try {
      const stat = await fs.stat(full);
      if (stat.isDirectory() && stat.mtimeMs < cutoffMs) {
        await fs.rm(full, { recursive: true, force: true });
        removed.push(entry);
      }
    } catch {
      // Entry disappeared or unreadable — ignore, next sweep will retry.
    }
  }

  return removed;
}
