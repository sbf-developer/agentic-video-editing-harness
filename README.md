# Video Harness

**Cursor for video editing** — an agent-native harness where AI edits structured plans and deterministic tools render pixels.

## Quick start

Requires **Node 20+**, **ffmpeg**, and **ffprobe** on PATH.

```bash
npm install
npm run build

# Create a project
npm run vh -- init -n my-ad -d ./projects/my-ad

# Add media to projects/my-ad/assets/, then index
npm run vh -- ingest -C ./projects/my-ad assets

# Edit BRIEF.md + edit-plan.json (set real assetIds from ingest output)

# Validate → render → snapshot
npm run vh -- validate -C ./projects/my-ad
npm run vh -- render -C ./projects/my-ad --execute
npm run vh -- snapshot -C ./projects/my-ad

# AI context
npm run vh -- context clip:hook -C ./projects/my-ad
```

## CLI commands

| Command | Purpose |
|---------|---------|
| `vh init` | Scaffold project folder + templates |
| `vh ingest` | ffprobe assets → `media-index.json` |
| `vh validate` | Check BRIEF + EDL (writes `qa/validation.json`) |
| `vh render` | Generate `scripts/render.ps1` + `.sh`; `--execute` to run |
| `vh snapshot` | Keyframes at EDL boundaries + contact sheet |
| `vh context` | Resolve `@`-mentions for agents |

## Project layout

```
my-ad/
├── BRIEF.md              # intent
├── edit-plan.json        # timeline (EDL)
├── media-index.json      # asset catalog
├── assets/               # source media
├── scripts/              # generated render scripts
├── qa/                   # validation + snapshots
└── renders/              # output MP4
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design.

## Packages

| Package | Role |
|---------|------|
| `@video-harness/core` | Schemas, validators, render generator, QA |
| `@video-harness/ingest` | ffprobe + media index builder |
| `@video-harness/context` | `@clip`, `@asset` mention resolver |
| `@video-harness/cli` | `vh` command-line tool |

## Agent workflow

1. **Ingest** — know what assets exist
2. **Plan** — edit `edit-plan.json` (every clip needs a `purpose` tag)
3. **Validate** — fix errors before render
4. **Render** — reproducible FFmpeg scripts
5. **Snapshot** — contact sheet for human review

Skills for Cursor agents live in `skills/video-harness/SKILL.md`.

## License

Private — internal use.
