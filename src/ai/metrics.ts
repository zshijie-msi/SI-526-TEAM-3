/**
 * Deterministic, always-on timing feedback for the optional Speech Coach.
 * These are approximate text rates, NOT LLM evaluations of content or voice.
 */
export interface SpeechSegment {
  sectionId: number;
  text: string;
  atSecond: number;
  language?: string;
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
  words: number; // Language-specific count; preserve existing consumers.
  wpm: number | null; // WPM in English, approximate CPM in Chinese.
  target: number;
  actual: number;
}

export interface SpeechMetrics {
  words: number;
  wpm: number | null;
  language: string;
  unitLabel: string;
  rateLabel: string;
  sections: SectionSpeechMetrics[];
}

export function isChineseLanguage(language: string = "en-US"): boolean {
  return language.toLowerCase().startsWith("zh");
}

export function countEnglishWords(text: string): number {
  // Unicode letters keep common European accents in Spanish and French words.
  return (text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) ?? []).length;
}

/**
 * Mandarin transcripts often have no spaces between words. A pure WPM count
 * would incorrectly report almost zero. Count each Han character as one
 * approximate speech unit; Latin-language words in a mixed utterance add one
 * unit each. These mixed units must not be compared to English WPM thresholds.
 */
export function countSpeechUnits(text: string, language: string): number {
  if (!isChineseLanguage(language)) return countEnglishWords(text);
  const han = (text.match(/\p{Script=Han}/gu) ?? []).length;
  const remaining = text.replace(/\p{Script=Han}/gu, " ");
  return han + countEnglishWords(remaining);
}

/** Not enough speech? Avoid implying a meaningful pace measurement. */
export function wordsPerMinute(words: number, activeSeconds: number): number | null {
  if (!Number.isFinite(activeSeconds) || activeSeconds < 5 || words < 4) return null;
  return Math.round((words * 60) / activeSeconds);
}

export function summarizeSpeech(
  segments: SpeechSegment[],
  timedSections: TimedSection[],
  totalActiveSeconds: number,
  selectedLanguage = "en-US",
): SpeechMetrics {
  // The free prototype locks its selected recognition language once speech is
  // captured. Switching between runs does not mix incompatible measurements.
  const detected = segments.map((segment) => segment.language ?? selectedLanguage);
  const language = detected[0] ?? selectedLanguage;
  const chinese = detected.some((value) => isChineseLanguage(value));
  const mixed = new Set(detected).size > 1;
  const sections = timedSections.map((section) => {
    const words = segments
      .filter((item) => item.sectionId === section.id)
      .reduce((sum, item) => sum + countSpeechUnits(item.text, item.language ?? language), 0);
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
  return {
    words,
    wpm: wordsPerMinute(words, totalActiveSeconds),
    language,
    unitLabel: mixed ? "Mixed speech units" :
      chinese ? "Chinese characters / English words" : "Words",
    rateLabel: chinese || mixed ? "Units/min (approx.)" : "WPM (estimate)",
    sections,
  };
}

/** Immediate cues never call an API or block the app's timer. */
export function livePaceCue(args: {
  target: number;
  sectionElapsed: number;
  sectionWords: number;
  language?: string;
}): string | null {
  const { target, sectionElapsed, sectionWords, language = "en-US" } = args;
  const zh = isChineseLanguage(language);
  if (target > 0) {
    const remaining = target - sectionElapsed;
    if (remaining <= 0) return zh ? "这一节已超时，可以准备切换章节。" : "Over section target — move when ready.";
    if (remaining <= 10) return zh ? "这一节还剩约 10 秒，可以准备收尾。" : "Wrap up this section soon.";
  }
  // Only the English threshold was informally selected for this prototype.
  // Don't apply it to Chinese characters, French or Spanish speech.
  if (language !== "en-US") return null;
  const wpm = wordsPerMinute(sectionWords, sectionElapsed);
  if (wpm !== null && sectionElapsed >= 15 && sectionWords >= 15 && wpm > 190) {
    return "You're speaking quickly. Try a slower pace.";
  }
  if (wpm !== null && sectionElapsed >= 25 && sectionWords >= 15 && wpm < 95) {
    return "Your pace is quite slow. Adjust if you need to.";
  }
  return null;
}

/** Specific but cautious; no semantic claims without an LLM or outline. */
export function localSuggestions(metrics: SpeechMetrics): string[] {
  const chinese = isChineseLanguage(metrics.language);
  if (metrics.words === 0) return [chinese
    ? "没有识别到语音，请检查麦克风权限；计时结果仍可使用。"
    : "No speech was captured. Check microphone permission or use the timer results."];
  const ideas: string[] = [];
  if (metrics.language === "en-US") {
    if (metrics.wpm !== null && metrics.wpm > 175) ideas.push("You spoke quickly overall. Try a slightly slower run.");
    if (metrics.wpm !== null && metrics.wpm < 105) ideas.push("Your speaking pace was fairly slow. Check whether you want more energy.");
  }
  const farthest = [...metrics.sections].filter((s) => s.target > 0).sort((a, b) =>
    Math.abs(b.actual - b.target) - Math.abs(a.actual - a.target),
  )[0];
  if (farthest && Math.abs(farthest.actual - farthest.target) > 10) {
    if (chinese) {
      ideas.push('“' + farthest.name + '”' +
        (farthest.actual > farthest.target ? "超时" : "提前结束") +
        "约 " + Math.round(Math.abs(farthest.actual - farthest.target)) + " 秒。");
    } else {
      ideas.push('"' + farthest.name + '" was ' +
        Math.round(Math.abs(farthest.actual - farthest.target)) + ' seconds ' +
        (farthest.actual > farthest.target ? "over" : "under") + " its target.");
    }
  }
  if (!ideas.length) ideas.push(chinese
    ? "目前没有明显的章节时间偏差，可以再练习一次。"
    : "Your measured timing and speaking pace look fairly consistent. Try another rehearsal.");
  return ideas;
}
