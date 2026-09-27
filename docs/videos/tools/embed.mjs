#!/usr/bin/env node
// Refresh the video embeds in the docs from videos.json.
//
//   node docs/videos/tools/embed.mjs
//
// - docs/videos/README.md: the core-series table between
//   `<!-- videos:start -->` and `<!-- videos:end -->`
// - README.md (repo root): the same block, as a plain list (GitHub strips iframes)
// - docs/videos/scripts/<slug>.md: the player between `<!-- video:watch -->`
//   and `<!-- /video:watch -->`, right under the title
//
// Docs pages use the privacy-enhanced youtube-nocookie embed, as required by
// the embedding guidance in docs/videos/README.md.

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, REPO_URL, VIDEOS_DIR, paths, readManifest } from "./lib.mjs";

const manifest = readManifest();
const playlist = manifest.series.playlistId
  ? `https://www.youtube.com/playlist?list=${manifest.series.playlistId}`
  : null;

const shortTitle = (v) => v.title.replace(/^Soroban Identity #\d+ — /, "");
const blob = (file) => `${REPO_URL}/blob/main/${path.relative(REPO_ROOT, file)}`;

function iframe(v) {
  return [
    "<iframe",
    `  src="https://www.youtube-nocookie.com/embed/${v.youtubeId}"`,
    `  title="${shortTitle(v)}"`,
    '  width="100%" height="400" frameborder="0"',
    '  allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"',
    "  allowfullscreen></iframe>",
  ].join("\n");
}

/** Core-series table for the docs page. */
function table() {
  const rows = manifest.videos.map((v, i) => {
    const title = v.youtubeId ? `[${shortTitle(v)}](https://youtu.be/${v.youtubeId})` : shortTitle(v);
    const links = [
      `[Script](./scripts/${v.slug}.md)`,
      `[Captions](${blob(paths.captions(v.slug))})`,
      `[Transcript](${blob(paths.transcript(v.slug))})`,
    ].join(" · ");
    return `| ${i + 1} | ${title} | ${v.duration.replace(/^0/, "").replace(/:00$/, " min")} | ${v.summary} | ${links} | ${v.youtubeId ? "Published" : "Scripted"} |`;
  });
  return [
    ...(playlist ? [`▶ **[Watch the full playlist on YouTube](${playlist})**`, ""] : []),
    "| # | Title | Length | Covers | Materials | Status |",
    "|---|-------|--------|--------|-----------|--------|",
    ...rows,
  ].join("\n");
}

/** Compact list for the root README. */
function list() {
  const items = manifest.videos.map((v, i) => {
    const link = v.youtubeId ? `[${shortTitle(v)}](https://youtu.be/${v.youtubeId})` : `${shortTitle(v)} *(coming soon)*`;
    return `${i + 1}. ${link} (${v.duration})`;
  });
  return [
    ...items,
    "",
    `Scripts, captions and transcripts are in [docs/videos](docs/videos/README.md)${playlist ? `; the whole series is on [YouTube](${playlist})` : ""}.`,
  ].join("\n");
}

function replaceBlock(file, content) {
  const source = fs.readFileSync(file, "utf8");
  const re = /(<!-- videos:start -->\n)[\s\S]*?(<!-- videos:end -->)/;
  if (!re.test(source)) throw new Error(`${file} has no <!-- videos:start/end --> markers`);
  fs.writeFileSync(file, source.replace(re, (_, open, close) => `${open}${content}\n${close}`));
  console.log(`updated ${path.relative(REPO_ROOT, file)}`);
}

replaceBlock(path.join(VIDEOS_DIR, "README.md"), table());
replaceBlock(path.join(REPO_ROOT, "README.md"), list());

// Player at the top of each script, right under the H1.
for (const v of manifest.videos) {
  const file = paths.script(v.slug);
  const source = fs.readFileSync(file, "utf8");
  const block = `<!-- video:watch -->\n${v.youtubeId ? iframe(v) : "*Video coming soon.*"}\n<!-- /video:watch -->`;
  const re = /<!-- video:watch -->[\s\S]*?<!-- \/video:watch -->/;
  const next = re.test(source)
    ? source.replace(re, () => block)
    : source.replace(/^(# .*\n)/m, (h1) => `${h1}\n${block}\n`);
  fs.writeFileSync(file, next);
}
console.log(`updated ${manifest.videos.length} script pages`);
