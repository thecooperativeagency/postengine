import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const FFMPEG = process.env.FFMPEG_PATH || "/opt/homebrew/bin/ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "/opt/homebrew/bin/ffprobe";

export function probeDurationMs(filePath: string): number | null {
  try {
    const out = execFileSync(
      FFPROBE,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { encoding: "utf-8", timeout: 30000 },
    ).trim();
    const sec = Number(out);
    if (!Number.isFinite(sec) || sec <= 0) return null;
    return Math.round(sec * 1000);
  } catch {
    return null;
  }
}

export function probeHasAudioStream(filePath: string): boolean {
  try {
    const out = execFileSync(
      FFPROBE,
      [
        "-v",
        "error",
        "-select_streams",
        "a",
        "-show_entries",
        "stream=index",
        "-of",
        "csv=p=0",
        filePath,
      ],
      { encoding: "utf-8", timeout: 30000 },
    ).trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

/**
 * Mix background music under a video.
 * - Loops/trims music to video length
 * - Duck original audio if present; else music-only
 * - musicVolume 0..1 (default 0.28 under VO/nat sound, 0.55 if silent source)
 */
export function muxMusicUnderVideo(opts: {
  videoPath: string;
  audioPath: string;
  outputPath?: string;
  musicVolume?: number;
}): { outputPath: string; hadOriginalAudio: boolean } {
  const { videoPath, audioPath } = opts;
  if (!fs.existsSync(videoPath)) throw new Error(`video missing: ${videoPath}`);
  if (!fs.existsSync(audioPath)) throw new Error(`audio missing: ${audioPath}`);

  const outputPath =
    opts.outputPath ||
    path.join(os.tmpdir(), `pe-reel-mux-${Date.now()}-${path.basename(videoPath).replace(/\s+/g, "-")}`);

  const hadOriginalAudio = probeHasAudioStream(videoPath);
  const defaultVol = hadOriginalAudio ? 0.28 : 0.55;
  const musicVol = Math.min(1, Math.max(0.05, opts.musicVolume ?? defaultVol));

  // shortest = cut to video length; loop audio with -stream_loop -1
  const args = hadOriginalAudio
    ? [
        "-y",
        "-i",
        videoPath,
        "-stream_loop",
        "-1",
        "-i",
        audioPath,
        "-filter_complex",
        `[0:a]volume=1.0[a0];[1:a]volume=${musicVol}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
        "-map",
        "0:v:0",
        "-map",
        "[aout]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-movflags",
        "+faststart",
        outputPath,
      ]
    : [
        "-y",
        "-i",
        videoPath,
        "-stream_loop",
        "-1",
        "-i",
        audioPath,
        "-filter_complex",
        `[1:a]volume=${musicVol}[a1]`,
        "-map",
        "0:v:0",
        "-map",
        "[a1]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-movflags",
        "+faststart",
        outputPath,
      ];

  execFileSync(FFMPEG, args, { timeout: 300000, stdio: ["ignore", "pipe", "pipe"] });
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
    throw new Error("ffmpeg mux produced empty output");
  }
  return { outputPath, hadOriginalAudio };
}

export async function downloadUrlToFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status} ${url.slice(0, 80)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
}
