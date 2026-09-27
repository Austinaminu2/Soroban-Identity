# Video Documentation

Video companions to the written docs. Videos are published to a YouTube playlist that `tools/upload.mjs` creates on first upload; the table below links to each video once it is live.

## Core series

<!-- videos:start -->
| # | Title | Length | Covers | Materials | Status |
|---|-------|--------|--------|-----------|--------|
| 1 | Introduction | 5 min | What Soroban Identity is, the problem it solves, and how the three contracts and the SDK fit together. | [Script](./scripts/01-introduction.md) · [Captions](https://github.com/El-Chapo-Npm/Soroban-Identity/blob/main/docs/videos/captions/01-introduction.srt) · [Transcript](https://github.com/El-Chapo-Npm/Soroban-Identity/blob/main/docs/videos/transcripts/01-introduction.txt) | Scripted |
| 2 | Quick Start on Testnet | 10 min | From a fresh clone to contracts deployed on testnet, the dApp running locally, and your first DID. | [Script](./scripts/02-quick-start.md) · [Captions](https://github.com/El-Chapo-Npm/Soroban-Identity/blob/main/docs/videos/captions/02-quick-start.srt) · [Transcript](https://github.com/El-Chapo-Npm/Soroban-Identity/blob/main/docs/videos/transcripts/02-quick-start.txt) | Scripted |
| 3 | Creating and Managing DIDs | 8 min | The did:stellar method and DID document, then create, resolve, update and deactivate one with the SDK. | [Script](./scripts/03-did-creation.md) · [Captions](https://github.com/El-Chapo-Npm/Soroban-Identity/blob/main/docs/videos/captions/03-did-creation.srt) · [Transcript](https://github.com/El-Chapo-Npm/Soroban-Identity/blob/main/docs/videos/transcripts/03-did-creation.txt) | Scripted |
| 4 | The Credential Lifecycle | 15 min | Register an issuer, then issue, look up, verify, renew and revoke a verifiable credential. | [Script](./scripts/04-credential-lifecycle.md) · [Captions](https://github.com/El-Chapo-Npm/Soroban-Identity/blob/main/docs/videos/captions/04-credential-lifecycle.srt) · [Transcript](https://github.com/El-Chapo-Npm/Soroban-Identity/blob/main/docs/videos/transcripts/04-credential-lifecycle.txt) | Scripted |
| 5 | Integration Guide | 20 min | Build a KYC-gated feature: SDK config, wallet connection, UI gating, server-side enforcement, sybil checks and mainnet. | [Script](./scripts/05-integration-guide.md) · [Captions](https://github.com/El-Chapo-Npm/Soroban-Identity/blob/main/docs/videos/captions/05-integration-guide.srt) · [Transcript](https://github.com/El-Chapo-Npm/Soroban-Identity/blob/main/docs/videos/transcripts/05-integration-guide.txt) | Scripted |
<!-- videos:end -->

Each video has a reviewed script in [`scripts/`](./scripts/01-introduction.md), captions in `captions/` and a transcript in `transcripts/`, all generated from the script.

## Advanced topics

| Title | Covers | Status |
|-------|--------|--------|
| Custom Credential Types | `Custom` credentials, [schema registry](../verifiable-credentials-jsonld.md) | Planned |
| Reputation Integration | [Tutorial 4](../tutorials/04-reputation-system.md), Sybil checks | Planned |
| Production Deployment | [Server operations](../server-operations.md), [secret management](../secret-management.md), [canary deploys](../cdn-and-canary-deployments.md) | Planned |

## Tutorial walkthroughs

Each tutorial in [`docs/tutorials`](../tutorials/README.md) gets a short screen-recorded walkthrough, added to the same playlist.

## Embedding

Use the privacy-enhanced embed in docs pages:

```html
<iframe
  src="https://www.youtube-nocookie.com/embed/VIDEO_ID"
  title="VIDEO TITLE"
  width="100%" height="400" frameborder="0"
  allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
  allowfullscreen></iframe>
```

## Production standards

- **Recording:** 1080p screen recording, voice narration, terminal font at 18pt or larger.
- **Captions:** every video ships with reviewed closed captions. Upload the `.srt` to YouTube and commit it to `docs/videos/captions/<slug>.srt`. Auto-generated captions alone are not enough.
- **Scripts:** commit the script to `docs/videos/scripts/<slug>.md` before recording, so reviewers can check accuracy.
- **Versioning:** state the SDK version in the first 10 seconds and in the description.

## Producing a video

Everything is driven by the script. Captions, transcripts, YouTube chapters and the embeds on these pages are all generated from it, so fix wording in the script and regenerate.

```
docs/videos/
├── videos.json          series manifest: titles, summaries, YouTube IDs
├── scripts/<slug>.md    narration, on-screen directions, [mm:ss] sections
├── captions/<slug>.srt  generated captions
├── transcripts/<slug>.txt
├── recordings/          raw .mp4 + thumbnails (git-ignored)
└── tools/               build-captions.mjs · upload.mjs · embed.mjs
```

Script format:

```markdown
## [01:40] Section title          ← YouTube chapter + caption timing anchor

**On screen:** what the viewer sees  ← direction for the recorder, not spoken

> Narration, one sentence per line. ← spoken; becomes captions
```

1. **Prepare.** Follow the *Setup before recording* note at the top of the script. Use testnet only and never show a secret key: use `stellar keys` names.
2. **Record** to the production standards above. Read the `>` lines; the **On screen** lines say what to show.
3. **Export** the edit to `recordings/<slug>.mp4` and a 1280×720 thumbnail to `recordings/<slug>.png`.
4. **Re-time captions.** If section start times in the edit differ from the script's `[mm:ss]` markers, update the markers (and `duration`), then run `node docs/videos/tools/build-captions.mjs <slug>`. Cues are spread across each section by word count; for frame-accurate sync, use YouTube Studio's *Auto-sync* with the transcript.
5. **Upload** with the YouTube Data API (OAuth client with the `youtube.force-ssl` scope):

   ```bash
   export YT_CLIENT_ID=... YT_CLIENT_SECRET=... YT_REFRESH_TOKEN=...   # or YT_ACCESS_TOKEN
   node docs/videos/tools/upload.mjs --dry-run         # preview titles, descriptions, chapters
   node docs/videos/tools/upload.mjs                   # upload everything not yet uploaded
   node docs/videos/tools/upload.mjs --only 03-did-creation
   node docs/videos/tools/upload.mjs --captions-only   # re-send captions after re-timing
   ```

   For each video this uploads the recording (`unlisted` until reviewed), writes a description with the SDK version, **chapters** from the script's sections and links, uploads the `.srt` captions and thumbnail, creates the playlist on first run and adds the video in order. New IDs are written back to `videos.json`. Videos that already have a `youtubeId` are skipped. Each upload uses about 1,600 units of the API's daily quota.
6. **Embed:** `node docs/videos/tools/embed.mjs` updates the table above, the root README and the player at the top of each script page. Commit the result.

## Maintenance schedule

- **Quarterly review:** in the first week of each quarter, a maintainer checks every video against the current SDK and marks outdated ones in the table above.
- **Major and minor releases:** re-record any video whose code no longer runs. The release checklist links here.
- **Analytics and feedback:** record views, average watch time and top comments from YouTube Studio in the quarterly review issue (label `video-docs`). Viewers can leave feedback through a
  [video feedback issue](https://github.com/El-Chapo-Npm/Soroban-Identity/issues/new?labels=documentation,video-docs&title=Video+feedback%3A+).
