import { spokenWord, type Scene } from "./scenes";

/** One scene's voiceover: its audio file, length, and when each spoken word starts and ends (seconds). */
export type SceneTiming = { audio?: string; duration: number; spoken: Array<{ start: number; end: number }> };
export type Timings = Record<string, SceneTiming>;

/** Without a recorded voice yet: a steady 2.55 words a second, so the edit can be built and checked. */
export function estimateTiming(scene: Scene): SceneTiming {
  const words = scene.narration.split(" ").flatMap((w) => spokenWord(w).split(" "));
  const per = 1 / 2.55;
  return { duration: words.length * per + 0.4, spoken: words.map((_, i) => ({ start: i * per, end: (i + 0.85) * per })) };
}

export type TimedWord = { text: string; start: number; end: number };

/** Written words with times: a written word that is spoken as several (Safe{Wallet}, the URL) spans them. */
export function displayWords(scene: Scene, timing: SceneTiming): TimedWord[] {
  const out: TimedWord[] = [];
  let i = 0;
  for (const text of scene.narration.split(" ")) {
    const count = spokenWord(text).split(" ").length;
    const first = timing.spoken[Math.min(i, timing.spoken.length - 1)];
    const last = timing.spoken[Math.min(i + count - 1, timing.spoken.length - 1)];
    out.push({ text, start: first?.start ?? 0, end: last?.end ?? 0 });
    i += count;
  }
  return out;
}

/** Caption lines: up to 8 words, breaking after sentence or clause ends once a line has 4 or more. */
export function captionLines(words: TimedWord[]): TimedWord[] {
  const lines: TimedWord[] = [];
  let current: TimedWord[] = [];
  const flush = () => {
    if (!current.length) return;
    lines.push({ text: current.map((w) => w.text).join(" "), start: current[0].start, end: current[current.length - 1].end });
    current = [];
  };
  for (const word of words) {
    current.push(word);
    const ends = /[.!?]$/.test(word.text) || (/[,:;]$/.test(word.text) && current.length >= 4);
    if (current.length >= 8 || ends) flush();
  }
  flush();
  // Each line stays up until the next begins, so captions never flicker off between phrases.
  return lines.map((line, i) => ({ ...line, end: lines[i + 1] ? lines[i + 1].start : line.end + 0.6 }));
}
