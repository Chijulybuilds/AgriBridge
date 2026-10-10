// The voiceover, from ElevenLabs: one MP3 per scene plus word timings for the captions.
//
//   node voice.mjs --list                 Nigerian-accented voices in the ElevenLabs voice library
//   node voice.mjs --voice <voice_id>     record every scene with that voice
//   node voice.mjs --voice <id> --only s05   re-record one scene
//
// The key comes from ELEVENLABS_API_KEY (environment, or video/.env, which is never committed).
// Writes public/vo/<scene>.mp3 and public/vo/timing.json, which the video reads for its length and captions.
import fs from "node:fs";
import path from "node:path";
import { SCENES, spokenText } from "./src/scenes.ts";

const here = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1");
const envFile = path.join(here, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error("Set ELEVENLABS_API_KEY (in video/.env or the environment).");
  process.exit(1);
}
const API = "https://api.elevenlabs.io";
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function call(url, init = {}) {
  const res = await fetch(API + url, { ...init, headers: { "xi-api-key": KEY, "content-type": "application/json", ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${url}: ${res.status} ${await res.text()}`);
  return res.json();
}

if (process.argv.includes("--list")) {
  const { voices } = await call("/v1/shared-voices?page_size=40&language=en&accent=nigerian&sort=usage_character_count_1y");
  for (const v of voices) {
    console.log([v.voice_id, v.public_owner_id, v.name, v.gender, v.age, v.descriptive, v.use_case, v.preview_url].join(" | "));
  }
  process.exit(0);
}

const voiceId = arg("--voice") ?? process.env.ELEVENLABS_VOICE_ID;
if (!voiceId) {
  console.error("Pass --voice <voice_id> (see --list) or set ELEVENLABS_VOICE_ID.");
  process.exit(1);
}
const only = arg("--only");
const out = path.join(here, "public", "vo");
fs.mkdirSync(out, { recursive: true });
const timingFile = path.join(out, "timing.json");
const timings = fs.existsSync(timingFile) ? JSON.parse(fs.readFileSync(timingFile, "utf8")) : {};

/** Word start/end times from ElevenLabs' per-character alignment. */
function words(alignment) {
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment;
  const result = [];
  let current = null;
  characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (current) result.push(current);
      current = null;
    } else if (!current) current = { start: starts[i], end: ends[i] };
    else current.end = ends[i];
  });
  if (current) result.push(current);
  return result;
}

for (const [index, scene] of SCENES.entries()) {
  if (only && scene.id !== only) continue;
  const text = spokenText(scene);
  const body = {
    text,
    model_id: "eleven_multilingual_v2",
    // Steady and clear for a product demo: a calm, polished read, slightly slower than conversation.
    voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: 0.94 },
    // Neighbouring scenes, so the intonation flows from one scene into the next.
    previous_text: SCENES[index - 1] ? spokenText(SCENES[index - 1]) : undefined,
    next_text: SCENES[index + 1] ? spokenText(SCENES[index + 1]) : undefined,
  };
  const result = await call(`/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, { method: "POST", body: JSON.stringify(body) });
  fs.writeFileSync(path.join(out, `${scene.id}.mp3`), Buffer.from(result.audio_base64, "base64"));
  const spoken = words(result.alignment);
  const expected = text.split(" ").length;
  if (spoken.length !== expected) console.warn(`  ${scene.id}: ${spoken.length} timed words for ${expected} written; captions may drift slightly.`);
  const duration = result.alignment.character_end_times_seconds.at(-1);
  timings[scene.id] = { audio: `vo/${scene.id}.mp3`, duration, spoken };
  fs.writeFileSync(timingFile, JSON.stringify(timings, null, 2));
  console.log(`${scene.id}  ${duration.toFixed(1)}s  ${scene.label}`);
}
const total = Object.values(timings).reduce((sum, t) => sum + t.duration, 0);
console.log(`Voice total ${(total / 60).toFixed(2)} min (plus ~${((SCENES.length * 1.2) / 60).toFixed(2)} min of pauses).`);
