/**
 * Rehearsal history is opt-in and stored only in this browser.
 * No raw audio is ever saved. Transcripts require a separate opt-in.
 * Local profiles are NOT secure authentication or cross-device storage.
 */
import type { SpeechSegment, SpeechMetrics, TimedSection } from "./metrics";

export const HISTORY_STORAGE_KEY = "tick-tock-ai-rehearsal-history-v1";
export const HISTORY_LIMIT = 60;

export interface HistoricalSection {
  id: number;
  name: string;
  speaker?: string;
  target: number;
  actual: number;
  units: number;
  rate: number | null;
  transcript?: string;
}

export interface RehearsalFeedback {
  summary: string;
  nextSteps: string[];
}

export interface RehearsalRun {
  id: string;
  presentationId: string;
  owner: string;
  title: string;
  presentationMode: "individual" | "group";
  recordedAt: number;
  duration: number;
  language: string;
  transcriptSaved: boolean;
  feedback?: RehearsalFeedback;
  sections: HistoricalSection[];
}

function finiteSeconds(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(86_400, Math.round(value * 10) / 10)
    : 0;
}

export function createRehearsalRun(input: {
  id: string;
  presentationId: string;
  owner: string;
  title: string;
  presentationMode: "individual" | "group";
  timedSections: TimedSection[];
  segments: SpeechSegment[];
  metrics: SpeechMetrics;
  duration: number;
  includeTranscript: boolean;
  feedback?: RehearsalFeedback;
  now?: number;
}): RehearsalRun {
  return {
    id: input.id,
    presentationId: input.presentationId,
    owner: input.owner,
    title: input.title.slice(0, 120),
    presentationMode: input.presentationMode,
    recordedAt: input.now ?? Date.now(),
    duration: finiteSeconds(input.duration),
    language: input.metrics.language,
    transcriptSaved: input.includeTranscript,
    ...(input.feedback ? { feedback: input.feedback } : {}),
    sections: input.timedSections.slice(0, 50).map((section) => {
      const metrics = input.metrics.sections.find((entry) => entry.id === section.id);
      const words = input.segments
        .filter((entry) => entry.sectionId === section.id)
        .map((entry) => entry.text)
        .join(" ");
      return {
        id: section.id,
        name: section.name.slice(0, 100),
        speaker: section.speaker?.slice(0, 100),
        target: finiteSeconds(section.target),
        actual: finiteSeconds(section.actual),
        units: Math.max(0, Math.min(100_000, metrics?.words ?? 0)),
        rate: metrics?.wpm ?? null,
        ...(input.includeTranscript ? { transcript: words.slice(0, 8000) } : {}),
      };
    }),
  };
}

export function readHistory(storage: Pick<Storage, "getItem">): RehearsalRun[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(HISTORY_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is RehearsalRun => Boolean(
        x && typeof x === "object" &&
        typeof x.id === "string" && typeof x.presentationId === "string" &&
        typeof x.owner === "string" && Array.isArray(x.sections) &&
        typeof x.recordedAt === "number",
      ))
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function writeHistory(storage: Pick<Storage, "setItem">, runs: RehearsalRun[]): boolean {
  try {
    storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(runs.slice(0, HISTORY_LIMIT)));
    return true;
  } catch {
    return false;
  }
}

export function upsertHistory(runs: RehearsalRun[], run: RehearsalRun): RehearsalRun[] {
  return [run, ...runs.filter((r) => r.id !== run.id)]
    .sort((a, b) => b.recordedAt - a.recordedAt)
    .slice(0, HISTORY_LIMIT);
}

export function historyForPresentation(
  runs: RehearsalRun[],
  owner: string,
  presentationId: string,
): RehearsalRun[] {
  return runs.filter((run) => run.owner === owner && run.presentationId === presentationId)
    .sort((a, b) => b.recordedAt - a.recordedAt);
}

/** This is a prototype profile label, NOT a secure user identity. */
export function historyOwner(email?: string | null): string {
  return email?.trim().toLowerCase() || "guest:local-device";
}
