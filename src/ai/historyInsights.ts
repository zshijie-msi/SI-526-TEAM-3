import type { RehearsalRun } from "./history";

export interface SectionHint {
  sectionId: number;
  sectionName: string;
  kind: "over-time" | "under-time" | "variable";
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
function findRehearsedSection(run: RehearsalRun, section: { id: number; name: string }) {
  const name = key(section.name.slice(0, 100));
  const matchesName = (candidate: RehearsalRun["sections"][number]) =>
    typeof candidate?.name === "string" && key(candidate.name) === name;
  return run.sections.find((candidate) => matchesName(candidate) && candidate.id === section.id) ??
    run.sections.find(matchesName);
}

export function liveRehearsalContext(runs: RehearsalRun[], section: { id: number; name: string }) {
  const recent = runs.flatMap((run) => {
    const sample = findRehearsedSection(run, section);
    return sample && Number.isFinite(sample.actual) && sample.actual > 0 ? [{ run, sample }] : [];
  }).slice(0, 3);
  const suggestions = new Set<string>();
  for (const { run } of recent) {
    if (!run.feedback || !("suggestions" in run.feedback) || !Array.isArray(run.feedback.suggestions)) continue;
    for (const item of run.feedback.suggestions) {
      if (typeof item?.sectionName === "string" && key(item.sectionName) === key(section.name.slice(0, 100)) &&
          typeof item.suggestion === "string" && item.suggestion.trim()) {
        suggestions.add(item.suggestion.trim().slice(0, 450));
      }
    }
  }
  return {
    attempts: recent.map(({ run, sample }) => ({
      actualSeconds: sample.actual,
      targetSeconds: sample.target,
      speechRate: sample.rate ?? null,
      language: typeof run.language === "string" ? run.language.slice(0, 20) : "",
      ...(run.transcriptSaved && sample.transcript?.trim()
        ? { transcript: sample.transcript.trim().slice(0, 650) }
        : {}),
    })),
    suggestions: [...suggestions].slice(0, 3),
  };
}

/** Timing reminders require a pattern across at least two rehearsals. */
export function buildHistoryHints(args: {
  runs: RehearsalRun[];
  sections: Array<{ id: number; name: string; target: number }>;
}): SectionHint[] {
  const { runs, sections } = args;
  const result: SectionHint[] = [];
  for (const section of sections) {
    const samples = runs.slice(0, 8).map((run) => findRehearsedSection(run, section))
      .filter((sample): sample is NonNullable<typeof sample> => sample !== undefined);
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
  }
  return result;
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
