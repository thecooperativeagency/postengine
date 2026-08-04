# Harris Porsche — Reels pipeline

## Folders (Drive → Postengine → Harris Porsche → reels)

| Folder | Role |
|--------|------|
| `_inbox/<SetName>/` | Drop raw clips for **one car** |
| `_wip/` | Optional working area |
| `_ready/` | **Finished** vertical mp4s only — Post Engine scans this as post type **Reels** |
| `_Archive/` | After used / old masters |

### Drop rules
1. Create a set folder: `_inbox/Cayenne-Electric-2026-08-03/`
2. Put only the clips for that car (pre-trimmed when you can)
3. Optional `brief.json`:
```json
{
  "brand": "Porsche",
  "energy": "energetic",
  "targetSeconds": 15,
  "reverseOpen": false,
  "notes": "white cayenne lot"
}
```
4. Run pipeline (or Ada runs it) → master lands in `_ready/`

## Compositor (cost)

**Now (v1): free**
- `ffmpeg` + Epidemic Sound (sub you already have)
- Code: `server/reel-pipeline.ts`

**Later (v2 motion/titles): Remotion**
- Open source React video; no AE license
- Swap `renderSetFromLocalClips` only — folders stay the same
- Company license only if you outgrow Remotion’s free/individual terms

**Not default:** After Effects (license + flaky headless)

## Commands

```bash
cd ~/.openclaw/workspace/postengine/social-post-manager
npx tsx server/reel-pipeline.ts list
npx tsx server/reel-pipeline.ts process Cayenne-Electric-2026-08-03
npx tsx server/reel-pipeline.ts process-all
```

## Post Engine
- `.drive-folders.json` → Harris Porsche `Reels` = `_ready` id
- `reelsPipeline` block holds inbox/wip/ready/archive ids
- Publish skips auto music bed for `postType: Reels` and `[reel-finished]` notes

## Cadence
Add a cadence rule for post type **Reels** with weekly reel preference when you want auto-queue from `_ready`.
