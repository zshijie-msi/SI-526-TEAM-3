import type { ContentFeedback } from "./history";
import { isChineseLanguage } from "./metrics.ts";

export interface RehearsalSpeechSection {
  id: number;
  name: string;
  transcript: string;
  actualSeconds: number;
  targetSeconds: number;
  capturedSeconds: number;
  capturedUnits: number;
}

const commonWords = new Set(
  "this that these those very really just also then when where what which there here have does some like will would could should about because with from they them your their ours were been going make into over".split(" "),
);

function mostFrequent(words: string[]) {
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0];
}

function repeatedWording(transcript: string, chinese: boolean) {
  if (chinese) {
    const together = /(\p{Script=Han}{2,5})[\s、，,]*\1/u.exec(transcript);
    return together ? [together[1], 2] as const : undefined;
  }

  const tokens = [...transcript.matchAll(/\p{L}+(?:['’]\p{L}+)*/gu)];
  const words = tokens.map(([word]) => word.toLowerCase());
  // A restarted phrase is stronger evidence than repeating one topic word.
  for (const length of [3, 2]) {
    for (let i = 0; i + 2 * length <= words.length; i++) {
      const phrase = words.slice(i, i + length).join(" ");
      if (phrase === words.slice(i + length, i + 2 * length).join(" ")) {
        const last = tokens[i + length - 1];
        return [transcript.slice(tokens[i].index, last.index + last[0].length), 2] as const;
      }
    }
  }
  const frequent = mostFrequent(words.filter((word) => word.length >= 4 && !commonWords.has(word)));
  if (frequent && frequent[1] >= 3 && frequent[1] / words.length >= 0.07) {
    return [tokens[words.indexOf(frequent[0])][0], frequent[1]] as const;
  }
}

export function buildSpeechFeedback(sections: RehearsalSpeechSection[], language: string) {
  const chinese = isChineseLanguage(language);
  const patterns: Array<ContentFeedback["suggestions"][number] & { priority: number }> = [];

  for (const section of sections) {
    const sectionName = section.name;
    const seconds = Math.round(section.capturedSeconds);
    const units = section.capturedUnits;
    if (seconds >= 10 && units > 0 && units / seconds <= 0.35 && !chinese) {
      patterns.push({
        sectionName, priority: 3,
        suggestion: `The mic was on for about ${seconds}s and captured ${units} ${units === 1 ? "word" : "words"}. Check the transcript. If it matches, rehearse this section starting with one complete sentence.`,
      });
    } else if (seconds >= 10 && units > 0 && units / seconds <= 0.5 && chinese) {
      patterns.push({
        sectionName, priority: 3,
        suggestion: `麦克风开启约 ${seconds} 秒，识别到约 ${units} 字。先确认是否有漏识别。如果转录符合实际，试着先用一个完整句子说出这一段的重点。`,
      });
    } else if (language.startsWith("en") && seconds >= 10 && units / seconds >= 3.5) {
      patterns.push({
        sectionName, priority: 1,
        suggestion: `About ${Math.round(units * 60 / seconds)} words per minute in the captured speech. Try a short pause after your main point before moving on.`,
      });
    }

    const fillerMatches = section.transcript.match(chinese
      ? /嗯+|呃+|那个|那個|就是说|就是說/gu
      : /\b(?:u+m+|u+h+|erm+|hmm+|you\s+know|i\s+mean)\b/giu) ?? [];
    const normalizedFillers = fillerMatches.map((word) => word.toLowerCase().replace(/\s+/g, " "));
    const filler = mostFrequent(normalizedFillers);
    if (filler && filler[1] >= 2) {
      patterns.push({
        sectionName, quote: fillerMatches[normalizedFillers.indexOf(filler[0])], priority: 2,
        suggestion: chinese
          ? `这个口头语出现了 ${filler[1]} 次。下一遍试着用短停顿代替，再接着说下一个意思。`
          : `This filler appeared ${filler[1]} times. Try replacing it with a short pause before the next idea.`,
      });
    }

    const repeat = repeatedWording(section.transcript, chinese);
    if (repeat && repeat[0].toLowerCase() !== filler?.[0]) {
      patterns.push({
        sectionName, quote: repeat[0], priority: 1,
        suggestion: chinese
          ? `这处措辞出现了 ${repeat[1]} 次。重练时试着合并意思相同的部分，再接下一个要点。`
          : `This wording appeared ${repeat[1]} times. If those uses make the same point, combine them into one clear sentence.`,
      });
    }
  }

  const suggestions = patterns.sort((a, b) => b.priority - a.priority).slice(0, 3)
    .map(({ sectionName, quote, suggestion }) => ({ sectionName, quote, suggestion }));
  if (suggestions.length) return { suggestions, practicePrompt: null };

  const excerpt = sections.flatMap((section) => section.transcript.split(/(?<=[.!?。！？])\s*|\n/u)
    .filter((line) => /[\p{L}\p{N}]/u.test(line))
    .map((line) => ({ sectionName: section.name, quote: line.trim() })))
    .sort((a, b) => b.quote.length - a.quote.length)[0];
  return {
    suggestions,
    practicePrompt: excerpt ? {
      sectionName: excerpt.sectionName, quote: excerpt.quote.slice(0, 160),
      suggestion: chinese
        ? "重练这一处时，先用一句话说出重点，再补一个具体例子。"
        : "Try leading with the main point in one sentence, then give one concrete example.",
    } : null,
  };
}
