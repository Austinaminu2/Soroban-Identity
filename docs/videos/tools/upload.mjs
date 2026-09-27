#!/usr/bin/env node
// Upload the recorded tutorials to YouTube with captions, chapters and a playlist.
//
//   node docs/videos/tools/upload.mjs [--dry-run] [--only <slug>] [--captions-only]
//
// Auth (YouTube Data API v3, scope https://www.googleapis.com/auth/youtube.force-ssl):
//   YT_ACCESS_TOKEN                                      a short-lived OAuth access token, or
//   YT_CLIENT_ID + YT_CLIENT_SECRET + YT_REFRESH_TOKEN   exchanged for one at startup
//
// Videos that already have a youtubeId in videos.json are skipped (with
// --captions-only, their captions are re-uploaded instead). New IDs and the
// playlist ID are written back to videos.json. Run embed.mjs afterwards.

import fs from "node:fs";
import path from "node:path";
import { REPO_URL, VIDEOS_DIR, formatTimestamp, paths, readManifest, readScript, sdkVersion, writeManifest } from "./lib.mjs";

const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const captionsOnly = args.includes("--captions-only");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

// ── Auth ──────────────────────────────────────────────────────────────────────

async function accessToken() {
  if (process.env.YT_ACCESS_TOKEN) return process.env.YT_ACCESS_TOKEN;
  const { YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN } = process.env;
  if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) {
    throw new Error("Set YT_ACCESS_TOKEN, or YT_CLIENT_ID + YT_CLIENT_SECRET + YT_REFRESH_TOKEN");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: YT_CLIENT_ID,
      client_secret: YT_CLIENT_SECRET,
      refresh_token: YT_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`token refresh failed: ${JSON.stringify(body)}`);
  return body.access_token;
}

let token;
async function api(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${url} → ${res.status}: ${await res.text()}`);
  return res;
}

// ── Metadata ──────────────────────────────────────────────────────────────────

/** Description with YouTube chapters taken from the script's [mm:ss] sections. */
function description(manifest, video) {
  const { sections } = readScript(video.slug);
  const chapters = sections.map((s) => `${formatTimestamp(s.start)} ${s.title}`).join("\n");
  const others = manifest.videos
    .filter((v) => v.slug !== video.slug)
    .map((v) => `• ${v.title}${v.youtubeId ? ` — https://youtu.be/${v.youtubeId}` : ""}`)
    .join("\n");
  return [
    video.summary,
    "",
    `Recorded with Soroban Identity SDK ${sdkVersion()}.`,
    "",
    "Chapters",
    chapters,
    "",
    `Script: ${REPO_URL}/blob/main/docs/videos/scripts/${video.slug}.md`,
    `Source code: ${REPO_URL}`,
    "",
    "More in this series",
    others,
  ].join("\n");
}

function snippet(manifest, video) {
  return {
    title: video.title,
    description: description(manifest, video),
    tags: manifest.defaults.tags,
    categoryId: manifest.defaults.categoryId,
    defaultLanguage: manifest.defaults.defaultLanguage,
    defaultAudioLanguage: manifest.defaults.defaultLanguage,
  };
}

// ── Uploads ───────────────────────────────────────────────────────────────────

async function uploadVideo(manifest, video) {
  const file = path.join(VIDEOS_DIR, video.file);
  const data = fs.readFileSync(file);
  const init = await api(`${UPLOAD}/videos?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(data.length),
    },
    body: JSON.stringify({
      snippet: snippet(manifest, video),
      status: { privacyStatus: manifest.series.privacyStatus, selfDeclaredMadeForKids: false },
    }),
  });
  const session = init.headers.get("location");
  const res = await api(session, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: data });
  return (await res.json()).id;
}

async function uploadThumbnail(video) {
  const file = path.join(VIDEOS_DIR, video.thumbnail ?? "");
  if (!video.thumbnail || !fs.existsSync(file)) return;
  await api(`${UPLOAD}/thumbnails/set?videoId=${video.youtubeId}&uploadType=media`, {
    method: "POST",
    headers: { "Content-Type": file.endsWith(".png") ? "image/png" : "image/jpeg" },
    body: fs.readFileSync(file),
  });
}

async function uploadCaptions(video) {
  const srt = fs.readFileSync(paths.captions(video.slug), "utf8");
  const boundary = `caption-${Date.now()}`;
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify({ snippet: { videoId: video.youtubeId, language: "en", name: "English", isDraft: false } }),
    `--${boundary}`,
    "Content-Type: application/x-subrip",
    "",
    srt,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  await api(`${UPLOAD}/captions?uploadType=multipart&part=snippet`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
}

async function ensurePlaylist(manifest) {
  if (manifest.series.playlistId) return manifest.series.playlistId;
  const res = await api(`${API}/playlists?part=snippet,status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      snippet: { title: manifest.series.title, description: manifest.series.description },
      status: { privacyStatus: manifest.series.privacyStatus },
    }),
  });
  manifest.series.playlistId = (await res.json()).id;
  writeManifest(manifest);
  return manifest.series.playlistId;
}

async function addToPlaylist(playlistId, videoId, position) {
  await api(`${API}/playlistItems?part=snippet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      snippet: { playlistId, position, resourceId: { kind: "youtube#video", videoId } },
    }),
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

const manifest = readManifest();
const targets = manifest.videos.filter((v) => !only || v.slug === only);

if (dryRun) {
  for (const v of targets) {
    const exists = fs.existsSync(path.join(VIDEOS_DIR, v.file));
    console.log(`\n=== ${v.slug} (${v.youtubeId ?? "not uploaded"}; recording ${exists ? "found" : "MISSING"}) ===`);
    console.log(JSON.stringify(snippet(manifest, v), null, 2));
  }
  process.exit(0);
}

token = await accessToken();

for (const video of targets) {
  if (captionsOnly) {
    if (!video.youtubeId) continue;
    console.log(`${video.slug}: uploading captions`);
    await uploadCaptions(video);
    continue;
  }
  if (video.youtubeId) {
    console.log(`${video.slug}: already uploaded (${video.youtubeId}), skipping`);
    continue;
  }
  if (!fs.existsSync(path.join(VIDEOS_DIR, video.file))) {
    console.warn(`${video.slug}: recording ${video.file} not found, skipping`);
    continue;
  }

  console.log(`${video.slug}: uploading video…`);
  video.youtubeId = await uploadVideo(manifest, video);
  writeManifest(manifest); // persist immediately so a later failure doesn't cause a re-upload
  console.log(`${video.slug}: https://youtu.be/${video.youtubeId}`);

  await uploadCaptions(video);
  await uploadThumbnail(video);
  const playlistId = await ensurePlaylist(manifest);
  await addToPlaylist(playlistId, video.youtubeId, manifest.videos.indexOf(video));
}

console.log("Done. Run `node docs/videos/tools/embed.mjs` to update the docs.");
