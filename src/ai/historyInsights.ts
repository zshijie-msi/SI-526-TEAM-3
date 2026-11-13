import type { RehearsalRun } from "./history";

export interface SectionHint {
  sectionId: number;
  sectionName: string;
  kind: "over-time" | "under-time" | "variable" | "outline";
  text: string;
  evidence: string;
  sampleSize: number;
}

function key(s: string): string { return s.trim().toLocaleLowerCase(); }
function median(numbers: number[]): number {
  const list = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}
function cleanContent(text: string): string {
  return text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
function contentFound(text: string, phrase: string): boolean {
  const t = cleanContent(text);
  const p = cleanContent(phrase);
  if (!p || p.length < 4) return true;
  return t.includes(p) || t.replace(/\s/g, "").includes(p.replace(/\s/g, ""));
}

/** Only section-specific lines like "Intro: key fact" are parsed. */
export function outlinePointsForSection(outline: string, sectionName: string): string[] {
  return outline.split(/\r?\n/).map((line) => {
    const match = line.trim().match(/^(?:[-*]\s*)?([^:：]{2,80})[:：]\s*(.{4,200})$/);
    return match && key(match[1]) === key(sectionName) ? match[2].trim() : "";
  }).filter(Boolean).slice(0, 10);
}

/** Requires 2+ rehearsals. Exact phrase matching is not semantic analysis. */
export function buildHistoryHints(args: {
  runs: RehearsalRun[];
  sections: Array<{ id: number; name: string; target: number }>;
  outline?: string;
}): SectionHint[] {
  const { runs, sections, outline = "" } = args;
  const result: SectionHint[] = [];
  for (const section of sections) {
    const samples = runs.slice(0, 8).map((run) =>
      run.sections.find((candidate) =>
        candidate.id === section.id && key(candidate.name) === key(section.name)
      ) ?? run.sections.find((candidate) => key(candidate.name) === key(section.name)),
    ).filter((sample): sample is NonNullable<typeof sample> => sample !== undefined);
    if (samples.length < 2 || section.target <= 0) continue;

    const over = samples.filter((sample) => sample.actual > section.target + 10).length;
    const under = samples.filter((sample) => sample.actual < Math.max(0, section.target - 10)).length;
    const avgDelta = Math.round(median(samples.map((sample) => sample.actual - section.target)));
    if (over >= 2 && over / samples.length >= 0.6) {
      result.push({
        sectionId: section.id, sectionName: section.name, kind: "over-time",
        text: "Wrap up this section sooner.",
        evidence: `${over} of ${samples.length} runs over target · median +${avgDelta}s`,
        sampleSize: samples.length,
      });
    } else if (under >= 2 && under / samples.length >= 0.6) {
      result.push({
        sectionId: section.id, sectionName: section.name, kind: "under-time",
        text: "Time to add a key detail.",
        evidence: `${under} of ${samples.length} runs under target · median ${avgDelta}s`,
        sampleSize: samples.length,
      });
    } else if (samples.length >= 3) {
      const range = Math.max(...samples.map((s) => s.actual)) - Math.min(...samples.map((s) => s.actual));
      if (range >= 25) result.push({
        sectionId: section.id, sectionName: section.name, kind: "variable",
        text: "Check the time on this section.",
        evidence: `Timing varied by ${Math.round(range)}s across ${samples.length} runs`,
        sampleSize: samples.length,
      });
    }

    const transcriptSamples = samples.filter((sample) => typeof sample.transcript === "string" &&
      sample.transcript.trim().length >= 20);
    if (transcriptSamples.length < 2) continue;
    for (const point of outlinePointsForSection(outline, section.name)) {
      const missing = transcriptSamples.filter((sample) => !contentFound(sample.transcript ?? "", point)).length;
      if (missing >= 2 && missing / transcriptSamples.length >= 0.6) result.push({
        sectionId: section.id, sectionName: section.name, kind: "outline",
        text: "Check outline point: " + point.slice(0, 85),
        evidence: `Exact phrase missing in ${missing} of ${transcriptSamples.length} transcripts`,
        sampleSize: transcriptSamples.length,
      });
    }
  }
  return result;
}

export function cueForSection(hints: SectionHint[], sectionId: number): SectionHint | null {
  const candidates = hints.filter((hint) => hint.sectionId === sectionId);
  return candidates.find((hint) => hint.kind === "outline") ??
    candidates.find((hint) => hint.kind === "over-time") ?? candidates[0] ?? null;
}

export function historyStats(runs: RehearsalRun[]): {
  count: number;
  medianDuration: number | null;
  latestDuration: number | null;
} {
  if (!runs.length) return { count: 0, medianDuration: null, latestDuration: null };
  return {
    count: runs.length,
    medianDuration: median(runs.map((run) => run.duration)),
    latestDuration: runs[0].duration,
  };
}
