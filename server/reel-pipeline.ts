/**
 * Reel pipeline — free compositor path (v1).
 *
 * Flow:
 *   Drive …/reels/_inbox/<SetName>/*.mov
 *     → local render (ffmpeg + Epidemic)
 *     → Drive …/reels/_ready/<SetName>.mp4
 *     → Post Engine scans post type "Reels" from _ready only
 *
 * Future: swap renderSetFromLocalClips() for Remotion/AE without changing folders.
 *
 * Cost: $0 compositor (ffmpeg + existing Epidemic). Remotion later if needed.
 */

import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EpidemicMusicProvider } from "./music/providers/epidemic/client";
import { pickMusicTrack } from "./music/picker";
import { muxMusicUnderVideo, probeDurationMs } from "./music/mux";

const FFMPEG = process.env.FFMPEG_PATH || "/opt/homebrew/bin/ffmpeg";
const ACCOUNT = "lance@thecoopbrla.com";
const DRIVE_FOLDERS_PATH = path.join(process.cwd(), ".drive-folders.json");

export interface ReelsPipelineFolders {
  root: string;
  inbox: string;
  wip: string;
  ready: string;
  archive: string;
}

export interface ReelSetBrief {
  brand?: string;
  energy?: "calm" | "luxury" | "energetic" | "default";
  targetSeconds?: number;
  reverseOpen?: boolean;
  notes?: string;
}

function loadReelsPipeline(dealershipName = "Harris Porsche"): ReelsPipelineFolders {
  const raw = JSON.parse(fs.readFileSync(DRIVE_FOLDERS_PATH, "utf-8"));
  const pipe = raw.dealerships?.[dealershipName]?.reelsPipeline;
  if (!pipe?.inbox || !pipe?.ready) {
    throw new Error(`No reelsPipeline config for ${dealershipName} in .drive-folders.json`);
  }
  return pipe as ReelsPipelineFolders;
}

function gogJson(args: string[]): any {
  const result = execFileSync(
    "gog",
    [...args, "--account", ACCOUNT, "--json", "--no-input"],
    {
      encoding: "utf-8",
      timeout: 120000,
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  return JSON.parse(result);
}

function listChildren(parentId: string): any[] {
  const result = gogJson(["drive", "ls", `--parent=${parentId}`, "--max=200"]);
  return Array.isArray(result) ? result : result.files || [];
}

function isFolder(f: any) {
  return f?.mimeType === "application/vnd.google-apps.folder";
}

function isVideo(f: any) {
  return String(f?.mimeType || "").startsWith("video/");
}

/** List inbox sets: each subfolder under _inbox is one car/set. */
export function listInboxSets(dealershipName = "Harris Porsche") {
  const pipe = loadReelsPipeline(dealershipName);
  return listChildren(pipe.inbox)
    .filter(isFolder)
    .map((f) => ({
      id: f.id as string,
      name: f.name as string,
      dealershipName,
      pipeline: pipe,
    }));
}

function downloadDriveFile(fileId: string, destPath: string) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  execFileSync(
    "gog",
    ["drive", "download", fileId, "-a", ACCOUNT, `--out=${destPath}`, "-y", "--no-input"],
    { timeout: 600000, stdio: "pipe" },
  );
}

function uploadToReady(localPath: string, readyFolderId: string): string {
  const out = execFileSync(
    "gog",
    [
      "drive",
      "upload",
      localPath,
      `--parent=${readyFolderId}`,
      "-a",
      ACCOUNT,
      "--json",
      "--no-input",
      "-y",
    ],
    { encoding: "utf-8", timeout: 600000 },
  );
  const parsed = JSON.parse(out);
  return parsed?.file?.id || parsed?.id || "";
}

function readBriefFromFile(briefPath: string): ReelSetBrief {
  const defaults: ReelSetBrief = {
    brand: "Porsche",
    energy: "energetic",
    targetSeconds: 15,
    reverseOpen: false,
  };
  if (!fs.existsSync(briefPath)) return defaults;
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(briefPath, "utf-8")) };
  } catch {
    return defaults;
  }
}

/**
 * v1 renderer: snappy multi-clip vertical + Epidemic bed.
 * Replace later with Remotion/AE without changing inbox/ready contract.
 */
export async function renderSetFromLocalClips(opts: {
  clipPaths: string[];
  workDir: string;
  brief?: ReelSetBrief;
  outputName: string;
}): Promise<{ outputPath: string; musicTitle?: string; musicId?: string }> {
  const brief = opts.brief || {
    targetSeconds: 15,
    energy: "energetic" as const,
    brand: "Porsche",
  };
  const targetSec = brief.targetSeconds || 15;
  const n = Math.min(6, Math.max(3, opts.clipPaths.length));
  const clipDur = targetSec / n;
  const clips = opts.clipPaths.slice(0, n);
  const work = opts.workDir;
  fs.mkdirSync(work, { recursive: true });

  const segs: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    const src = clips[i];
    const seg = path.join(work, `seg_${String(i).padStart(2, "0")}.mp4`);
    const reverse = Boolean(brief.reverseOpen && i === 0);
    if (reverse) {
      const rev = path.join(work, "open_rev.mp4");
      execFileSync(
        FFMPEG,
        [
          "-y",
          "-i",
          src,
          "-vf",
          "reverse,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,setpts=PTS-STARTPTS",
          "-an",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "18",
          "-pix_fmt",
          "yuv420p",
          rev,
        ],
        { timeout: 300000, stdio: "pipe" },
      );
      const od = (probeDurationMs(rev) || 3000) / 1000;
      const factor = od / clipDur;
      execFileSync(
        FFMPEG,
        [
          "-y",
          "-i",
          rev,
          "-vf",
          `setpts=${factor}*PTS,fps=30`,
          "-t",
          String(clipDur),
          "-an",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "18",
          "-pix_fmt",
          "yuv420p",
          seg,
        ],
        { timeout: 300000, stdio: "pipe" },
      );
    } else {
      execFileSync(
        FFMPEG,
        [
          "-y",
          "-ss",
          "0.15",
          "-t",
          String(clipDur),
          "-i",
          src,
          "-vf",
          "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30",
          "-an",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "18",
          "-pix_fmt",
          "yuv420p",
          seg,
        ],
        { timeout: 300000, stdio: "pipe" },
      );
    }
    segs.push(seg);
  }

  const list = path.join(work, "concat.txt");
  fs.writeFileSync(list, segs.map((s) => `file '${s}'`).join("\n") + "\n");
  const silent = path.join(work, "silent.mp4");
  execFileSync(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", silent], {
    timeout: 120000,
    stdio: "pipe",
  });

  const provider = new EpidemicMusicProvider();
  const videoMs = probeDurationMs(silent) || targetSec * 1000;
  const selection = await pickMusicTrack(provider, {
    brand: brief.brand || "Porsche",
    postType: "Reels",
    energy: brief.energy || "energetic",
    videoDurationMs: videoMs,
  });

  const out = path.join(work, opts.outputName);
  if (selection && provider.isConfigured()) {
    const audio = path.join(work, "bed.mp3");
    await provider.download(selection.id, audio);
    muxMusicUnderVideo({
      videoPath: silent,
      audioPath: audio,
      outputPath: out,
      musicVolume: 0.62,
    });
    const trimmed = path.join(work, "trimmed.mp4");
    const durSec = (probeDurationMs(silent) || videoMs) / 1000;
    execFileSync(
      FFMPEG,
      ["-y", "-i", out, "-t", String(durSec), "-c", "copy", "-movflags", "+faststart", trimmed],
      { timeout: 120000, stdio: "pipe" },
    );
    fs.copyFileSync(trimmed, out);
    return { outputPath: out, musicTitle: selection.title, musicId: selection.id };
  }

  fs.copyFileSync(silent, out);
  return { outputPath: out };
}

/**
 * Process one inbox set folder id → upload mp4 to _ready.
 */
export async function processInboxSet(opts: {
  setFolderId: string;
  setName: string;
  dealershipName?: string;
}): Promise<{ readyPath: string; driveFileId: string; musicTitle?: string }> {
  const dealershipName = opts.dealershipName || "Harris Porsche";
  const pipe = loadReelsPipeline(dealershipName);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `reel-set-`));
  const clipDir = path.join(work, "clips");
  fs.mkdirSync(clipDir, { recursive: true });

  const children = listChildren(opts.setFolderId);
  const videos = children.filter(isVideo);
  if (videos.length < 3) {
    throw new Error(`Set ${opts.setName} needs at least 3 videos, found ${videos.length}`);
  }

  let brief: ReelSetBrief = {
    brand: "Porsche",
    energy: "energetic",
    targetSeconds: 15,
    reverseOpen: /1785|open|sky/i.test(videos.map((v) => v.name).join(" ")),
  };
  const briefFile = children.find((f) => f.name === "brief.json");
  if (briefFile) {
    const bp = path.join(work, "brief.json");
    downloadDriveFile(briefFile.id, bp);
    brief = { ...brief, ...readBriefFromFile(bp) };
  }

  const clipPaths: string[] = [];
  for (const v of videos) {
    const dest = path.join(clipDir, String(v.name).replace(/\s+/g, "_"));
    downloadDriveFile(v.id, dest);
    clipPaths.push(dest);
  }
  clipPaths.sort();

  const safeName = opts.setName.replace(/[^\w.-]+/g, "-");
  const outName = `${safeName}.mp4`;
  const rendered = await renderSetFromLocalClips({
    clipPaths,
    workDir: path.join(work, "render"),
    brief,
    outputName: outName,
  });

  fs.writeFileSync(
    path.join(work, "render", "FINISHED.txt"),
    `[reel-finished]\nset=${opts.setName}\nmusic=${rendered.musicTitle || "none"}\nid=${rendered.musicId || ""}\n`,
  );

  const driveFileId = uploadToReady(rendered.outputPath, pipe.ready);

  return {
    readyPath: rendered.outputPath,
    driveFileId,
    musicTitle: rendered.musicTitle,
  };
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "list") {
    console.log(JSON.stringify(listInboxSets(), null, 2));
    return;
  }
  if (cmd === "process-all") {
    const sets = listInboxSets();
    for (const s of sets) {
      console.log("Processing", s.name);
      const r = await processInboxSet({ setFolderId: s.id, setName: s.name });
      console.log("ready", r.driveFileId, r.musicTitle);
    }
    return;
  }
  if (cmd === "process" && arg) {
    const sets = listInboxSets();
    const s = sets.find((x) => x.name === arg || x.id === arg);
    if (!s) throw new Error(`Set not found: ${arg}`);
    const r = await processInboxSet({ setFolderId: s.id, setName: s.name });
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  console.log(`Usage:
  npx tsx server/reel-pipeline.ts list
  npx tsx server/reel-pipeline.ts process-all
  npx tsx server/reel-pipeline.ts process <SetFolderName>
`);
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
