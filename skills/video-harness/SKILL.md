---
name: video-harness
description: >
  Agent-native video editing harness. Use when editing video via EDL (edit-plan.json),
  validating timelines, ingesting media, rendering with FFmpeg, or resolving @clip/@asset
  context. Plan before pixels — never skip EDL validation.
---

# Video Harness

Intelligence lives in the **process**: ingest → plan → validate → render → snapshot.

## Commands (from project root)

```bash
vh init -n <name> -d <dir>
vh ingest -C <project> [paths...]
vh validate -C <project>
vh render -C <project> --execute
vh snapshot -C <project>
vh context <mention> -C <project>
```

## Rules

1. **Never render without validating** — run `vh validate` first
2. **Every video clip needs a purpose tag** — `hook`, `problem`, `solution`, `proof`, `broll`, `cta`
3. **Edit `edit-plan.json`** — do not hand-write one-off FFmpeg commands
4. **Hook within 2s** on TikTok/Reels/Shorts
5. **Music ducks under VO** — music `gainDb` ≤ -18, duck ≥ -12 dB under speech

## Artifacts

| File | Role |
|------|------|
| `BRIEF.md` | Intent — approve before final delivery |
| `edit-plan.json` | Timeline source of truth |
| `media-index.json` | Asset catalog from ingest |
| `qa/validation.json` | Last validation run |
| `scripts/render.ps1` | Reproducible export |

## @-mentions

```
vh context brief -C .
vh context clip:hook -C .
vh context asset:<id> -C .
vh context search:calm nature -C .
```

## Pacing

- One idea per shot
- J-cut / L-cut — offset VO vs video cuts when polish matters
- Fade music out 0.5–1s at end

## Integration

- Motion graphics: render HyperFrames first, import render as EDL clip
- Assembly: stock + VO + music in `edit-plan.json` lanes

See repo `ARCHITECTURE.md` for full design.
