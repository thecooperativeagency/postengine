/**
 * Provider-agnostic music types.
 * Tenant fields are optional now; required when this module is wrapped for SaaS.
 */

export type MusicProviderId = "epidemic" | string;

export interface MusicTrackCandidate {
  id: string;
  provider: MusicProviderId;
  title: string;
  bpm: number | null;
  durationMs: number;
  previewUrl?: string | null;
  tags: string[];
  moodTags: string[];
  hasVocals: boolean;
  artistNames: string[];
  raw?: unknown;
}

export interface MusicSelection extends MusicTrackCandidate {
  score: number;
  query: string;
  reason: string;
}

export interface MusicSearchParams {
  query: string;
  limit?: number;
  minDurationMs?: number;
  maxDurationMs?: number;
  minBpm?: number;
  maxBpm?: number;
  preferNoVocals?: boolean;
  moodSlugs?: string[];
}

export interface MusicDownloadResult {
  localPath: string;
  contentType?: string;
  sourceUrl: string;
}

/** Context for auto-picking music for a reel/video. SaaS-ready shape. */
export interface MusicPickContext {
  /** Future SaaS workspace / tenant. Unused in internal Post Engine today. */
  tenantId?: string | null;
  dealershipId?: number | null;
  brand?: string | null;
  postType?: string | null;
  vehicleInfo?: string | null;
  /** Target video length in ms (from ffprobe). */
  videoDurationMs: number;
  /** Track IDs already used recently (anti-reuse). */
  excludeTrackIds?: string[];
  /** Soft energy hint: calm | luxury | energetic | default */
  energy?: "calm" | "luxury" | "energetic" | "default";
}

export interface PreparedReelAudio {
  /** Local muxed mp4 path */
  localVideoPath: string;
  /** Public URL after hosting (if hosted) */
  publicVideoUrl?: string;
  selection: MusicSelection;
  audioLocalPath: string;
}

export interface MusicProvider {
  readonly id: MusicProviderId;
  isConfigured(): boolean;
  search(params: MusicSearchParams): Promise<MusicTrackCandidate[]>;
  download(trackId: string, destPath: string): Promise<MusicDownloadResult>;
}
