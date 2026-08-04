import { resolveMusicProfile } from "./profiles";
import type {
  MusicPickContext,
  MusicProvider,
  MusicSelection,
  MusicTrackCandidate,
} from "./types";

function hasVocalTag(tags: string[]): boolean {
  const joined = tags.join(" ").toLowerCase();
  if (joined.includes("no vocals") || joined.includes("instrumental")) return false;
  return (
    joined.includes("lead vocals") ||
    joined.includes("vocals") ||
    joined.includes("sung") ||
    joined.includes("rap")
  );
}

export function normalizeCandidateTags(c: MusicTrackCandidate): MusicTrackCandidate {
  const tags = (c.tags || []).map((t) => t.toLowerCase());
  const moodTags = (c.moodTags || []).map((t) => t.toLowerCase());
  const hasVocals = c.hasVocals || hasVocalTag([...tags, ...moodTags]);
  return { ...c, tags, moodTags, hasVocals };
}

/**
 * Score a candidate for a target video. Pure — unit-testable.
 * Higher is better.
 */
export function scoreTrack(
  track: MusicTrackCandidate,
  ctx: MusicPickContext,
  profile: ReturnType<typeof resolveMusicProfile>,
): number {
  const t = normalizeCandidateTags(track);
  let score = 100;

  // Duration: prefer track >= video; mild penalty if much longer; hard hit if shorter
  const videoMs = Math.max(1000, ctx.videoDurationMs);
  const dur = Math.max(1, t.durationMs);
  if (dur < videoMs * 0.9) {
    score -= 40 + ((videoMs - dur) / 1000) * 0.5;
  } else if (dur < videoMs) {
    score -= 10;
  } else if (dur > videoMs * 2.5) {
    score -= 8;
  } else {
    score += 10;
  }

  if (profile.preferNoVocals) {
    score += t.hasVocals ? -35 : 20;
  }

  if (t.bpm != null) {
    if (t.bpm >= profile.minBpm && t.bpm <= profile.maxBpm) score += 15;
    else if (t.bpm >= profile.minBpm - 15 && t.bpm <= profile.maxBpm + 15) score += 5;
    else score -= 10;
  }

  // Soft brand energy cues from tags
  const tagBlob = [...t.tags, ...t.moodTags].join(" ");
  if (profile.energy === "luxury") {
    if (/luxury|elegant|cinematic|premium|smooth|confident/.test(tagBlob)) score += 8;
  } else if (profile.energy === "energetic") {
    if (/energetic|driving|powerful|uplifting|epic/.test(tagBlob)) score += 8;
  } else if (profile.energy === "calm") {
    if (/calm|soft|peaceful|warm|gentle/.test(tagBlob)) score += 8;
  }

  const exclude = new Set((ctx.excludeTrackIds || []).map(String));
  if (exclude.has(t.id)) score -= 1000;

  return score;
}

export function rankTracks(
  candidates: MusicTrackCandidate[],
  ctx: MusicPickContext,
): MusicSelection[] {
  const profile = resolveMusicProfile(ctx);
  return candidates
    .map((c) => normalizeCandidateTags(c))
    .map((c) => {
      const score = scoreTrack(c, ctx, profile);
      return {
        ...c,
        score,
        query: profile.queries[0] || "",
        reason: buildReason(c, score, profile),
      } satisfies MusicSelection;
    })
    .sort((a, b) => b.score - a.score);
}

function buildReason(
  c: MusicTrackCandidate,
  score: number,
  profile: ReturnType<typeof resolveMusicProfile>,
): string {
  const bits = [
    `score=${score.toFixed(1)}`,
    c.hasVocals ? "vocals" : "no-vocals",
    c.bpm != null ? `bpm=${c.bpm}` : "bpm=?",
    `dur=${Math.round(c.durationMs / 1000)}s`,
    `targetBpm=${profile.minBpm}-${profile.maxBpm}`,
  ];
  return bits.join(" ");
}

/**
 * Search + rank via provider. Tries profile queries until enough candidates.
 */
export async function pickMusicTrack(
  provider: MusicProvider,
  ctx: MusicPickContext,
): Promise<MusicSelection | null> {
  if (!provider.isConfigured()) return null;

  const profile = resolveMusicProfile(ctx);
  const videoMs = Math.max(1000, ctx.videoDurationMs);
  const seen = new Set<string>();
  const all: MusicTrackCandidate[] = [];

  for (const query of profile.queries) {
    const batch = await provider.search({
      query,
      limit: 15,
      minDurationMs: Math.floor(videoMs * 0.85),
      // allow shorter tracks; scorer handles loop/trim via mux
      preferNoVocals: profile.preferNoVocals,
      minBpm: profile.minBpm,
      maxBpm: profile.maxBpm,
      moodSlugs: profile.moodSlugs.length ? profile.moodSlugs : undefined,
    });
    for (const c of batch) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      all.push(c);
    }
    if (all.length >= 8) break;
  }

  // Fallback without BPM/duration filters if thin
  if (all.length < 3) {
    const loose = await provider.search({
      query: profile.queries[0],
      limit: 20,
      preferNoVocals: profile.preferNoVocals,
    });
    for (const c of loose) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      all.push(c);
    }
  }

  const ranked = rankTracks(all, ctx).filter((t) => t.score > -100);
  if (!ranked.length) return null;

  const best = ranked[0];
  best.query = profile.queries[0] || best.query;
  return best;
}
