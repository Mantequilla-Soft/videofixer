export type JobStatus = 'pending' | 'encoding' | 'completed' | 'failed';

export interface EmbedJobView {
  owner: string;
  permlink: string;
  status: JobStatus;
  lastError: string | null;
  attemptCount: number;
  assignedWorker: string | null;
  premium: boolean;
  short: boolean;
  input_cid: string | null;
  originalFilename: string | null;
  videoStatus: string | null;
  createdAt: string;
  updatedAt: string;
  webhookReceivedAt: string | null;
}

export interface EmbedVideo {
  owner: string;
  permlink: string;
  status: string;
  input_cid: string | null;
  manifest_cid: string | null;
  short: boolean;
  [key: string]: unknown;
}

export type DiagnosisFlag = 'missing-audio' | 'full-range-color' | 'misaligned-resolution';

export type Diagnosis =
  | 'no-issues-detected'
  | 'corrupt-input'
  | DiagnosisFlag
  | 'multiple-issues';

export interface ProbeResult {
  codec: string | null;
  pix_fmt: string | null;
  color_range: string | null;
  resolution: { width: number; height: number } | null;
  alignment_ok: boolean;
  has_audio: boolean;
  audio_codec: string | null;
  duration_seconds: number | null;
  corrupt: boolean;
  ffprobe_error: string | null;
}

export interface DiagnosisResult {
  probe: ProbeResult;
  flags: DiagnosisFlag[];
  diagnosis: Diagnosis;
  fixable: boolean;
}

export interface ActionTaken {
  description: string;
  ffmpeg_flags: string[];
  profiles_encoded: string[];
}

export interface AuditLogEntry {
  case_id: string;
  owner: string | null;
  permlink: string | null;
  stage:
    | 'probe_requested'
    | 'probe_result'
    | 'encode_requested'
    | 'encode_result'
    | 'finalize_requested'
    | 'finalize_result'
    | 'error';
  at: Date;
  request: unknown;
  response: unknown;
  error: string | null;
}

export interface WisdomCase {
  case_id: string;
  owner: string | null;
  permlink: string | null;
  trigger: 'reported' | 'failed-job-scan';
  status: 'probing' | 'probed' | 'encoding' | 'encoded' | 'finalized' | 'error';
  created_at: Date;
  updated_at: Date;
  probe?: {
    at: Date;
    input_cid: string;
    download_ms: number;
    codec: string | null;
    pix_fmt: string | null;
    color_range: string | null;
    resolution: { width: number; height: number } | null;
    has_audio: boolean;
    duration_seconds: number | null;
    alignment_ok: boolean;
    corrupt: boolean;
    probe_error: string | null;
    flags: DiagnosisFlag[];
    diagnosis: Diagnosis;
    ffprobe_raw: unknown;
  };
  encode?: {
    at: Date;
    action_taken: ActionTaken;
    encode_ms: number;
    upload_ms: number;
    output_size_bytes: number | null;
    new_manifest_cid: string | null;
    encode_error: string | null;
  };
  finalize?: {
    at: Date;
    status: 'complete' | 'failed';
    manifest_cid: string | null;
    error: string | null;
    embed_response: unknown;
  };
  result: 'fixed' | 'unfixable' | 'retried-unchanged' | 'pending';
  verified_playback: boolean | null;
  notes: string | null;
}

export interface EncodeProfile {
  name: string;
  height: number;
}
