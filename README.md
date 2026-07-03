# videofixer

Autonomous video repair API for the 3Speak encoding pipeline. It automates the manual triage flow of downloading a broken video's source, probing it with `ffprobe`, applying a corrected re-encode, uploading the result to IPFS, and updating the video's status — so an AI agent can do this work unattended.

It is designed to be driven by an agent, not a human. See **[`llms.txt`](./llms.txt)** for the operating manual an agent should read before calling this API — endpoint contracts, the expected workflow, and error-handling guidance all live there. This README is for people setting up, deploying, or modifying the service.

## How it fits together

```
Hermes agent → videofixer (own API key)
                  ├─→ 3speakembed  GET /admin/jobs?status=failed   (job discovery)
                  ├─→ 3speakembed  GET /video/:permlink            (video lookup)
                  ├─→ 3speakembed  POST /webhook                   (finalize, encoder_id: "videofixer")
                  ├─→ IPFS gateway (download source CID)
                  ├─→ IPFS hot node (upload corrected HLS output, wrap-with-directory)
                  └─→ MongoDB `videofixer` db (audit_log + cases — the "wisdom archive")
```

videofixer is the only surface the agent talks to. It holds its own credentials for `3speakembed` (admin password + webhook API key) and proxies those calls internally — the agent never sees `3speakembed`'s secrets. `3speakembed` itself only needed one addition for this to work: `GET /admin/jobs`, a job-listing endpoint that didn't exist before (see `3speakembed/src/index.ts` and `src/database/mongodb.ts`'s `getJobsForVideofixer`).

Known, documented failure classes this was built around: missing audio tracks, full-range (`yuvj420p`) color instead of limited-range, and non-16px-aligned resolutions — all of which break native mobile HLS players (ExoPlayer/AVPlayer) while looking fine on web. videofixer's `/encode` always applies the corrected baseline (forced `yuv420p`, guaranteed audio track, 16px-aligned scaling) rather than branching per-diagnosis, so a partial fix can't leave a sibling bug in place.

## Setup

```bash
npm install
cp .env.example .env   # fill in real values, see below
npm run build
npm start               # or `npm run dev` for ts-node without a build step
```

Requires `ffmpeg`/`ffprobe` on `PATH` (the `Dockerfile` installs it via `apk add ffmpeg` on Alpine).

### Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default `3200`) |
| `VIDEOFIXER_API_KEY` | Required by every route except `/health`, via `X-API-Key` |
| `MONGODB_URI` | Same MongoDB deployment as `3speakembed` is fine — videofixer uses its own database |
| `MONGODB_DATABASE` | videofixer's own DB (default `videofixer`) — never touches `embed-jobs`/`embed-video` directly, everything crosses via the `3speakembed` HTTP endpoints below |
| `EMBED_BASE_URL` | Base URL of the `3speakembed` deployment |
| `EMBED_ADMIN_PASSWORD` | Same value as `3speakembed`'s `ADMIN_PASSWORD` — used for `GET /admin/jobs` |
| `EMBED_WEBHOOK_API_KEY` | Same value as `3speakembed`'s `WEBHOOK_API_KEY` — used for `POST /webhook` at finalize time |
| `IPFS_GATEWAY_URL` | Gateway used to download source CIDs (default `https://ipfs.3speak.tv/ipfs`) |
| `IPFS_HOTNODE_ENDPOINT` | IPFS node `/api/v0/add` endpoint corrected encodes are uploaded to (wrap-with-directory). Required before `/encode` will work. |
| `WORK_DIR` | Local scratch space for downloads/encodes (default `./work`) |
| `WORK_DIR_SWEEP_MAX_AGE_HOURS` | Backstop cleanup for orphaned directories from crashed cases (default `6`) |
| `MAX_CONCURRENT_JOBS` | Reserved for future use — `/encode` currently enforces one-at-a-time per `owner/permlink` via an in-process lock regardless of this value |

Missing config is logged as warnings at startup (`[config] ...`), not a hard failure, so you can see what's missing without the whole process refusing to boot — except `MONGODB_URI`, which is required to connect.

## Project layout

```
src/
  config/config.ts        loadConfig() / validateConfig()
  db/mongodb.ts            audit_log + cases collections (the wisdom archive)
  services/
    EmbedClient.ts          talks to 3speakembed (jobs, video, webhook)
    IpfsService.ts           download source CIDs, upload corrected output to the hot node
    ProbeService.ts          ffprobe wrapper, ported from 3SpeakEncoderNew/VideoProcessor.ts
    DiagnosisEngine.ts       pure fn: ffprobe facts -> flags/diagnosis/fixable
    EncodeService.ts         the corrected-baseline HLS encode pipeline + per-video lock
    ManifestBuilder.ts       master manifest.m3u8 generation
    CaseLogger.ts            wraps every route so every action is logged automatically
  middleware/               API key auth, zod request validation
  routes/                   jobs, video, probe, encode, finalize, history
  index.ts                  express app bootstrap
```

## Why the audit log is not optional

The Hermes agent finalizes fixes (marks jobs complete/failed) with no human in the loop before acting — the log is the only after-the-fact safety net, not a nice-to-have. `CaseLogger.withLogging()` wraps every route handler so a `*_requested` audit entry is written *before* work starts and a `*_result` (or `error`) entry *after* — even a crash mid-request leaves a "requested but no result" record rather than silence. Query it via `GET /history`, or read the `cases`/`audit_log` collections directly.

## Deployment

Production runs as a pm2-managed process on port `3200`, behind Nginx at `videofixer.3speak.tv`.

### pm2

`ecosystem.config.js` is checked into the repo (mirrors the pattern used by `supernodemonitor`/`activitytracker` on this box). It intentionally does **not** set `PORT` — that stays in `.env` as the single source of truth, read via `dotenv` at startup.

```bash
git clone https://github.com/Mantequilla-Soft/videofixer.git
cd videofixer
npm install
cp .env.example .env    # fill in real values — see the table above
npm run build

pm2 start ecosystem.config.js
pm2 save                 # persist the process list
pm2 startup              # follow its printed instructions once, so pm2 survives a reboot
```

Adjust `cwd` in `ecosystem.config.js` if you clone somewhere other than `/home/meno/videofixer`. **`instances` must stay `1`** — the per-video encode lock (`EncodeService`'s in-process `Set`) isn't shared across pm2 cluster workers, so cluster mode would silently break the "one fix at a time per video" guarantee `/encode`'s `409` response depends on.

To ship a change: `git pull && npm install && npm run build && pm2 restart videofixer`.

Logs: `pm2 logs videofixer`, or directly at `~/.pm2/logs/videofixer-{out,error}.log`.

### Nginx

`videofixer.3speak.tv.nginx` is the starting server block — proxies to `127.0.0.1:3200` with generous timeouts (`/encode` is a long synchronous request: download + ffmpeg + IPFS upload can take minutes). Point DNS at the box, drop the file in, then let Certbot add HTTPS the same way it's done for the other `*.3speak.tv` sites here:

```bash
sudo cp videofixer.3speak.tv.nginx /etc/nginx/sites-available/videofixer.3speak.tv
sudo ln -s /etc/nginx/sites-available/videofixer.3speak.tv /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# once the videofixer.3speak.tv A record has propagated:
sudo certbot --nginx -d videofixer.3speak.tv
```

Certbot rewrites the file in place to add the HTTPS server block, SSL directives, and an HTTP → HTTPS redirect — don't hand-edit `ssl_certificate` lines yourself.

### Docker (alternative)

`Dockerfile` builds a `node:18-alpine` image with `ffmpeg` and `curl` (for the healthcheck) installed, matching `3SpeakEncoderNew`'s production image conventions. Not what's actually deployed today (that's pm2, above), but kept in sync in case that changes.

```bash
docker build -t videofixer .
docker run -d --env-file .env -p 3200:3200 -v videofixer-work:/app/work videofixer
```

## Verifying a change

```bash
npm run build       # tsc must be clean
npm run watch        # tsc --watch during development
npm test              # vitest — unit tests for the pure/logic-heavy pieces
```

The unit tests cover the parts that are cheap to test and easy to get subtly wrong: `DiagnosisEngine.diagnose()` (the flag/diagnosis decision tree), `EncodeService.selectProfiles()` (the tier-selection rule — a regression here silently changes what quality ladder a repaired video gets), and `CaseLogger.withLogging()` (the audit-logging guarantee itself — that a `*_requested` entry and either a `*_result` or `error` entry are always written, even when the wrapped work throws). Routes aren't unit tested — they're thin orchestration over IPFS/ffmpeg/MongoDB/3speakembed, and testing them meaningfully needs real or mocked infrastructure rather than more unit tests.

Beyond that, verification today is manual, end-to-end, against a real (or throwaway) `3speakembed` + MongoDB + IPFS hot node: `GET /jobs` → `POST /probe` → `POST /encode` → `POST /probe` again on the new output to confirm the flags cleared → `POST /finalize` → confirm `3speakembed`'s `GET /video/:permlink` shows the new `manifest_cid` and `status: published`.
