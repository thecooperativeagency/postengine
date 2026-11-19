/**
 * Music facade for Post Engine reels.
 *
 * Architecture is SaaS-ready:
 * - provider interface (Epidemic today; swap/inject later)
 * - MusicPickContext carries optional tenantId
 * - pure picker scoring
 *
 * This iteration only wires internal Post Engine publish path.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hostPublicMediaFile } from "../public-media";
import { pickMusicTrack } from "./picker";
import { downloadUrlToFile, muxMusicUnderVideo, probeDurationMs } from "./mux";
import { EpidemicMusicProvider } from "./providers/epidemic/client";
import type { MusicPickContext, MusicProvider, MusicSelection, PreparedReelAudio } from "./types";

export * from "./types";
export { pickMusicTrack, rankTracks, scoreTrack } from "./picker";
export { resolveMusicProfile } from "./profiles";
export { muxMusicUnderVideo, probeDurationMs } from "./mux";

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  return !/^(0|false|no|off)$/i.test(raw.trim());
}

export function isMusicAutoBedEnabled(): boolean {
  const providerReady = getDefaultMusicProvider().isConfigured();
  if (!providerReady) return false;
  return envFlag("MUSIC_AUTO_BED", true);
}

export function getDefaultMusicProvider(): MusicProvider {
  const id = (process.env.MUSIC_PROVIDER || "epidemic").toLowerCase();
  if (id === "epidemic") return new EpidemicMusicProvider();
  // Future: other providers. Fall back to epidemic.
  return new EpidemicMusicProvider();
}

export function formatMusicNote(selection: MusicSelection): string {
  return `[music] provider=${selection.provider} id=${selection.id} title=${JSON.stringify(selection.title)} bpm=${selection.bpm ?? "?"} ${selection.reason}`;
}

export function parseMusicIdFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(/\[music\][^\n]*\bid=([0-9a-f-]{36})\b/i);
  return m?.[1] || null;
}

/**
 * Download remote/local video URL to a temp file.
 */
export async function materializeVideo(sourceUrl: string): Promise<string> {
  const dest = path.join(os.tmpdir(), `pe-video-src-${Date.now()}.mp4`);
  if (/^https?:\/\//i.test(sourceUrl)) {
    await downloadUrlToFile(sourceUrl, dest);
    return dest;
  }
  if (fs.existsSync(sourceUrl)) {
    fs.copyFileSync(sourceUrl, dest);
    return dest;
  }
  throw new Error(`Cannot materialize video: ${sourceUrl.slice(0, 120)}`);
}

export async function prepareReelWithMusic(opts: {
  videoUrl: string;
  context: Omit<MusicPickContext, "videoDurationMs"> & { videoDurationMs?: number };
  provider?: MusicProvider;
  musicVolume?: number;
  hostPublic?: boolean;
}): Promise<PreparedReelAudio | null> {
  const provider = opts.provider || getDefaultMusicProvider();
  if (!provider.isConfigured()) return null;

  const videoPath = await materializeVideo(opts.videoUrl);
  const durationMs = opts.context.videoDurationMs || probeDurationMs(videoPath) || 15000;

  const selection = await pickMusicTrack(provider, {
    ...opts.context,
    videoDurationMs: durationMs,
  });
  if (!selection) {
    try {
      fs.unlinkSync(videoPath);
    } catch {
      /* ignore */
    }
    return null;
  }

  const audioPath = path.join(os.tmpdir(), `pe-music-${selection.id}.mp3`);
  await provider.download(selection.id, audioPath);

  const muxedPath = path.join(os.tmpdir(), `pe-reel-bed-${Date.now()}.mp4`);
  muxMusicUnderVideo({
    videoPath,
    audioPath,
    outputPath: muxedPath,
    musicVolume: opts.musicVolume,
  });

  let publicVideoUrl: string | undefined;
  if (opts.hostPublic !== false) {
    publicVideoUrl = await hostPublicMediaFile(
      muxedPath,
      `reel-${selection.id.slice(0, 8)}.mp4`,
    );
  }

  // cleanup source video temp
  try {
    fs.unlinkSync(videoPath);
  } catch {
    /* ignore */
  }

  return {
    localVideoPath: muxedPath,
    publicVideoUrl,
    selection,
    audioLocalPath: audioPath,
  };
}
