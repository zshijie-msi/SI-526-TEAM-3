/**
 * Simple, deterministic feedback for the free pilot. This is not an LLM,
 * and does not claim to measure voice quality, emotion or filler words.
 */
export interface SpeechSegment {
  sectionId: number;
  text: string;
  atSecond: number;
}

export interface TimedSection {
  id: number;
  name: string;
  speaker?: string;
  target: number;
  actual: number;
}

export interface SectionSpeechMetrics {
  id: number;
  name: string;
  speaker?: string;
  words: number;
  wpm: number | null;
  target: number;
  actual: number;
}

export interface SpeechMetrics {
  words: number;
  wpm: number | null;
  sections: SectionSpeechMetrics[];
}

export function countEnglishWords(text: string): number {
  return (text.match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g) ?? []).length;
}

/** Show WPM only once there is a useful amount of speech. */
export function wordsPerMinute(words: number, activeSeconds: number): number | null {
  if (!Number.isFinite(activeSeconds) || activeSeconds < 5 || words < 4) return null;
  return Math.round((words * 60) / activeSeconds);
}

export function summarizeSpeech(
  segments: SpeechSegment[],
  timedSections: TimedSection[],
  totalActiveSeconds: number,
): SpeechMetrics {
  const sections = timedSections.map((section) => {
    const words = segments
      .filter((item) => item.sectionId === section.id)
      .reduce((sum, item) => sum + countEnglishWords(item.text), 0);
    return {
      id: section.id,
      name: section.name,
      speaker: section.speaker,
      words,
      wpm: wordsPerMinute(words, section.actual),
      target: section.target,
      actual: section.actual,
    };
  });
  const words = sections.reduce((sum, section) => sum + section.words, 0);
  return { words, wpm: wordsPerMinute(words, totalActiveSeconds), sections };
}

/** Cues are intentionally brief and may be disabled without losing timing. */
export function livePaceCue(args: {
  target: number;
  sectionElapsed: number;
  sectionWords: number;
}): string | null {
  const { target, sectionElapsed, sectionWords } = args;
  if (target > 0) {
    const remaining = target - sectionElapsed;
    if (remaining <= 0) return "Over section target — move when ready.";
    if (remaining <= 10) return "Wrap up this section soon.";
  }
  const wpm = wordsPerMinute(sectionWords, sectionElapsed);
  if (wpm !== null && sectionElapsed >= 15 && sectionWords >= 15 && wpm > 190) {
    return "You're speaking quickly. Try a slower pace.";
  }
  if (wpm !== null && sectionElapsed >= 25 && sectionWords >= 15 && wpm < 95) {
    return "Your pace is quite slow. Adjust if you need to.";
  }
  return null;
}

/** Approximate, English-oriented reflection; does not invent qualitative diagnoses. */
export function localSuggestions(metrics: SpeechMetrics): string[] {
  if (metrics.words === 0) return ["No speech was captured. Check microphone permission or use the timer results."];
  const ideas: string[] = [];
  if (metrics.wpm !== null && metrics.wpm > 175) ideas.push("You spoke quickly overall. Try a slightly slower run.");
  if (metrics.wpm !== null && metrics.wpm < 105) ideas.push("Your speaking pace was fairly slow. Check whether you want more energy.");
  const farthest = [...metrics.sections].filter((s) => s.target > 0).sort((a, b) =>
    Math.abs(b.actual - b.target) - Math.abs(a.actual - a.target),
  )[0];
  if (farthest && Math.abs(farthest.actual - farthest.target) > 10) {
    ideas.push(
      '"' + farthest.name + '" was ' +
      Math.round(Math.abs(farthest.actual - farthest.target)) + ' seconds ' +
      (farthest.actual > farthest.target ? "over" : "under") +
      " its target.",
    );
  }
  if (!ideas.length) ideas.push("Your measured timing and speaking pace look fairly consistent. Try another rehearsal.");
  return ideas;
}
