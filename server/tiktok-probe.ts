import { execFile } from "child_process";
import { promisify } from "util";

import type { TikTokProbe } from "@shared/tiktok";
import { resolveBin } from "./local-bin";

const execFileAsync = promisify(execFile);

/**
 * Inspect a public video URL. A failed probe is a warning for the caller.
 * Duration outside the TikTok window is decided in validateTikTokPost.
 */
export async function probeTikTokVideo(url: string): Promise<TikTokProbe> {
  const ffprobe = resolveBin("FFPROBE_PATH", "/opt/homebrew/bin/ffprobe", "ffprobe");
  try {
    const { stdout } = await execFileAsync(ffprobe, [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height,codec_name,duration",
      "-show_entries", "format=duration",
      "-of", "json",
      url,
    ], { timeout: 20000 });
    const parsed = JSON.parse(String(stdout || "{}")) as {
      streams?: Array<{ width?: number; height?: number; codec_name?: string; duration?: string }>;
      format?: { duration?: string };
    };
    const stream = parsed.streams?.[0] || {};
    const durationRaw = stream.duration || parsed.format?.duration;
    const durationSec = durationRaw == null ? null : Number(durationRaw);
    return {
      durationSec: durationSec != null && Number.isFinite(durationSec) ? durationSec : null,
      width: typeof stream.width === "number" ? stream.width : null,
      height: typeof stream.height === "number" ? stream.height : null,
      codec: stream.codec_name || null,
    };
  } catch {
    return { error: "probe failed" };
  }
}
