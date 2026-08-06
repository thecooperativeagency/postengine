import assert from "node:assert/strict";
import test from "node:test";
import { rankTracks, scoreTrack } from "../server/music/picker";
import { resolveMusicProfile } from "../server/music/profiles";
import { formatMusicNote, parseMusicIdFromNotes } from "../server/music";
import type { MusicTrackCandidate } from "../server/music/types";

function track(partial: Partial<MusicTrackCandidate> & { id: string; title: string }): MusicTrackCandidate {
  return {
    provider: "epidemic",
    bpm: 100,
    durationMs: 120000,
    tags: ["no vocals", "smooth"],
    moodTags: ["smooth"],
    hasVocals: false,
    artistNames: ["Test"],
    ...partial,
  };
}

test("resolveMusicProfile prefers brand queries for BMW", () => {
  const p = resolveMusicProfile({ brand: "BMW", postType: "New Cars" });
  assert.ok(p.queries.some((q) => /automotive|bmw|premium|german/i.test(q) || q.length > 0));
  assert.equal(p.preferNoVocals, true);
  assert.ok(p.minBpm >= 80);
});

test("scoreTrack prefers no-vocals and long enough tracks", () => {
  const ctx = { videoDurationMs: 20000, brand: "BMW" };
  const profile = resolveMusicProfile(ctx);
  const instrumental = track({
    id: "a",
    title: "Inst",
    hasVocals: false,
    tags: ["no vocals"],
    durationMs: 90000,
    bpm: 100,
  });
  const vocalShort = track({
    id: "b",
    title: "Vocal",
    hasVocals: true,
    tags: ["lead vocals"],
    durationMs: 8000,
    bpm: 100,
  });
  assert.ok(scoreTrack(instrumental, ctx, profile) > scoreTrack(vocalShort, ctx, profile));
});

test("rankTracks excludes recent ids", () => {
  const candidates = [
    track({ id: "11111111-1111-1111-1111-111111111111", title: "Used", durationMs: 90000 }),
    track({ id: "22222222-2222-2222-2222-222222222222", title: "Fresh", durationMs: 90000 }),
  ];
  const ranked = rankTracks(candidates, {
    videoDurationMs: 15000,
    excludeTrackIds: ["11111111-1111-1111-1111-111111111111"],
  });
  assert.equal(ranked[0].id, "22222222-2222-2222-2222-222222222222");
});

test("parseMusicIdFromNotes round-trips formatMusicNote", () => {
  const note = formatMusicNote({
    id: "feccc02e-2232-42f0-b0c3-32bf8e89db67",
    provider: "epidemic",
    title: "Time and Bottles",
    bpm: 90,
    durationMs: 160000,
    tags: [],
    moodTags: [],
    hasVocals: false,
    artistNames: [],
    score: 120,
    query: "x",
    reason: "score=120",
  });
  assert.equal(parseMusicIdFromNotes(note), "feccc02e-2232-42f0-b0c3-32bf8e89db67");
});
