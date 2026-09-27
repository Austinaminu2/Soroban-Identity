#!/usr/bin/env node
// Generate captions from each video's script.
//
//   node docs/videos/tools/build-captions.mjs [slug...]
//
// For every scripts/<slug>.md it writes:
//   captions/<slug>.srt       SubRip cues, timed from the script's [mm:ss] section markers
//   transcripts/<slug>.txt    plain narration, for YouTube's "auto-sync" caption timing
//
// Narration is every line starting with "> ". Within a section, cues are spread
// across the section's time span in proportion to their word count. The timings
// are a draft: after recording, either upload transcript.txt to YouTube with
// auto-sync, or nudge the [mm:ss] markers to match the edit and re-run this.

import fs from "node:fs";
import path from "node:path";
import { paths, readManifest, readScript } from "./lib.mjs";

const MAX_LINE = 42; // characters per caption line (broadcast convention)
const MAX_LINES = 2;
const LEAD_OUT = 0.25; // seconds of silence between sections

function srtTime(sec) {
  const ms = Math.round(sec * 1000);
  const h = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0");
  const s = String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0");
  const frac = String(ms % 1000).padStart(3, "0");
  return `${h}:${m}:${s},${frac}`;
}

/** Split a sentence into caption-sized chunks of up to MAX_LINES × MAX_LINE. */
function chunk(sentence) {
  const words = sentence.split(/\s+/);
  const cues = [];
  let lines = [""];
  for (const w of words) {
    const current = lines.at(-1);
    if ((current + " " + w).trim().length <= MAX_LINE) {
      lines[lines.length - 1] = (current + " " + w).trim();
    } else if (lines.length < MAX_LINES) {
      lines.push(w);
    } else {
      cues.push(lines);
      lines = [w];
    }
  }
  if (lines[0]) cues.push(lines);
  return cues;
}

function buildSrt(sections) {
  const out = [];
  let n = 1;
  for (const s of sections) {
    const cues = s.narration.flatMap(chunk);
    if (cues.length === 0) continue;
    const words = cues.map((c) => c.join(" ").split(/\s+/).length);
    const total = words.reduce((a, b) => a + b, 0);
    const span = s.end - s.start - LEAD_OUT;
    let t = s.start;
    cues.forEach((lines, i) => {
      const d = (words[i] / total) * span;
      out.push(String(n++), `${srtTime(t)} --> ${srtTime(t + d)}`, ...lines, "");
      t += d;
    });
  }
  return out.join("\n");
}

function build(slug) {
  const { sections } = readScript(slug);
  const srt = buildSrt(sections);
  const transcript = sections.map((s) => s.narration.join("\n")).filter(Boolean).join("\n\n") + "\n";
  for (const file of [paths.captions(slug), paths.transcript(slug)]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  fs.writeFileSync(paths.captions(slug), srt);
  fs.writeFileSync(paths.transcript(slug), transcript);
  const words = transcript.split(/\s+/).filter(Boolean).length;
  console.log(`${slug}: ${sections.length} sections, ${words} words → captions/${slug}.srt, transcripts/${slug}.txt`);
}

const manifest = readManifest();
const slugs = process.argv.slice(2).length ? process.argv.slice(2) : manifest.videos.map((v) => v.slug);
for (const slug of slugs) build(slug);
