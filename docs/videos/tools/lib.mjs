// Shared helpers for the video tooling.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const VIDEOS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = path.resolve(VIDEOS_DIR, "../..");
const MANIFEST = path.join(VIDEOS_DIR, "videos.json");

export function readManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
}

export function writeManifest(manifest) {
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
}

export const REPO_URL = "https://github.com/El-Chapo-Npm/Soroban-Identity";

export const paths = {
  script: (slug) => path.join(VIDEOS_DIR, "scripts", `${slug}.md`),
  captions: (slug) => path.join(VIDEOS_DIR, "captions", `${slug}.srt`),
  transcript: (slug) => path.join(VIDEOS_DIR, "transcripts", `${slug}.txt`),
};

export function readScript(slug) {
  return parseScript(fs.readFileSync(paths.script(slug), "utf8"));
}

export function sdkVersion() {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "sdk", "package.json"), "utf8")).version;
}

export function formatTimestamp(sec) {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

export const toSeconds = (mmss) => {
  const [m, s] = mmss.split(":").map(Number);
  return m * 60 + s;
};

export function parseScript(source) {
  const front = source.match(/^---\n([\s\S]*?)\n---/);
  const meta = Object.fromEntries(
    (front?.[1] ?? "").split("\n").map((l) => l.split(/:\s(.+)/).slice(0, 2)).filter(([k]) => k)
  );
  if (!meta.duration) throw new Error("script front matter is missing `duration`");

  const sections = [];
  for (const line of source.split("\n")) {
    const heading = line.match(/^##\s+\[(\d{2}:\d{2})\]\s+(.*)$/);
    if (heading) {
      sections.push({ start: toSeconds(heading[1]), title: heading[2], narration: [] });
    } else if (line.startsWith("> ") && sections.length) {
      sections.at(-1).narration.push(line.slice(2).trim());
    }
  }
  sections.forEach((s, i) => {
    s.end = i + 1 < sections.length ? sections[i + 1].start : toSeconds(meta.duration);
    if (s.end <= s.start) throw new Error(`section "${s.title}" has no duration`);
  });
  return { meta, sections };
}

