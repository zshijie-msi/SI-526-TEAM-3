import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import tickTockIcon from "./assets/tick-tock-icon.png";
import tickTockWordmark from "./assets/tick-tock-wordmark.png";
import { CoachDock, CoachReport } from "./ai/CoachUI";
import { countSpeechUnits, livePaceCue, summarizeSpeech } from "./ai/metrics";
import { useSpeechCoach } from "./ai/useSpeechCoach";
import { createRehearsalRun, historyForPresentation, historyOwner, readHistory, upsertHistory, writeHistory } from "./ai/history";
import { buildHistoryHints, cueForSection } from "./ai/historyInsights";
import { HistoryPanel, PresentHistoryHint, SaveRehearsalPanel } from "./ai/HistoryUI";
import { LiveCueOverlay } from "./ai/LiveUI";
import { useLiveFeedback } from "./ai/useLiveFeedback";

type Section = {
  id: number;
  name: string;
  target: number;
  speaker?: string;
};

type Screen =
  | "account"
  | "concepts"
  | "presentations"
  | "setup"
  | "ready"
  | "rehearse"
  | "review"
  | "presentation-ready"
  | "present"
  | "presentation-summary";
type PresentationMode = "individual" | "group";
type DisplayStyle = "minimal" | "standard" | "detailed";
type ColorMode = "muted" | "bright";
type Account = {
  name: string;
  email: string;
};
type SavedPresentation = {
  id: string;
  ownerEmail: string;
  updatedAt: number;
  title: string;
  presentationMode: PresentationMode;
  sections: Section[];
  presentationTarget?: number;
  speakers: string[];
  displayStyle: DisplayStyle;
  colorMode: ColorMode;
  hapticsEnabled: boolean;
  // Quiet Present view: hides times and ahead/behind status while presenting.
  quietMode?: boolean;
  coachOutline?: string;
};
// Story 12 (SCRUM-133): one autosaved draft per mode, per profile (guest included).
type AutosaveDraft = {
  ownerEmail: string;
  presentationMode: PresentationMode;
  updatedAt: number;
  savedPresentationId: string | null;
  title: string;
  sections: Section[];
  presentationTarget?: number;
  speakers: string[];
  displayStyle: DisplayStyle;
  colorMode: ColorMode;
  hapticsEnabled: boolean;
  quietMode?: boolean;
  coachOutline?: string;
  aiHistoryId?: string;
  editor: {
    editingId: number | null;
    name: string;
    minutes: string;
    seconds: string;
    speaker: string;
    addingSpeaker: boolean;
    newSpeaker: string;
  };
};
type PendingConfirm =
  | { kind: "delete"; presentation: SavedPresentation }
  | { kind: "replace-new"; mode: PresentationMode }
  | { kind: "replace-open"; presentation: SavedPresentation; destination: "setup" | "rehearse" | "present" }
  | { kind: "discard"; mode: PresentationMode };
type IconName =
  | "arrow-left"
  | "check"
  | "chevron-down"
  | "chevron-right"
  | "clock"
  | "edit"
  | "grip"
  | "home"
  | "pause"
  | "play"
  | "plus"
  | "restart"
  | "save"
  | "trash"
  | "user"
  | "users"
  | "warning";

const INITIAL_SECTIONS: Section[] = [
  { id: 1, name: "Intro", target: 60 },
];

// Browser storage can be blocked (private windows, embedded previews); never let that crash the app.
function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    // Saving is best-effort; the app keeps working for this session.
    return false;
  }
}

function storageRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore: nothing to clean up if storage is unavailable.
  }
}

// SCRUM-125: sections can intentionally have no speaker; never show a blank name.
const UNASSIGNED_LABEL = "Unassigned";
const speakerLabel = (speaker?: string) => speaker || UNASSIGNED_LABEL;

type SpeakerTotal = {
  key: string;
  label: string;
  unassigned: boolean;
  count: number;
  target: number;
  indexes: number[];
};

// SCRUM-126: each speaker's assigned target time (plus an Unassigned row when needed).
function getSpeakerTotals(sections: Section[], speakers: string[]): SpeakerTotal[] {
  const rows: SpeakerTotal[] = speakers.map((speaker) => ({
    key: speaker,
    label: speaker,
    unassigned: false,
    count: 0,
    target: 0,
    indexes: [],
  }));
  const unassigned: SpeakerTotal = {
    key: "__unassigned",
    label: UNASSIGNED_LABEL,
    unassigned: true,
    count: 0,
    target: 0,
    indexes: [],
  };
  sections.forEach((section, index) => {
    const row = rows.find((item) => item.key === section.speaker) ?? unassigned;
    row.count += 1;
    row.target += section.target;
    row.indexes.push(index);
  });
  return unassigned.count > 0 ? [...rows, unassigned] : rows;
}

const pluralSections = (count: number) => `${count} ${count === 1 ? "section" : "sections"}`;

function makeId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatUpdated(timestamp: number) {
  if (Date.now() - timestamp < 60_000) return "just now";
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Snapshot used to tell whether the open presentation has unsaved changes.
function setupSignature(setup: {
  title: string;
  presentationMode: PresentationMode;
  sections: Section[];
  presentationTarget?: number;
  speakers: string[];
  displayStyle: DisplayStyle;
  colorMode: ColorMode;
  hapticsEnabled: boolean;
  quietMode?: boolean;
  coachOutline?: string;
}) {
  return JSON.stringify({
    title: setup.title.trim(),
    presentationMode: setup.presentationMode,
    sections: setup.sections.map(({ id, name, target, speaker }) => ({ id, name, target, speaker: speaker || null })),
    presentationTarget: setup.presentationTarget ?? null,
    speakers: setup.speakers,
    displayStyle: setup.displayStyle,
    colorMode: setup.colorMode,
    hapticsEnabled: setup.hapticsEnabled,
    quietMode: Boolean(setup.quietMode),
    coachOutline: (setup.coachOutline ?? "").trim(),
  });
}

function readSavedPresentations(): SavedPresentation[] {
  try {
    const parsed = JSON.parse(storageGet("tick-tock-presentations") ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.id === "string" && Array.isArray(item.sections))
      .map((item) => ({
        ...item,
        title: String(item.title ?? ""),
        presentationMode: item.presentationMode === "group" ? "group" : "individual",
        speakers: Array.isArray(item.speakers) ? item.speakers : [],
        presentationTarget: Number(item.presentationTarget) > 0 ? Number(item.presentationTarget) : undefined,
        displayStyle: ["minimal", "standard", "detailed"].includes(item.displayStyle) ? item.displayStyle : "standard",
        colorMode: item.colorMode === "bright" ? "bright" : "muted",
        hapticsEnabled: Boolean(item.hapticsEnabled),
        quietMode: Boolean(item.quietMode),
        updatedAt: Number(item.updatedAt) || Date.now(),
      }));
  } catch {
    return [];
  }
}

const AUTOSAVE_KEY = "tick-tock-autosave";
const BLANK_INTRO: Section = { id: 1, name: "Intro", target: 60 };
const autosaveSlot = (ownerEmail: string, mode: PresentationMode) => `${ownerEmail || "guest"}|${mode}`;

function readAutosaves(): Record<string, AutosaveDraft> {
  try {
    const parsed = JSON.parse(storageGet(AUTOSAVE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// A brand-new setup nobody has typed into yet is not worth offering to "continue".
function isMeaningfulDraft(draft: AutosaveDraft) {
  const onlyBlankIntro =
    draft.sections.length === 1 &&
    draft.sections[0].name === BLANK_INTRO.name &&
    draft.sections[0].target === BLANK_INTRO.target &&
    !draft.sections[0].speaker;
  const editorHasText =
    draft.editor.editingId !== null &&
    Boolean(draft.editor.name || Number(draft.editor.minutes || 0) || Number(draft.editor.seconds || 0));
  return Boolean(
    draft.title.trim() || draft.speakers.length || !onlyBlankIntro || editorHasText || draft.editor.newSpeaker.trim(),
  );
}

function ConfirmDialog({
  title,
  name,
  body,
  cancelLabel,
  confirmLabel,
  danger = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  name?: string;
  body: string;
  cancelLabel: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) {
      try {
        element.showModal();
      } catch {
        element.setAttribute("open", "");
      }
    }
  }, []);
  return (
    <dialog
      aria-describedby="confirm-dialog-description"
      aria-labelledby="confirm-dialog-title"
      className="delete-presentation-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      ref={dialog}
    >
      <div>
        <h2 id="confirm-dialog-title">{title}</h2>
        {name && <p className="delete-presentation-name">{name}</p>}
        <p id="confirm-dialog-description">{body}</p>
        <div className="delete-presentation-actions">
          <Button autoFocus onClick={onCancel} variant="secondary">
            {cancelLabel}
          </Button>
          <Button icon={danger ? "trash" : undefined} onClick={onConfirm} variant={danger ? "danger" : "primary"}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

function RequiredMark() {
  return <span aria-hidden="true" className="required-mark">*</span>;
}

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    "arrow-left": <><path d="m15 18-6-6 6-6" /><path d="M9 12h10" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    "chevron-down": <path d="m6 9 6 6 6-6" />,
    "chevron-right": <path d="m9 18 6-6-6-6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    edit: <><path d="M12 20h9" /><path d="m16.5 3.5 4 4L9 19l-5 1 1-5Z" /></>,
    grip: <><circle cx="9" cy="5" r=".8" fill="currentColor" stroke="none" /><circle cx="15" cy="5" r=".8" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r=".8" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r=".8" fill="currentColor" stroke="none" /><circle cx="9" cy="19" r=".8" fill="currentColor" stroke="none" /><circle cx="15" cy="19" r=".8" fill="currentColor" stroke="none" /></>,
    home: <><path d="m3 11 9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></>,
    pause: <><path d="M9 5v14" /><path d="M15 5v14" /></>,
    play: <path d="m8 5 11 7-11 7Z" />,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    restart: <><path d="M4 8V3m0 0h5M4 3l3.5 3.5" /><path d="M5.5 9a8 8 0 1 1-1 7" /></>,
    save: <><path d="M5 4h12l2 2v14H5Z" /><path d="M8 4v6h8V4" /><path d="M8 20v-6h8v6" /></>,
    trash: <><path d="M4 7h16" /><path d="m9 7 1-3h4l1 3" /><path d="m6 7 1 13h10l1-13" /><path d="M10 11v5M14 11v5" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 21c.5-4 3-6 7-6s6.5 2 7 6" /></>,
    users: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c.4-3.7 2.5-5.5 6-5.5s5.6 1.8 6 5.5" /><path d="M15 6.2a3.2 3.2 0 0 1 0 6.1" /><path d="M17 15c2.3.7 3.6 2.4 4 5" /></>,
    warning: <><path d="M12 4 3 20h18Z" /><path d="M12 9v5" /><path d="M12 17h.01" /></>,
  };

  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {paths[name]}
    </svg>
  );
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

// SCRUM-134: spell durations out so "1" is never mistaken for one second vs one minute.
function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  if (minutes && rest) return `${minutes} min ${rest} sec`;
  if (minutes) return `${minutes} min`;
  return `${rest} sec`;
}

const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 2);

function Button({
  children,
  className = "",
  icon,
  onClick,
  type = "button",
  variant = "primary",
  disabled = false,
  ariaLabel,
  title,
  autoFocus = false,
}: {
  children?: React.ReactNode;
  className?: string;
  icon?: IconName;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
  autoFocus?: boolean;
}) {
  return (
    <button
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      className={`button button--${variant} ${className}`}
      disabled={disabled}
      onClick={onClick}
      title={title}
      type={type}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

function Brand({ onClick }: { onClick: () => void }) {
  return (
    <button className="brand" aria-label="Go to Tick-Tock home" onClick={onClick} type="button">
      <img className="brand__icon" alt="" src={tickTockIcon} />
      <img className="brand__wordmark" alt="" src={tickTockWordmark} />
    </button>
  );
}

function AppHeader({
  account,
  onAccount,
  onHome,
}: {
  account: Account | null;
  onAccount: () => void;
  onHome: () => void;
}) {
  return (
    <header className="app-header">
      <Brand onClick={onHome} />
      <div className="header-actions">
        <Button className="home-button" icon="home" onClick={onHome} variant="ghost">
          Home
        </Button>
        <Button
          ariaLabel={account ? `Account for ${account.name}` : "Sign in"}
          className={`account-button ${account ? "account-button--signed-in" : ""}`}
          icon="user"
          onClick={onAccount}
          variant="ghost"
        >
          {account ? account.name.split(" ")[0] : "Sign in"}
        </Button>
      </div>
    </header>
  );
}

const MODES: {
  id: PresentationMode;
  name: string;
  description: string;
}[] = [
  {
    id: "individual",
    name: "Individual",
    description: "Practice on your own",
  },
  {
    id: "group",
    name: "Group",
    description: "Practice with speakers and handoffs",
  },
];

// SCRUM-156: plain-language names, with what each option shows.
const DISPLAY_STYLES: {
  id: DisplayStyle;
  name: string;
  description: string;
  detail: string;
}[] = [
  {
    id: "minimal",
    name: "Simple",
    description: "Name + progress bar",
    detail: "Shows the section name and a progress bar only. Tap the screen any time to peek at the time.",
  },
  {
    id: "standard",
    name: "Section time",
    description: "Adds time used",
    detail: "Also shows which section you're on and the time used against its target, like 0:30 / 1:00.",
  },
  {
    id: "detailed",
    name: "Everything",
    description: "Adds total + pace",
    detail: "Also shows the total time for the whole presentation and whether you're on pace or over.",
  },
];

const COLOR_MODES: {
  id: ColorMode;
  name: string;
  description: string;
}[] = [
  { id: "muted", name: "Light screen", description: "Soft blue-grey background" },
  { id: "bright", name: "Dark screen", description: "Navy background, yellow bar" },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>("concepts");
  const [presentationMode, setPresentationMode] = useState<PresentationMode>("individual");
  const [title, setTitle] = useState("");
  const [sections, setSections] = useState<Section[]>(INITIAL_SECTIONS);
  const [presentationTarget, setPresentationTarget] = useState<number | null>(null);
  const [targetMinutes, setTargetMinutes] = useState("");
  const [targetSeconds, setTargetSeconds] = useState("");
  const [renamingSpeaker, setRenamingSpeaker] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [presentExitDestination, setPresentExitDestination] = useState<"home" | "setup" | null>(null);
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [isAddingSpeaker, setIsAddingSpeaker] = useState(false);
  const [newSpeaker, setNewSpeaker] = useState("");
  const [speakerError, setSpeakerError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftMinutes, setDraftMinutes] = useState("");
  const [draftSeconds, setDraftSeconds] = useState("");
  const [draftSpeaker, setDraftSpeaker] = useState("");
  const [formError, setFormError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [sectionElapsed, setSectionElapsed] = useState(0);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [actualTimes, setActualTimes] = useState<number[]>([]);
  // SCRUM-153: a rehearsal is complete once the final section is reached; otherwise it ended early.
  const [rehearsalIncomplete, setRehearsalIncomplete] = useState(false);
  const [rehearsalEndIndex, setRehearsalEndIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragAnnouncement, setDragAnnouncement] = useState("");
  // Present-mode display settings belong to each presentation (present-mode-figma-make behaviour).
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>("standard");
  const [colorMode, setColorMode] = useState<ColorMode>("muted");
  const [showPresentationCustomization, setShowPresentationCustomization] = useState(false);
  const [hapticsEnabled, setHapticsEnabled] = useState(false);
  const [quietMode, setQuietMode] = useState(false);
  const [exactTimeVisible, setExactTimeVisible] = useState(false);
  const [showLiveBreakdown, setShowLiveBreakdown] = useState(false);
  const [confirmingRehearsalSetup, setConfirmingRehearsalSetup] = useState(false);
  const [resumeRehearsalAfterConfirm, setResumeRehearsalAfterConfirm] = useState(false);
  const [account, setAccount] = useState<Account | null>(() => {
    try {
      const saved = storageGet("tick-tock-account");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [savedPresentations, setSavedPresentations] = useState<SavedPresentation[]>(readSavedPresentations);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [aiHistoryId, setAiHistoryId] = useState<string>(() => makeId());
  const [coachOutline, setCoachOutline] = useState("");
  const [historyRuns, setHistoryRuns] = useState(() => readHistory(window.localStorage));
  const [saveHistoryTranscript, setSaveHistoryTranscript] = useState(false);
  const [savedHistoryRunId, setSavedHistoryRunId] = useState<string | null>(null);
  const [historySaveError, setHistorySaveError] = useState("");
  const [historyHintsEnabled, setHistoryHintsEnabled] = useState(true);
  const [dismissedHintSection, setDismissedHintSection] = useState<number | null>(null);
  const [currentRehearsalId, setCurrentRehearsalId] = useState<string>(() => makeId());
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [autosaves, setAutosaves] = useState<Record<string, AutosaveDraft>>(readAutosaves);
  const [autosaveOn, setAutosaveOn] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountError, setAccountError] = useState("");
  const [accountReturnScreen, setAccountReturnScreen] = useState<Screen>("concepts");
  const [saveAfterSignIn, setSaveAfterSignIn] = useState(false);
  const [saveConfirmation, setSaveConfirmation] = useState("");
  const nextId = useRef(2);
  const saveFeedbackTimeout = useRef<number | null>(null);
  const exactTimeTimeout = useRef<number | null>(null);
  // Timer state always comes from elapsed monotonic time, not from interval counts.
  const clock = useRef({ totalMs: 0, sectionMs: 0, since: null as number | null });
  const lastHapticSection = useRef<number | null>(null);

  const sectionsTarget = useMemo(() => sections.reduce((total, section) => total + section.target, 0), [sections]);
  const totalTarget = presentationTarget ?? sectionsTarget;
  const remainingAllocation = totalTarget - sectionsTarget;
  const speakerTotals = useMemo(() => getSpeakerTotals(sections, speakers), [sections, speakers]);
  const unassignedCount = speakerTotals.find((row) => row.unassigned)?.count ?? 0;
  // These hooks remain mounted across Sprint 3 screens. Neither recognition nor an
  // external model can pause the independent performance.now() clock.
  const speechCoach = useSpeechCoach({
    active: isRunning && (screen === "rehearse" || screen === "present"),
    sectionId: sections[activeIndex]?.id ?? -1,
    totalElapsed,
  });
  const speechTimedSections = useMemo(() => sections.map((section, index) => ({
    ...section,
    actual: actualTimes[index] ??
      ((screen === "rehearse" || screen === "present") && index === activeIndex
        ? sectionElapsed : 0),
  })), [sections, actualTimes, screen, activeIndex, sectionElapsed]);
  const speechMetrics = useMemo(
    () => summarizeSpeech(speechCoach.segments, speechTimedSections, totalElapsed, speechCoach.language),
    [speechCoach.segments, speechTimedSections, totalElapsed, speechCoach.language],
  );
  const currentSpeechWords = speechCoach.segments
    .filter((segment) => segment.sectionId === sections[activeIndex]?.id)
    .reduce((sum, segment) => sum + countSpeechUnits(segment.text, segment.language ?? speechCoach.language), 0);
  const coachCue = livePaceCue({
    target: sections[activeIndex]?.target ?? 0,
    sectionElapsed,
    sectionWords: currentSpeechWords,
    language: speechCoach.language,
  });
  const effectiveHistoryId = activeSavedId ?? aiHistoryId;
  const historyOwnerKey = historyOwner(account?.email);
  const presentationHistory = useMemo(
    () => historyForPresentation(historyRuns, historyOwnerKey, effectiveHistoryId),
    [historyRuns, historyOwnerKey, effectiveHistoryId],
  );
  const historyHints = useMemo(
    () => buildHistoryHints({ runs: presentationHistory, sections, outline: coachOutline }),
    [presentationHistory, sections, coachOutline],
  );
  const liveFeedback = useLiveFeedback({
    running: isRunning, screen, segments: speechCoach.segments,
    interim: speechCoach.interim, language: speechCoach.language,
    sectionName: sections[activeIndex]?.name ?? "",
    sectionElapsed, target: sections[activeIndex]?.target ?? 0,
    outline: coachOutline, historyHints,
  });
  const currentHistoryHint =
    screen === "present" && historyHintsEnabled && sectionElapsed < 9 &&
    dismissedHintSection !== activeIndex
      ? cueForSection(historyHints, sections[activeIndex]?.id ?? -1)
      : null;

  const currentSignature = setupSignature({
    title,
    presentationMode,
    sections,
    presentationTarget: presentationTarget ?? undefined,
    speakers,
    displayStyle,
    colorMode,
    hapticsEnabled,
    quietMode,
    coachOutline,
  });
  const hasUnsavedChanges = activeSavedId !== null && currentSignature !== savedSignature;
  const activeSaved = savedPresentations.find((presentation) => presentation.id === activeSavedId);

  const snapshot = () => {
    const delta = clock.current.since === null ? 0 : performance.now() - clock.current.since;
    return {
      totalMs: clock.current.totalMs + delta,
      sectionMs: clock.current.sectionMs + delta,
    };
  };

  const freezeClock = () => {
    const { totalMs, sectionMs } = snapshot();
    clock.current = { totalMs, sectionMs, since: null };
    setTotalElapsed(totalMs / 1000);
    setSectionElapsed(sectionMs / 1000);
    return { totalMs, sectionMs };
  };

  const toggleTimer = () => {
    if (isRunning) {
      freezeClock();
      setIsRunning(false);
    } else {
      clock.current.since = performance.now();
      setIsRunning(true);
    }
  };

  useEffect(() => {
    if (!isRunning || (screen !== "rehearse" && screen !== "present")) return;
    const update = () => {
      const { totalMs, sectionMs } = snapshot();
      setTotalElapsed(totalMs / 1000);
      setSectionElapsed(sectionMs / 1000);
    };
    update();
    const timer = window.setInterval(update, 200);
    return () => window.clearInterval(timer);
  }, [isRunning, screen]);

  useEffect(() => {
    return () => {
      if (exactTimeTimeout.current) window.clearTimeout(exactTimeTimeout.current);
    };
  }, []);

  useEffect(() => {
    if (!storageSet("tick-tock-presentations", JSON.stringify(savedPresentations))) {
      setStorageError("This browser could not store your saved presentations. Keep this tab open, or free up browser storage.");
    }
  }, [savedPresentations]);

  useEffect(() => {
    if (!storageSet(AUTOSAVE_KEY, JSON.stringify(autosaves))) {
      setStorageError("This browser could not autosave your draft. Keep this tab open, or free up browser storage.");
    }
  }, [autosaves]);

  // Story 12: while a presentation is open, every change (including a half-typed section
  // or speaker) is written to this mode's single autosave slot for the current profile.
  useEffect(() => {
    if (!autosaveOn) return;
    const ownerEmail = account?.email ?? "";
    const draft: AutosaveDraft = {
      ownerEmail,
      presentationMode,
      updatedAt: Date.now(),
      savedPresentationId: activeSavedId,
      title,
      sections,
      presentationTarget: presentationTarget ?? undefined,
      speakers,
      displayStyle,
      colorMode,
      hapticsEnabled,
      quietMode,
      coachOutline,
      aiHistoryId,
      editor: {
        editingId,
        name: draftName,
        minutes: draftMinutes,
        seconds: draftSeconds,
        speaker: draftSpeaker,
        addingSpeaker: isAddingSpeaker,
        newSpeaker,
      },
    };
    setAutosaves((current) => ({ ...current, [autosaveSlot(ownerEmail, presentationMode)]: draft }));
  }, [
    autosaveOn,
    account,
    presentationMode,
    activeSavedId,
    title,
    sections,
    presentationTarget,
    speakers,
    displayStyle,
    colorMode,
    hapticsEnabled,
    quietMode,
    coachOutline,
    aiHistoryId,
    editingId,
    draftName,
    draftMinutes,
    draftSeconds,
    draftSpeaker,
    isAddingSpeaker,
    newSpeaker,
  ]);

  useEffect(() => {
    if (
      screen !== "present" ||
      !hapticsEnabled ||
      !isRunning ||
      !sections[activeIndex] ||
      sections[activeIndex].target - sectionElapsed > 5 ||
      sections[activeIndex].target - sectionElapsed <= 0 ||
      lastHapticSection.current === activeIndex
    ) {
      return;
    }
    lastHapticSection.current = activeIndex;
    navigator.vibrate?.([70, 50, 70]);
  }, [activeIndex, hapticsEnabled, isRunning, screen, sectionElapsed, sections]);

  const moveSection = (sectionId: number, targetIndex: number) => {
    setSections((current) => {
      const currentIndex = current.findIndex((section) => section.id === sectionId);
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= current.length || currentIndex === targetIndex) {
        return current;
      }
      const updated = [...current];
      const [moved] = updated.splice(currentIndex, 1);
      updated.splice(targetIndex, 0, moved);
      setDragAnnouncement(`${moved.name} moved to position ${targetIndex + 1} of ${current.length}.`);
      return updated;
    });
  };

  const handleDragMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (draggingId === null) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-section-id]");
    if (!target) return;
    const targetId = Number(target.dataset.sectionId);
    const targetIndex = sections.findIndex((section) => section.id === targetId);
    moveSection(draggingId, targetIndex);
  };

  const handleDragKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    section: Section,
  ) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (draggingId === section.id) {
        setDraggingId(null);
        setDragAnnouncement(`${section.name} dropped.`);
      } else {
        setDraggingId(section.id);
        setDragAnnouncement(`${section.name} picked up. Use the up and down arrow keys to move it.`);
      }
      return;
    }
    if (draggingId !== section.id || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) {
      return;
    }
    event.preventDefault();
    const currentIndex = sections.findIndex((item) => item.id === section.id);
    moveSection(section.id, currentIndex + (event.key === "ArrowUp" ? -1 : 1));
  };

  const deleteSection = (id: number) => {
    setSections((current) => current.filter((section) => section.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const openEditor = (section?: Section) => {
    setFormError("");
    setEditingId(section?.id ?? 0);
    setDraftName(section?.name ?? "");
    setDraftMinutes(section ? String(Math.floor(section.target / 60)) : "");
    setDraftSeconds(section ? String(section.target % 60).padStart(2, "0") : "");
    // New sections start Unassigned so a speaker is never silently chosen for the user.
    setDraftSpeaker(section?.speaker ?? "");
  };

  const closeEditor = () => {
    setEditingId(null);
    setFormError("");
  };

  const readDraftTarget = (): { target: number } | { error: string } => {
    const minutes = draftMinutes === "" ? 0 : Number(draftMinutes);
    const seconds = draftSeconds === "" ? 0 : Number(draftSeconds);
    const target = minutes * 60 + seconds;
    if (seconds > 59) return { error: "Seconds must be between 0 and 59." };
    if (!draftName.trim() && target === 0) return { error: "Add a section name and a target time." };
    if (!draftName.trim()) return { error: "Add a section name." };
    if (target === 0) return { error: "Set a target time of at least 1 second." };
    return { target };
  };

  const applyDraft = (current: Section[]): { sections: Section[] } | { error: string } => {
    const result = readDraftTarget();
    if ("error" in result) return result;
    const speaker = presentationMode === "group" ? draftSpeaker || undefined : undefined;
    if (editingId) {
      return {
        sections: current.map((section) =>
          section.id === editingId
            ? {
                ...section,
                name: draftName.trim(),
                target: result.target,
                speaker: presentationMode === "group" ? speaker : section.speaker,
              }
            : section,
        ),
      };
    }
    return {
      sections: [...current, { id: nextId.current++, name: draftName.trim(), target: result.target, speaker }],
    };
  };

  const saveSection = () => {
    const result = applyDraft(sections);
    if ("error" in result) {
      setFormError(result.error);
      return;
    }
    setSections(result.sections);
    closeEditor();
  };

  // SCRUM-132: a section still open in the editor is committed before saving or moving on,
  // so pressing Save never silently drops the section the user just typed.
  const commitOpenEditor = (): Section[] | null => {
    if (editingId === null) return sections;
    const untouchedNewSection =
      editingId === 0 && !draftName.trim() && !Number(draftMinutes || 0) && !Number(draftSeconds || 0);
    if (untouchedNewSection) {
      closeEditor();
      return sections;
    }
    const result = applyDraft(sections);
    if ("error" in result) {
      setFormError(`Finish or cancel the open section first. ${result.error}`);
      return null;
    }
    setSections(result.sections);
    closeEditor();
    return result.sections;
  };

  const continueToReady = () => {
    const nextSections = commitOpenEditor();
    if (!nextSections) return;
    if (!title.trim() || nextSections.length === 0) {
      setFormError("Add a presentation title and at least one section.");
      return;
    }
    setFormError("");
    setScreen("ready");
    window.scrollTo(0, 0);
  };

  const startRehearsal = () => {
    speechCoach.reset();
    liveFeedback.reset();
    setCurrentRehearsalId(makeId());
    setSavedHistoryRunId(null);
    setSaveHistoryTranscript(false);
    setHistorySaveError("");
    clock.current = { totalMs: 0, sectionMs: 0, since: performance.now() };
    lastHapticSection.current = null;
    setActiveIndex(0);
    setSectionElapsed(0);
    setTotalElapsed(0);
    setActualTimes([]);
    setRehearsalIncomplete(false);
    setRehearsalEndIndex(0);
    setConfirmingRehearsalSetup(false);
    setIsRunning(true);
    setScreen("rehearse");
  };

  const startPresentation = () => {
    speechCoach.reset();
    liveFeedback.reset();
    setDismissedHintSection(null);
    clock.current = { totalMs: 0, sectionMs: 0, since: performance.now() };
    lastHapticSection.current = null;
    setActiveIndex(0);
    setSectionElapsed(0);
    setTotalElapsed(0);
    setActualTimes([]);
    setExactTimeVisible(false);
    setShowLiveBreakdown(false);
    setIsRunning(true);
    setScreen("present");
  };

  const revealExactTime = () => {
    setExactTimeVisible(true);
    if (exactTimeTimeout.current) window.clearTimeout(exactTimeTimeout.current);
    exactTimeTimeout.current = window.setTimeout(() => setExactTimeVisible(false), 3000);
  };

  const finishRehearsal = (includeCurrent = true) => {
    const { sectionMs } = freezeClock();
    setIsRunning(false);
    // End rehearsal only appears before the last section, so ending this way is Incomplete.
    // (The check stays as a safeguard in case the button is ever shown on the last section.)
    setRehearsalIncomplete(activeIndex < sections.length - 1);
    setRehearsalEndIndex(activeIndex);
    if (includeCurrent) {
      setActualTimes((current) => {
        const next = [...current];
        next[activeIndex] = sectionMs / 1000;
        return next;
      });
    }
    setScreen("review");
    window.scrollTo(0, 0);
  };

  const nextSection = () => {
    const { sectionMs, totalMs } = snapshot();
    const nextActual = [...actualTimes];
    nextActual[activeIndex] = sectionMs / 1000;
    setActualTimes(nextActual);
    if (activeIndex === sections.length - 1) {
      clock.current = { totalMs, sectionMs, since: null };
      setTotalElapsed(totalMs / 1000);
      setSectionElapsed(sectionMs / 1000);
      setIsRunning(false);
      setRehearsalIncomplete(false);
      setRehearsalEndIndex(activeIndex);
      setScreen("review");
      window.scrollTo(0, 0);
      return;
    }
    clock.current = { totalMs, sectionMs: 0, since: isRunning ? performance.now() : null };
    setTotalElapsed(totalMs / 1000);
    setActiveIndex((value) => value + 1);
    setSectionElapsed(0);
  };

  const nextPresentationSection = () => {
    setDismissedHintSection(null);
    const { sectionMs, totalMs } = snapshot();
    const nextActual = [...actualTimes];
    nextActual[activeIndex] = sectionMs / 1000;
    setActualTimes(nextActual);
    setExactTimeVisible(false);
    if (hapticsEnabled) navigator.vibrate?.(35);
    if (activeIndex === sections.length - 1) {
      clock.current = { totalMs, sectionMs, since: null };
      setTotalElapsed(totalMs / 1000);
      setSectionElapsed(sectionMs / 1000);
      setIsRunning(false);
      setScreen("presentation-summary");
      window.scrollTo(0, 0);
      return;
    }
    clock.current = { totalMs, sectionMs: 0, since: isRunning ? performance.now() : null };
    lastHapticSection.current = null;
    setTotalElapsed(totalMs / 1000);
    setActiveIndex((value) => value + 1);
    setSectionElapsed(0);
  };

  const restartCurrentSection = () => {
    const { totalMs, sectionMs } = snapshot();
    const preservedTotal = Math.max(0, totalMs - sectionMs);
    clock.current = { totalMs: preservedTotal, sectionMs: 0, since: isRunning ? performance.now() : null };
    setTotalElapsed(preservedTotal / 1000);
    setSectionElapsed(0);
    lastHapticSection.current = null;
    setActualTimes((current) => {
      const next = [...current];
      next[activeIndex] = 0;
      return next;
    });
    setExactTimeVisible(false);
  };

  const resetToSetup = () => {
    if (screen === "present") { setPresentExitDestination("setup"); return; }
    clock.current.since = null;
    setIsRunning(false);
    setConfirmingRehearsalSetup(false);
    setScreen("setup");
    setEditingId(null);
    window.scrollTo(0, 0);
  };

  // Leaving keeps the autosaved draft exactly as it was (including an open editor).
  const stopEditing = () => {
    clock.current.since = null;
    setIsRunning(false);
    setAutosaveOn(false);
    setConfirmingRehearsalSetup(false);
    setSaveConfirmation("");
  };

  const goHome = () => {
    if (screen === "present") { setPresentExitDestination("home"); return; }
    stopEditing();
    setScreen("concepts");
    window.scrollTo(0, 0);
  };

  const openLibrary = (mode: PresentationMode = presentationMode) => {
    stopEditing();
    setPresentationMode(mode);
    setScreen("presentations");
    window.scrollTo(0, 0);
  };

  const openAccount = (returnScreen: Screen = screen) => {
    setAccountError("");
    setAccountReturnScreen(returnScreen);
    setScreen("account");
    window.scrollTo(0, 0);
  };

  const buildSavedPresentation = (
    id: string,
    ownerEmail: string,
    savedSections: Section[],
  ): SavedPresentation => ({
    id,
    ownerEmail,
    updatedAt: Date.now(),
    title: title.trim(),
    presentationMode,
    sections: savedSections,
    presentationTarget: presentationTarget ?? undefined,
    speakers,
    displayStyle,
    colorMode,
    hapticsEnabled,
    quietMode,
    coachOutline: coachOutline.trim(),
  });

  const showSaveFeedback = (message: string) => {
    setSaveConfirmation(message);
    if (saveFeedbackTimeout.current) window.clearTimeout(saveFeedbackTimeout.current);
    saveFeedbackTimeout.current = window.setTimeout(() => setSaveConfirmation(""), 5000);
  };

  const saveRehearsalHistory = () => {
    if (speechCoach.provider === "qwen" && speechCoach.relayIsMock && speechCoach.segments.length > 0) {
      setHistorySaveError("Simulated speech is not real and cannot be saved as a practice record.");
      return;
    }
    // Incomplete rehearsals must not turn unvisited sections into false
    // "finished early" findings.
    const timedSections = speechTimedSections.filter((_, index) =>
      !rehearsalIncomplete || index <= rehearsalEndIndex);
    const metrics = summarizeSpeech(speechCoach.segments, timedSections, totalElapsed, speechCoach.language);
    const run = createRehearsalRun({
      id: currentRehearsalId,
      presentationId: effectiveHistoryId,
      owner: historyOwnerKey,
      title: title.trim() || "Untitled presentation",
      presentationMode,
      timedSections,
      segments: speechCoach.segments,
      metrics,
      duration: totalElapsed,
      includeTranscript: saveHistoryTranscript,
    });
    const next = upsertHistory(historyRuns, run);
    if (!writeHistory(window.localStorage, next)) {
      setHistorySaveError("Browser storage is unavailable or full. The rehearsal was not saved.");
      return;
    }
    setHistoryRuns(next);
    setSavedHistoryRunId(run.id);
    setHistorySaveError("");
  };
  const deleteHistoryRun = (id: string) => {
    const next = historyRuns.filter((run) => run.id !== id);
    if (writeHistory(window.localStorage, next)) {
      setHistoryRuns(next);
      if (savedHistoryRunId === id) setSavedHistoryRunId(null);
    }
  };
  const clearPresentationHistory = () => {
    const next = historyRuns.filter(
      (run) => !(run.presentationId === effectiveHistoryId && run.owner === historyOwnerKey));
    if (writeHistory(window.localStorage, next)) {
      setHistoryRuns(next);
      setSavedHistoryRunId(null);
    }
  };

  const savePresentation = (signedInAccount = account) => {
    const nextSections = commitOpenEditor();
    if (!nextSections) return;
    if (!signedInAccount) {
      setSaveAfterSignIn(true);
      openAccount(screen);
      return;
    }
    if (!title.trim()) {
      setFormError("Add a presentation title before saving.");
      return;
    }
    // Update the open item (no duplicates) only if it belongs to the current demo profile.
    const existing = savedPresentations.find(
      (presentation) => presentation.id === activeSavedId && presentation.ownerEmail === signedInAccount.email,
    );
    const id = existing?.id ?? aiHistoryId;
    const saved = buildSavedPresentation(id, signedInAccount.email, nextSections);
    setSavedPresentations((current) => [
      saved,
      ...current.filter((presentation) => presentation.id !== id),
    ]);
    setActiveSavedId(id);
    setSavedSignature(setupSignature(saved));
    setFormError("");
    // SCRUM-160: say exactly what was stored (the setup) and what was not (timing results).
    const speakerPart =
      presentationMode === "group" ? `, ${speakers.length} ${speakers.length === 1 ? "speaker" : "speakers"}` : "";
    showSaveFeedback(
      `${existing ? "Setup changes saved" : "Setup saved"}: title, ${pluralSections(nextSections.length)}${speakerPart} and display settings. Timing results are not saved.`,
    );
  };

  const signIn = () => {
    const name = accountName.trim();
    const email = accountEmail.trim().toLowerCase();
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) {
      setAccountError("Enter your name and a valid email address.");
      return;
    }
    const nextAccount = { name, email };
    // Transfer this presentation's explicitly saved guest rehearsal data when
    // the user adopts a local demo profile on the same browser.
    if (!account) {
      const moved = historyRuns.map((run) =>
        run.owner === "guest:local-device" && run.presentationId === effectiveHistoryId
          ? { ...run, owner: email }
          : run);
      if (moved.some((run, index) => run.owner !== historyRuns[index].owner) &&
          writeHistory(window.localStorage, moved)) setHistoryRuns(moved);
    }
    if (autosaveOn && !account) {
      // The guest draft being worked on moves into this profile's slot.
      setAutosaves((current) => {
        const next = { ...current };
        delete next[autosaveSlot("", presentationMode)];
        return next;
      });
    }
    setAccount(nextAccount);
    storageSet("tick-tock-account", JSON.stringify(nextAccount));
    setAccountError("");
    if (saveAfterSignIn) {
      setSaveAfterSignIn(false);
      savePresentation(nextAccount);
      setScreen(accountReturnScreen);
    } else {
      setScreen(accountReturnScreen);
    }
  };

  const signOut = () => {
    stopEditing();
    setAccount(null);
    setActiveSavedId(null);
    setSavedSignature(null);
    storageRemove("tick-tock-account");
    setScreen("concepts");
  };

  const startNewPresentation = (mode: PresentationMode) => {
    setAiHistoryId(makeId());
    setCoachOutline("");
    setPresentationMode(mode);
    setTitle("");
    // SCRUM-149: no placeholder speakers; the Intro section starts Unassigned.
    setSections([{ ...BLANK_INTRO }]);
    setPresentationTarget(null);
    setTargetMinutes("");
    setTargetSeconds("");
    setSpeakers([]);
    setIsAddingSpeaker(false);
    setNewSpeaker("");
    setSpeakerError("");
    setEditingId(null);
    setDraftName("");
    setDraftMinutes("");
    setDraftSeconds("");
    setDraftSpeaker("");
    setDisplayStyle("standard");
    setColorMode("muted");
    setHapticsEnabled(false);
    setQuietMode(false);
    setShowPresentationCustomization(false);
    setActiveSavedId(null);
    setSavedSignature(null);
    setFormError("");
    setSaveConfirmation("");
    nextId.current = 2;
    setAutosaveOn(true);
    setScreen("setup");
    window.scrollTo(0, 0);
  };

  const openSavedPresentation = (
    presentation: SavedPresentation,
    destination: "setup" | "rehearse" | "present" = "setup",
  ) => {
    setAiHistoryId(presentation.id);
    setCoachOutline(presentation.coachOutline ?? "");
    setTitle(presentation.title);
    setPresentationMode(presentation.presentationMode);
    setSections(presentation.sections);
    setPresentationTarget(presentation.presentationTarget ?? null);
    setTargetMinutes(presentation.presentationTarget ? String(Math.floor(presentation.presentationTarget / 60)) : "");
    setTargetSeconds(presentation.presentationTarget ? String(presentation.presentationTarget % 60).padStart(2,"0") : "");
    setSpeakers(presentation.speakers);
    // Restore the display/color settings that were saved with this presentation.
    setDisplayStyle(presentation.displayStyle);
    setColorMode(presentation.colorMode);
    setHapticsEnabled(presentation.hapticsEnabled);
    setQuietMode(Boolean(presentation.quietMode));
    setActiveSavedId(presentation.id);
    setSavedSignature(setupSignature(presentation));
    setIsAddingSpeaker(false);
    setNewSpeaker("");
    setEditingId(null);
    setShowPresentationCustomization(false);
    setFormError("");
    setSaveConfirmation("");
    nextId.current = Math.max(0, ...presentation.sections.map((section) => section.id)) + 1;
    setAutosaveOn(true);
    if (destination === "rehearse") {
      startRehearsal();
    } else {
      setScreen(destination === "present" ? "presentation-ready" : "setup");
    }
    window.scrollTo(0, 0);
  };

  const deleteSavedPresentation = (id: string) => {
    setSavedPresentations((current) => current.filter((presentation) => presentation.id !== id));
    // Unsaved edits to the deleted copy stay recoverable as a plain draft.
    setAutosaves((current) => {
      const next = { ...current };
      Object.keys(next).forEach((key) => {
        if (next[key].savedPresentationId === id) next[key] = { ...next[key], savedPresentationId: null };
      });
      return next;
    });
    if (activeSavedId === id) {
      setActiveSavedId(null);
      setSavedSignature(null);
    }
  };

  // ----- Autosave slot (one per mode, per profile) -----
  const ownerEmail = account?.email ?? "";
  const continueDraftFor = (mode: PresentationMode): AutosaveDraft | null => {
    const draft = autosaves[autosaveSlot(ownerEmail, mode)];
    if (!draft) return null;
    if (draft.savedPresentationId) {
      const saved = savedPresentations.find((item) => item.id === draft.savedPresentationId);
      if (!saved) return draft;
      const dirty = setupSignature(draft) !== setupSignature(saved);
      const editorOpen = draft.editor.editingId !== null || draft.editor.newSpeaker.trim() !== "";
      return dirty || editorOpen ? draft : null;
    }
    return isMeaningfulDraft(draft) ? draft : null;
  };

  const continueDraft = (mode: PresentationMode) => {
    const draft = autosaves[autosaveSlot(ownerEmail, mode)];
    if (!draft) return;
    const saved = draft.savedPresentationId
      ? savedPresentations.find((item) => item.id === draft.savedPresentationId)
      : undefined;
    setAiHistoryId(saved?.id ?? draft.aiHistoryId ?? makeId());
    setCoachOutline(draft.coachOutline ?? saved?.coachOutline ?? "");
    setPresentationMode(draft.presentationMode);
    setTitle(draft.title);
    setSections(draft.sections);
    setPresentationTarget(draft.presentationTarget ?? null);
    setTargetMinutes(draft.presentationTarget ? String(Math.floor(draft.presentationTarget / 60)) : "");
    setTargetSeconds(draft.presentationTarget ? String(draft.presentationTarget % 60).padStart(2,"0") : "");
    setSpeakers(draft.speakers);
    setDisplayStyle(draft.displayStyle);
    setColorMode(draft.colorMode);
    setHapticsEnabled(draft.hapticsEnabled);
    setQuietMode(Boolean(draft.quietMode));
    setActiveSavedId(saved ? saved.id : null);
    setSavedSignature(saved ? setupSignature(saved) : null);
    setEditingId(draft.editor.editingId);
    setDraftName(draft.editor.name);
    setDraftMinutes(draft.editor.minutes);
    setDraftSeconds(draft.editor.seconds);
    setDraftSpeaker(draft.editor.speaker);
    setIsAddingSpeaker(draft.editor.addingSpeaker);
    setNewSpeaker(draft.editor.newSpeaker);
    setSpeakerError("");
    setShowPresentationCustomization(false);
    setFormError("");
    setSaveConfirmation("");
    nextId.current = Math.max(1, ...draft.sections.map((section) => section.id)) + 1;
    setAutosaveOn(true);
    setScreen("setup");
    window.scrollTo(0, 0);
  };

  const requestStartNew = (mode: PresentationMode) => {
    if (continueDraftFor(mode)) {
      setPendingConfirm({ kind: "replace-new", mode });
      return;
    }
    startNewPresentation(mode);
  };

  const requestOpenSaved = (
    presentation: SavedPresentation,
    destination: "setup" | "rehearse" | "present" = "setup",
  ) => {
    const draft = continueDraftFor(presentation.presentationMode);
    if (draft && draft.savedPresentationId !== presentation.id) {
      setPendingConfirm({ kind: "replace-open", presentation, destination });
      return;
    }
    openSavedPresentation(presentation, destination);
  };

  const discardDraft = (mode: PresentationMode) => {
    setAutosaves((current) => {
      const next = { ...current };
      delete next[autosaveSlot(ownerEmail, mode)];
      return next;
    });
  };

  const confirmPending = () => {
    const pending = pendingConfirm;
    setPendingConfirm(null);
    if (!pending) return;
    if (pending.kind === "delete") deleteSavedPresentation(pending.presentation.id);
    if (pending.kind === "replace-new") startNewPresentation(pending.mode);
    if (pending.kind === "replace-open") openSavedPresentation(pending.presentation, pending.destination);
    if (pending.kind === "discard") discardDraft(pending.mode);
  };

  const pendingDraft =
    pendingConfirm && pendingConfirm.kind !== "delete"
      ? autosaves[
          autosaveSlot(
            ownerEmail,
            pendingConfirm.kind === "replace-open" ? pendingConfirm.presentation.presentationMode : pendingConfirm.mode,
          )
        ]
      : undefined;
  const pendingDraftName = pendingDraft ? pendingDraft.title.trim() || "Untitled presentation" : undefined;
  const confirmDialog = pendingConfirm && (
    pendingConfirm.kind === "delete" ? (
      <ConfirmDialog
        body="Only this saved presentation is removed from this browser. Your other presentations stay. This can’t be undone."
        cancelLabel="Keep it"
        confirmLabel="Delete"
        danger
        name={pendingConfirm.presentation.title}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={confirmPending}
        title="Delete this presentation?"
      />
    ) : pendingConfirm.kind === "discard" ? (
      <ConfirmDialog
        body="Your autosaved draft will be cleared from this device. Saved presentations are not affected."
        cancelLabel="Keep draft"
        confirmLabel="Discard"
        danger
        name={pendingDraftName}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={confirmPending}
        title="Discard this draft?"
      />
    ) : (
      <ConfirmDialog
        body={
          pendingConfirm.kind === "replace-new"
            ? "Each mode keeps one autosaved draft. Starting a new presentation replaces the draft below."
            : "Each mode keeps one autosaved draft. Opening another presentation replaces the unsaved draft below."
        }
        cancelLabel="Keep my draft"
        confirmLabel={pendingConfirm.kind === "replace-new" ? "Start new" : "Open anyway"}
        name={pendingDraftName}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={confirmPending}
        title="Replace your autosaved draft?"
      />
    )
  );

  const userPresentations = account
    ? savedPresentations
        .filter((presentation) => presentation.ownerEmail === account.email)
        .sort((a, b) => b.updatedAt - a.updatedAt)
    : [];

  const startAddSpeaker = () => {
    setNewSpeaker("");
    setSpeakerError("");
    setIsAddingSpeaker(true);
  };

  const cancelAddSpeaker = () => {
    setNewSpeaker("");
    setSpeakerError("");
    setIsAddingSpeaker(false);
  };

  const addSpeaker = () => {
    const name = newSpeaker.trim();
    if (!name) {
      setSpeakerError("Type a speaker name, or cancel.");
      return;
    }
    if (speakers.some((speaker) => speaker.toLowerCase() === name.toLowerCase())) {
      setSpeakerError(`${name} is already on the list.`);
      return;
    }
    setSpeakers((current) => [...current, name]);
    cancelAddSpeaker();
  };

  const saveSpeakerRename = () => {
    if (!renamingSpeaker) return;
    const name = renameValue.trim();
    if (!name || speakers.some((speaker) => speaker !== renamingSpeaker && speaker.toLowerCase() === name.toLowerCase())) {
      setSpeakerError("Enter a unique speaker name."); return;
    }
    setSpeakers((current) => current.map((speaker) => speaker === renamingSpeaker ? name : speaker));
    setSections((current) => current.map((section) => section.speaker === renamingSpeaker ? { ...section, speaker: name } : section));
    if (draftSpeaker === renamingSpeaker) setDraftSpeaker(name);
    setRenamingSpeaker(null); setRenameValue(""); setSpeakerError("");
  };

  const removeSpeaker = (name: string) => {
    setSpeakers((current) => current.filter((speaker) => speaker !== name));
    // Keep assignments consistent: that speaker's sections become Unassigned.
    setSections((current) =>
      current.map((section) => (section.speaker === name ? { ...section, speaker: undefined } : section)),
    );
    if (draftSpeaker === name) setDraftSpeaker("");
  };

  // ----- Shared pieces rendered on several screens -----
  const saveButtonLabel = !account || !activeSavedId ? "Save setup" : hasUnsavedChanges ? "Save changes" : "Setup saved";
  const saveDisabled = Boolean(account && activeSavedId && !hasUnsavedChanges);
  const saveStatusText = !account
    ? "Save setup keeps the title, sections, speakers and display settings, not timing results. Sign in to use it; your draft is autosaved on this device."
    : !activeSavedId
      ? "Save setup keeps the title, sections, speakers and display settings. Timing results are not saved."
      : hasUnsavedChanges
        ? "This setup has unsaved changes."
        : `Setup saved ${activeSaved ? formatUpdated(activeSaved.updatedAt) : ""} in this browser. Timing results are not saved.`;

  const autosaveStatus = !autosaveOn
    ? ""
    : !account
      ? "Draft autosaved on this device"
      : !activeSavedId
        ? "Draft autosaved · press Save setup to add it to your list"
        : hasUnsavedChanges
          ? "Unsaved changes · draft autosaved"
          : "All changes saved";

  const saveFeedback = saveConfirmation && (
    <div aria-live="polite" className="save-confirmation" role="status">
      <Icon name="check" size={17} />{saveConfirmation}
    </div>
  );

  const coachDock = (mode: "Rehearse" | "Present") => (
    <CoachDock
      mode={mode}
      available={speechCoach.available}
      enabled={speechCoach.enabled}
      listening={speechCoach.listening}
      error={speechCoach.error}
      interim={speechCoach.interim}
      transcript={speechCoach.transcript}
      words={speechMetrics.words}
      wpm={speechMetrics.wpm}
      cue={coachCue}
      language={speechCoach.language}
      languageLocked={speechCoach.segments.length > 0}
      onLanguageChange={speechCoach.setLanguage}
      provider={speechCoach.provider}
      onProviderChange={speechCoach.setProvider}
      relayConfigured={speechCoach.relayConfigured}
      relayIsMock={speechCoach.relayIsMock}
      relayCode={speechCoach.relayCode}
      onRelayCodeChange={speechCoach.setRelayCode}
      unitLabel={speechMetrics.unitLabel}
      rateLabel={speechMetrics.rateLabel}
      onToggle={speechCoach.setEnabled}
      live={liveFeedback}
    />
  );

  const savePanel = (
    <>
      <div className="presentation-save-panel">
        <span>
          <strong>Presentation setup</strong>
          <small>{saveStatusText}</small>
        </span>
        <Button
          disabled={saveDisabled}
          icon={saveDisabled ? "check" : "save"}
          onClick={() => savePresentation()}
          variant="secondary"
        >
          {saveButtonLabel}
        </Button>
      </div>
      {saveFeedback}
    </>
  );

  const currentDisplayStyle = DISPLAY_STYLES.find((style) => style.id === displayStyle) ?? DISPLAY_STYLES[1];
  const renderSpeakerAllocation = () => (
    <section aria-label="Target time per speaker" className="speaker-allocation">
      <div className="speaker-allocation__heading">
        <h2>Time per speaker</h2>
        <span>Target</span>
      </div>
      {speakerTotals.length === 0 ? (
        <p className="speaker-allocation__empty">No speakers added.</p>
      ) : (
        speakerTotals.map((row) => (
          <div
            className={`speaker-allocation__row ${row.unassigned ? "speaker-allocation__row--unassigned" : ""}`}
            key={row.key}
          >
            <span>
              <strong>{row.label}</strong>
              <small>{row.count ? pluralSections(row.count) : "No sections yet"}</small>
            </span>
            <time>{formatTime(row.target)}</time>
          </div>
        ))
      )}
      {unassignedCount > 0 && (
        <p className="unassigned-note">
          <Icon name="warning" size={16} />
          {pluralSections(unassignedCount)} {unassignedCount === 1 ? "has" : "have"} no speaker. You can still start.
        </p>
      )}
    </section>
  );

  if (screen === "account") {
    return (
      <main className="app-shell account-screen">
        <header className="app-header">
          <Brand onClick={goHome} />
          <Button
            className="home-button"
            icon="arrow-left"
            onClick={() => setScreen(accountReturnScreen)}
            variant="ghost"
          >
            Back
          </Button>
        </header>
        <section className="page-content account-content">
          {account ? (
            <>
              <span className="account-avatar"><Icon name="user" size={30} /></span>
              <span className="eyebrow">Your account</span>
              <h1>{account.name}</h1>
              <p className="lede account-email">{account.email}</p>
              <div className="account-stats">
                <strong>{userPresentations.length}</strong>
                <span>{userPresentations.length === 1 ? "saved presentation" : "saved presentations"}</span>
              </div>
              <Button className="button--full" icon="home" onClick={goHome}>
                View my presentations
              </Button>
              <Button className="button--full" onClick={signOut} variant="secondary">
                Sign out
              </Button>
              <p className="account-device-note">Demo profile only: saved in this browser on this device. No password, not secure, and not synced to other devices.</p>
            </>
          ) : (
            <>
              <span className="eyebrow">Local demo profile</span>
              <h1>Save every presentation.</h1>
              <p className="lede">
                Sign in to keep multiple presentations and return to every section, speaker, and display setting.
              </p>
              <div className="account-benefits">
                <div><Icon name="save" /><span><strong>Keep your setup</strong><small>Sections, speakers, timing, and display preferences</small></span></div>
                <div><Icon name="clock" /><span><strong>Pick up anytime</strong><small>Your presentation library stays ready on this device</small></span></div>
              </div>
              <div className="account-form">
                <label className="field">
                  <span className="field__label">Name</span>
                  <input
                    autoComplete="name"
                    onChange={(event) => setAccountName(event.target.value)}
                    placeholder="Your name"
                    value={accountName}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Email</span>
                  <input
                    autoComplete="email"
                    inputMode="email"
                    onChange={(event) => setAccountEmail(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") signIn();
                    }}
                    placeholder="you@example.com"
                    value={accountEmail}
                  />
                </label>
                {accountError && <div className="form-error"><Icon name="warning" size={18} />{accountError}</div>}
                <Button className="button--full" onClick={signIn}>Continue with email</Button>
              </div>
              <button
                className="guest-link"
                onClick={() => {
                  setSaveAfterSignIn(false);
                  setScreen(accountReturnScreen);
                }}
                type="button"
              >
                Continue as guest
              </button>
              <p className="account-device-note">No account is required to rehearse or present. Demo profile only: saved in this browser on this device. No password, not secure, and not synced to other devices.</p>
            </>
          )}
        </section>
      </main>
    );
  }

  if (screen === "concepts") {
    return (
      <main className="concept-gallery">
        <header className="gallery-header">
          <Brand onClick={goHome} />
          <Button
            className={`account-button ${account ? "account-button--signed-in" : ""}`}
            icon="user"
            onClick={() => openAccount("concepts")}
            variant="ghost"
          >
            {account ? account.name.split(" ")[0] : "Sign in"}
          </Button>
        </header>
        <section className="gallery-content">
          <div className="gallery-intro">
            <span className="eyebrow">{account ? `Welcome back, ${account.name.split(" ")[0]}` : "Guest mode"}</span>
            <h1>{account ? "Your presentations" : "Start a presentation"}</h1>
            <p>
              {account
                ? "Time your presentation sections, not your slides. Choose a mode to continue a draft, open a saved setup, or start something new."
                : "Tick-Tock times presentation sections while you rehearse or present; it is not a slide editor. Work as a guest, with one autosaved draft per mode on this device."}
            </p>
          </div>
          {!account && (
            <button className="save-callout" onClick={() => openAccount("concepts")} type="button">
              <span className="save-callout__icon"><Icon name="save" /></span>
              <span><strong>Want to keep more than one?</strong><small>Sign in to save presentations to a list.</small></span>
              <Icon name="chevron-right" />
            </button>
          )}
          <div className="new-presentation-heading">
            <h2>Choose a setup</h2>
          </div>
          <div className="concept-grid">
            {MODES.map((mode) => {
              const draft = continueDraftFor(mode.id);
              return (
                <button
                  className={`concept-card concept-card--${mode.id}`}
                  key={mode.id}
                  onClick={() => openLibrary(mode.id)}
                  type="button"
                >
                  <span className="mode-icon">
                    <Icon name={mode.id === "individual" ? "user" : "users"} size={22} />
                  </span>
                  <span className="concept-card__copy">
                    <strong>{mode.name}</strong>
                    <small>{mode.description}</small>
                    {draft && (
                      <span className="concept-card__draft">
                        <Icon name="edit" size={13} /> Draft: {draft.title.trim() || "Untitled presentation"}
                      </span>
                    )}
                  </span>
                  <Icon name="chevron-right" />
                </button>
              );
            })}
          </div>
        </section>
      </main>
    );
  }

  if (screen === "presentations") {
    const mode = presentationMode;
    const draft = continueDraftFor(mode);
    const modeSaved = userPresentations.filter((presentation) => presentation.presentationMode === mode);
    const draftTotal = draft ? draft.sections.reduce((total, section) => total + section.target, 0) : 0;
    return (
      <main className={`app-shell presentations-screen mode--${mode}`}>
        <AppHeader account={account} onAccount={() => openAccount("presentations")} onHome={goHome} />
        <div className="direction-strip">
          <button onClick={goHome} type="button">
            <Icon name="arrow-left" size={17} /> Change mode
          </button>
          <span>{mode} presentation</span>
        </div>
        <section className="page-content">
          <span className="eyebrow">{mode === "group" ? "Group" : "Individual"} mode</span>
          <h1>My presentations</h1>
          <p className="lede">Pick up where you left off, or start something new.</p>
          {storageError && (
            <p className="form-error" role="alert"><Icon name="warning" size={18} />{storageError}</p>
          )}

          {draft && (
            <section aria-label="Continue where you left off" className="library-section library-section--continue">
              <div className="section-heading">
                <h2>Continue where you left off</h2>
              </div>
              <article className="saved-presentation library-card library-card--draft">
                <button
                  aria-label={`Continue ${draft.title.trim() || "Untitled presentation"}`}
                  onClick={() => continueDraft(mode)}
                  type="button"
                >
                  <span className={`saved-presentation__icon saved-presentation__icon--${mode}`}>
                    <Icon name={mode === "group" ? "users" : "user"} />
                  </span>
                  <span className="saved-presentation__copy">
                    <span className="presentation-status presentation-status--draft">
                      {draft.savedPresentationId ? "Unsaved changes" : "Autosaved draft"}
                    </span>
                    <strong>{draft.title.trim() || "Untitled presentation"}</strong>
                    <small>
                      {pluralSections(draft.sections.length)} · {formatTime(draftTotal)} target
                      {mode === "group" && ` · ${draft.speakers.length} ${draft.speakers.length === 1 ? "speaker" : "speakers"}`}
                    </small>
                    <time dateTime={new Date(draft.updatedAt).toISOString()}>
                      Autosaved {formatUpdated(draft.updatedAt)}
                    </time>
                    {draft.savedPresentationId && <small>Your saved copy is unchanged until you press Save setup.</small>}
                    <span className="presentation-card-action">
                      Continue <Icon name="chevron-right" size={15} />
                    </span>
                  </span>
                </button>
              </article>
              <button
                className="text-button discard-draft"
                onClick={() => setPendingConfirm({ kind: "discard", mode })}
                type="button"
              >
                Discard draft
              </button>
            </section>
          )}

          <Button
            className="button--full create-presentation-button"
            icon="plus"
            onClick={() => requestStartNew(mode)}
            variant={draft ? "secondary" : "primary"}
          >
            Start new presentation
          </Button>
          <p className="library-device-note">
            {account ? `${account.name}'s local demo profile` : "Guest"} · One autosaved draft per mode. Kept in this
            browser on this device only; not secure and not synced.
          </p>

          {account ? (
            <section aria-label="Saved presentations" className="library-section">
              <div className="section-heading">
                <h2>Saved presentations</h2>
                <span className="library-count">{modeSaved.length}</span>
              </div>
              {modeSaved.length === 0 ? (
                <p className="presentation-library__empty">
                  No saved {mode} presentations yet. Press Save setup to keep one here.
                </p>
              ) : (
                <div className="presentation-library">
                  {modeSaved.map((presentation) => (
                    <article className="saved-presentation saved-presentation--card" key={presentation.id}>
                      <div className="saved-presentation__main">
                        <span className={`saved-presentation__icon saved-presentation__icon--${presentation.presentationMode}`}>
                          <Icon name={presentation.presentationMode === "group" ? "users" : "user"} />
                        </span>
                        <span className="saved-presentation__copy">
                          <strong>{presentation.title}</strong>
                          <small>
                            {presentation.presentationMode === "group" ? "Group" : "Individual"} · {pluralSections(presentation.sections.length)} · {formatTime(presentation.sections.reduce((total, section) => total + section.target, 0))}
                          </small>
                          <time dateTime={new Date(presentation.updatedAt).toISOString()}>
                            Updated {formatUpdated(presentation.updatedAt)}
                          </time>
                        </span>
                        <Button
                          ariaLabel={`Delete ${presentation.title}`}
                          className="saved-presentation__delete"
                          icon="trash"
                          onClick={() => setPendingConfirm({ kind: "delete", presentation })}
                          variant="ghost"
                        />
                      </div>
                      <div className="saved-presentation__actions">
                        <Button ariaLabel={`Open and edit ${presentation.title}`} icon="edit" onClick={() => requestOpenSaved(presentation)} variant="secondary">
                          Open
                        </Button>
                        <Button ariaLabel={`Rehearse ${presentation.title}`} icon="play" onClick={() => requestOpenSaved(presentation, "rehearse")} variant="secondary">
                          Rehearse
                        </Button>
                        <Button ariaLabel={`Present ${presentation.title}`} icon="clock" onClick={() => requestOpenSaved(presentation, "present")} variant="secondary">
                          Present
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <button className="save-callout library-sign-in" onClick={() => openAccount("presentations")} type="button">
              <span className="save-callout__icon"><Icon name="save" /></span>
              <span><strong>Want to keep more than one?</strong><small>Sign in with a demo profile to save presentations to a list.</small></span>
              <Icon name="chevron-right" />
            </button>
          )}
        </section>
        {confirmDialog}
      </main>
    );
  }

  if (screen === "setup") {
    const isEditingExisting = editingId !== null && editingId !== 0;
    const editingSection = sections.find((section) => section.id === editingId);
    const previewMinutes = draftMinutes === "" ? 0 : Number(draftMinutes);
    const previewSeconds = draftSeconds === "" ? 0 : Number(draftSeconds);
    const previewTarget = previewMinutes * 60 + previewSeconds;
    const sectionEditor = editingId !== null && (
      <div
        aria-label={isEditingExisting ? "Edit section" : "Add a section"}
        className={`editor-card ${isEditingExisting ? "editor-card--edit" : "editor-card--add"}`}
        role="group"
      >
        <div className="editor-card__top">
          <div>
            <span className="editor-card__badge">
              <Icon name={isEditingExisting ? "edit" : "plus"} size={14} />
              {isEditingExisting ? "Editing" : "New section"}
            </span>
            <h3>{isEditingExisting ? `Edit “${editingSection?.name ?? ""}”` : "Add a section"}</h3>
          </div>
          <button className="text-button" onClick={closeEditor} type="button">Cancel</button>
        </div>
        <div className="editor-fields">
          <label className="field">
            <span className="field__label">Section name <RequiredMark /></span>
            <input
              aria-required="true"
              autoFocus
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="e.g. Team intro"
              value={draftName}
            />
          </label>
          <fieldset className="field time-field">
            <legend className="field__label">Target time (mm:ss) <RequiredMark /></legend>
            <div className="time-field__inputs">
              <label className="time-field__unit">
                <input
                  aria-label="Target minutes"
                  aria-required="true"
                  inputMode="numeric"
                  maxLength={2}
                  // Leaving minutes empty shows a real 0 (empty already means 0 minutes).
                  onBlur={() => {
                    if (draftMinutes === "") setDraftMinutes("0");
                  }}
                  onChange={(event) => setDraftMinutes(digitsOnly(event.target.value))}
                  onFocus={(event) => event.target.select()}
                  placeholder="mm"
                  value={draftMinutes}
                />
                <span>minutes</span>
              </label>
              <span aria-hidden="true" className="time-field__colon">:</span>
              <label className="time-field__unit">
                <input
                  aria-label="Target seconds"
                  inputMode="numeric"
                  maxLength={2}
                  onBlur={() => {
                    if (draftSeconds.length < 2) setDraftSeconds(draftSeconds.padStart(2, "0"));
                  }}
                  onChange={(event) => setDraftSeconds(digitsOnly(event.target.value))}
                  onFocus={(event) => event.target.select()}
                  placeholder="ss"
                  value={draftSeconds}
                />
                <span>seconds</span>
              </label>
            </div>
            {editingId === 0 && presentationTarget !== null && remainingAllocation > 0 && (
              <button type="button" className="text-button autofill-button" onClick={() => { setDraftMinutes(String(Math.floor(remainingAllocation / 60))); setDraftSeconds(String(remainingAllocation % 60).padStart(2,"0")); }}>
                Use remaining {formatTime(remainingAllocation)}
              </button>
            )}
            <span className="field__hint" aria-live="polite">
              {previewTarget > 0 && previewSeconds <= 59
                ? `Target: ${formatDuration(previewTarget)}`
                : "Example: 1 minute 30 seconds. Leave seconds empty for whole minutes."}
            </span>
          </fieldset>
          {presentationMode === "group" && (
            <label className="field field--speaker">
              <span className="field__label">Speaker</span>
              <span className="speaker-select">
                <select onChange={(event) => setDraftSpeaker(event.target.value)} value={draftSpeaker}>
                  <option value="">{UNASSIGNED_LABEL}</option>
                  {speakers.map((speaker) => <option key={speaker} value={speaker}>{speaker}</option>)}
                </select>
                <Icon name="chevron-down" size={22} />
              </span>
              {speakers.length === 0 && (
                <span className="field__hint">Add speakers above to assign this section. It can stay Unassigned.</span>
              )}
            </label>
          )}
        </div>
        {formError && <div className="form-error" role="alert"><Icon name="warning" size={18} />{formError}</div>}
        <Button className="button--full" icon={isEditingExisting ? "check" : "plus"} onClick={saveSection}>
          {isEditingExisting ? "Save changes" : "Add section"}
        </Button>
      </div>
    );
    return (
      <main className={`app-shell mode--${presentationMode}`}>
        <AppHeader account={account} onAccount={() => openAccount("setup")} onHome={goHome} />
        <div className="direction-strip">
          <button onClick={() => openLibrary(presentationMode)} type="button">
            <Icon name="arrow-left" size={17} /> My presentations
          </button>
          <span>{presentationMode} presentation</span>
        </div>
        <section className="page-content">
          {storageError && (
            <p className="form-error" role="alert"><Icon name="warning" size={18} />{storageError}</p>
          )}
          <div className="setup-heading">
            <div>
              <span className="eyebrow">{account ? (activeSavedId ? "Saved presentation" : "New presentation") : "Guest presentation"}</span>
              <h1>{presentationMode === "group" ? "Group setup" : "Presentation setup"}</h1>
            </div>
            <Button
              disabled={saveDisabled}
              icon={saveDisabled ? "check" : "save"}
              onClick={() => savePresentation()}
              variant="secondary"
            >
              {saveButtonLabel}
            </Button>
          </div>
          {autosaveStatus && !saveConfirmation && (
            <p
              aria-live="polite"
              className={`autosave-status ${account && activeSavedId && hasUnsavedChanges ? "autosave-status--dirty" : ""}`}
            >
              <Icon name={account && activeSavedId && !hasUnsavedChanges ? "check" : "save"} size={15} />
              {autosaveStatus}
            </p>
          )}
          {saveFeedback}
          <p className="required-legend"><RequiredMark /> Required</p>

          <label className="field">
            <span className="field__label">Presentation title <RequiredMark /></span>
            <input
              aria-required="true"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Final pitch"
              value={title}
            />
          </label>

          <div className="presentation-target-field">
            <h2>Overall presentation target</h2>
            <p className="field__hint">Optional. Set an independent goal for the whole presentation. Leave blank to use the sum of sections.</p>
            <div className="time-field__inputs">
              <label className="time-field__unit"><input aria-label="Overall target minutes" inputMode="numeric" placeholder="mm" value={targetMinutes} onChange={(e) => { const v=digitsOnly(e.target.value).slice(0,3); setTargetMinutes(v); const seconds=Number(targetSeconds || 0); setPresentationTarget(Number(v)*60+seconds || null); }}/><span>minutes</span></label>
              <span className="time-field__colon">:</span>
              <label className="time-field__unit"><input aria-label="Overall target seconds" inputMode="numeric" placeholder="ss" value={targetSeconds} onChange={(e) => { const v=digitsOnly(e.target.value).slice(0,2); if(Number(v)>59) return; setTargetSeconds(v); setPresentationTarget(Number(targetMinutes || 0)*60+Number(v) || null); }}/><span>seconds</span></label>
            </div>
            <p className="field__hint">Section allocation: {formatTime(sectionsTarget)} · {remainingAllocation >= 0 ? `${formatTime(remainingAllocation)} still available` : `${formatTime(-remainingAllocation)} over your goal`}</p>
          </div>
          {presentationMode === "group" && (
            <div className="team-panel">
              <div className="team-panel__heading">
                <div>
                  <h2>Speakers</h2>
                  <p>Add each person who will present.</p>
                </div>
                <span>{speakers.length} {speakers.length === 1 ? "speaker" : "speakers"}</span>
              </div>
              {speakers.length === 0 && !isAddingSpeaker && (
                <p className="speaker-empty">No speakers yet. Tap Add speaker to add your first presenter.</p>
              )}
              {speakers.length > 0 && (
                <ul aria-label="Speakers" className="speaker-list">
                  {speakerTotals.filter((row) => !row.unassigned).map((row) => (
                    <li className="speaker-row" key={row.key}>
                      <span className="speaker-row__name">
                        <Icon name="user" size={16} />
                        <span>
                          <strong>{row.label}</strong>
                          <small>
                            {row.count ? `${formatTime(row.target)} target · ${pluralSections(row.count)}` : "No sections yet"}
                          </small>
                        </span>
                      </span>
                      <button aria-label={`Rename ${row.label}`} className="speaker-row__remove" onClick={() => { setRenamingSpeaker(row.label); setRenameValue(row.label); setSpeakerError(""); }} type="button"><Icon name="edit" size={18}/></button>
                      <button
                        aria-label={`Remove ${row.label}`}
                        className="speaker-row__remove"
                        onClick={() => removeSpeaker(row.label)}
                        type="button"
                      >
                        <Icon name="trash" size={18} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {renamingSpeaker && (
                <div className="add-speaker speaker-rename">
                  <label className="field"><span className="field__label">Rename {renamingSpeaker}</span>
                    <input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if(event.key === "Enter") saveSpeakerRename(); if(event.key === "Escape") setRenamingSpeaker(null); }}/>
                  </label>
                  <Button onClick={saveSpeakerRename}>Save name</Button>
                  <Button variant="secondary" onClick={() => setRenamingSpeaker(null)}>Cancel</Button>
                  {speakerError && <p role="alert" className="form-error">{speakerError}</p>}
                </div>
              )}
              {isAddingSpeaker ? (
                <div className="add-speaker">
                  <input
                    aria-label="New speaker name"
                    autoFocus
                    onChange={(event) => {
                      setNewSpeaker(event.target.value);
                      setSpeakerError("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") addSpeaker();
                      if (event.key === "Escape") cancelAddSpeaker();
                    }}
                    placeholder="Speaker name"
                    value={newSpeaker}
                  />
                  <div className="add-speaker__actions">
                    <Button icon="check" onClick={addSpeaker}>Save speaker</Button>
                    <button className="text-button" onClick={cancelAddSpeaker} type="button">Cancel</button>
                  </div>
                  {speakerError && (
                    <div className="form-error" role="alert"><Icon name="warning" size={18} />{speakerError}</div>
                  )}
                </div>
              ) : (
                <Button className="button--full add-speaker-button" icon="plus" onClick={startAddSpeaker} variant="secondary">
                  Add speaker
                </Button>
              )}
              {unassignedCount > 0 && (
                <p className="unassigned-note">
                  <Icon name="warning" size={16} />
                  {pluralSections(unassignedCount)} unassigned ({formatTime(speakerTotals.find((row) => row.unassigned)?.target ?? 0)}). Edit a section to pick a speaker.
                </p>
              )}
            </div>
          )}

          <div className="section-heading">
            <h2>Sections</h2>
            <div className="total-time">
              <span>Sections (min:sec)</span>
              <strong>{formatTime(sectionsTarget)}</strong>
            </div>
          </div>

          <div className="section-list">
            {sections.map((section, index) => (
              <Fragment key={section.id}>
              <article
                className={`section-card ${draggingId === section.id ? "section-card--dragging" : ""} ${editingId === section.id ? "section-card--editing" : ""}`}
                data-section-id={section.id}
              >
                <div className="section-card__order">
                  <button
                    aria-describedby="drag-instructions"
                    aria-label={`Reorder ${section.name}, position ${index + 1} of ${sections.length}`}
                    aria-pressed={draggingId === section.id}
                    className="drag-handle"
                    onKeyDown={(event) => handleDragKeyDown(event, section)}
                    onPointerCancel={() => setDraggingId(null)}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setDraggingId(section.id);
                      setDragAnnouncement(`${section.name} picked up.`);
                    }}
                    onPointerMove={handleDragMove}
                    onPointerUp={(event) => {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                      setDraggingId(null);
                      setDragAnnouncement(`${section.name} dropped at position ${index + 1}.`);
                    }}
                    type="button"
                  >
                    <Icon name="grip" size={24} />
                  </button>
                </div>
                <div className="section-card__body">
                  <strong>{section.name}</strong>
                  <span>
                    {presentationMode === "group" && (
                      <><b className={section.speaker ? "" : "unassigned-tag"}>{speakerLabel(section.speaker)}</b> · </>
                    )}
                    {formatDuration(section.target)} target
                  </span>
                </div>
                <div className="section-card__actions">
                  <Button
                    ariaLabel={`Edit ${section.name}`}
                    icon="edit"
                    onClick={() => openEditor(section)}
                    variant="ghost"
                  />
                  <Button
                    ariaLabel={`Delete ${section.name}`}
                    icon="trash"
                    onClick={() => deleteSection(section.id)}
                    variant="ghost"
                  />
                </div>
              </article>
              {editingId === section.id && sectionEditor}
              </Fragment>
            ))}
          </div>
          <span className="sr-only" id="drag-instructions">
            Drag to reorder. Keyboard users can press Space, then use the up and down arrow keys,
            and press Space again to drop.
          </span>
          <span aria-live="polite" className="sr-only">{dragAnnouncement}</span>

          {editingId === 0 && sectionEditor}

          {editingId === null && (
            <Button className="add-button" icon="plus" onClick={() => openEditor()} variant="secondary">
              Add section
            </Button>
          )}

          {formError && editingId === null && (
            <div className="form-error form-error--standalone">
              <Icon name="warning" size={18} />{formError}
            </div>
          )}
        </section>
        <div className="sticky-action">
          <Button className="button--full" onClick={continueToReady}>
            Review presentation <Icon name="chevron-right" />
          </Button>
        </div>
      </main>
    );
  }

  if (screen === "ready") {
    return (
      <main className={`app-shell ready-screen mode--${presentationMode}`}>
        <AppHeader account={account} onAccount={() => openAccount("ready")} onHome={goHome} />
        <section className="page-content">
          <div className="ready-navigation">
            <button className="back-link" onClick={() => openLibrary(presentationMode)} type="button">
              <Icon name="arrow-left" /> My presentations
            </button>
            <button className="back-link" onClick={resetToSetup} type="button">
              <Icon name="edit" /> Edit setup
            </button>
          </div>
          <div className="ready-hero">
            <h1>Ready?</h1>
            <p>{title}</p>
          </div>
          <div className="ready-summary">
            <div>
              <span>Total target</span>
              <strong>{formatTime(totalTarget)}</strong>
            </div>
            <div>
              <span>{presentationMode === "group" ? "Speakers" : "Sections"}</span>
              <strong>{presentationMode === "group" ? speakers.length : sections.length}</strong>
            </div>
          </div>
          <div className="timeline">
            {sections.map((section, index) => (
              <div className="timeline-block" key={section.id}>
                <li>
                  <span className="timeline__number">{index + 1}</span>
                  <span className="timeline__content">
                    <strong>{section.name}</strong>
                    {presentationMode === "group" && (
                      <small className={section.speaker ? "" : "unassigned-tag"}>{speakerLabel(section.speaker)}</small>
                    )}
                  </span>
                  <time>{formatTime(section.target)}</time>
                </li>
                {presentationMode === "group" &&
                  index < sections.length - 1 &&
                  section.speaker !== sections[index + 1].speaker && (
                    <div className="transition-indicator">
                      <Icon name="chevron-right" size={15} />
                      {sections[index + 1].speaker
                        ? `Handoff to ${sections[index + 1].speaker}`
                        : "Next section is unassigned"}
                    </div>
                  )}
              </div>
            ))}
          </div>
          {presentationMode === "group" && renderSpeakerAllocation()}
          {savePanel}
          <details className="speech-coach-notes">
            <summary>Optional AI speaking outline</summary>
            <p>Enter key points, optionally tagged by section, e.g. "Intro: explain the main problem".
              The free prototype checks literal phrases, not semantic meaning.</p>
            <label htmlFor="sprint4-ai-outline">Speaking outline (optional)</label>
            <textarea id="sprint4-ai-outline" rows={4} maxLength={2000}
              value={coachOutline} placeholder="Intro: explain the main problem"
              onChange={(event) => setCoachOutline(event.target.value)} />
          </details>
          <HistoryPanel runs={presentationHistory} hints={historyHints}
            onDelete={deleteHistoryRun} onClear={clearPresentationHistory} compact />
          <label className="sprint4-ai-present-optin">
            <input type="checkbox" checked={historyHintsEnabled}
              onChange={(event) => setHistoryHintsEnabled(event.target.checked)} />
            Show brief reminders from past rehearsals during Present
          </label>
          <div className="launch-options">
            <h2>Choose how to begin</h2>
            <button className="launch-option launch-option--rehearse" onClick={startRehearsal} type="button">
              <span className="launch-option__icon"><Icon name="play" size={22} /></span>
              <span>
                <strong>Rehearse</strong>
                <small>Practice and review your pacing</small>
              </span>
              <Icon name="chevron-right" />
            </button>
            <button
              className="launch-option launch-option--present"
              onClick={() => {
                setScreen("presentation-ready");
                window.scrollTo(0, 0);
              }}
              type="button"
            >
              <span className="launch-option__icon"><Icon name="clock" size={22} /></span>
              <span>
                <strong>Present</strong>
                <small>Calm, glanceable timer for the real thing</small>
              </span>
              <Icon name="chevron-right" />
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (screen === "presentation-ready") {
    const selectedDisplayStyle = DISPLAY_STYLES.find((style) => style.id === displayStyle) ?? DISPLAY_STYLES[1];
    const selectedColor = COLOR_MODES.find((mode) => mode.id === colorMode) ?? COLOR_MODES[0];
    // Preview the user's real first section, halfway through its own target.
    const previewSection = sections[0];
    const previewNext = sections[1];
    const previewElapsed = previewSection ? Math.round(previewSection.target / 2) : 0;
    return (
      <main className={`app-shell presentation-ready-screen mode--${presentationMode}`}>
        <AppHeader account={account} onAccount={() => openAccount("presentation-ready")} onHome={goHome} />
        <section className="page-content">
          <button className="back-link" onClick={() => setScreen("ready")} type="button">
            <Icon name="arrow-left" /> Back
          </button>
          <div className="presentation-ready__intro">
            <span className="eyebrow">Presentation mode</span>
            <h1>Ready to present?</h1>
            <p>{title}</p>
          </div>

          <div className="presentation-ready__total">
            <span>Total time</span>
            <strong>{formatTime(totalTarget)}</strong>
            <small>{pluralSections(sections.length)}</small>
          </div>

          <div className="presentation-ready__sections">
            {sections.map((section, index) => (
              <div key={section.id}>
                <span>{index + 1}</span>
                <div>
                  <strong>{section.name}</strong>
                  {presentationMode === "group" && (
                    <small className={section.speaker ? "" : "unassigned-tag"}>{speakerLabel(section.speaker)}</small>
                  )}
                </div>
                <time>{formatTime(section.target)}</time>
              </div>
            ))}
          </div>

          {presentationMode === "group" && renderSpeakerAllocation()}

          <div className={`presentation-setting quiet-setting ${quietMode ? "quiet-setting--on" : ""}`}>
            <div>
              <strong>Quiet view</strong>
              <small>
                Hide times and ahead/behind status while you present. You still see the section, what's next
                and the Next button. Timing is still recorded for your summary.
              </small>
            </div>
            <button
              aria-label="Quiet view"
              aria-pressed={quietMode}
              className="switch"
              onClick={() => setQuietMode((value) => !value)}
              type="button"
            >
              <span />
            </button>
          </div>

          <button
            aria-expanded={showPresentationCustomization}
            className="presentation-customize-toggle"
            onClick={() => setShowPresentationCustomization((value) => !value)}
            type="button"
          >
            <span>
              <strong>Customize presentation display</strong>
              <small>{quietMode ? "Quiet view" : selectedDisplayStyle.name} · {selectedColor.name}</small>
            </span>
            <Icon name="chevron-down" size={20} />
          </button>

          {showPresentationCustomization && (
            <div className="presentation-customization">
              <fieldset className="presentation-setting">
                <legend>Display detail</legend>
                <div className="segmented-control display-style-control">
                  {DISPLAY_STYLES.map((style) => (
                    <button
                      aria-pressed={displayStyle === style.id}
                      key={style.id}
                      onClick={() => setDisplayStyle(style.id)}
                      type="button"
                    >
                      <strong>{style.name}</strong>
                      <small>{style.description}</small>
                    </button>
                  ))}
                </div>
                <p aria-live="polite" className="display-style-detail">
                  {quietMode ? (
                    <><strong>Quiet view is on:</strong> times and pace stay hidden until you turn it off.</>
                  ) : (
                    <><strong>{selectedDisplayStyle.name}:</strong> {selectedDisplayStyle.detail}</>
                  )}
                </p>
              </fieldset>

              <fieldset className="presentation-setting">
                <legend>Screen color</legend>
                <div className="segmented-control segmented-control--two color-mode-control">
                  {COLOR_MODES.map((mode) => (
                    <button
                      aria-pressed={colorMode === mode.id}
                      key={mode.id}
                      onClick={() => setColorMode(mode.id)}
                      type="button"
                    >
                      <span aria-hidden="true" className={`color-swatch color-swatch--${mode.id}`} />
                      <span className="color-mode-control__copy">
                        <strong>{mode.name}</strong>
                        <small>{mode.description}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div
                aria-label={`Preview of ${previewSection?.name ?? "your first section"} with ${selectedDisplayStyle.name} on a ${selectedColor.name.toLowerCase()}`}
                className={`presentation-preview presentation-preview--${colorMode}`}
                role="img"
              >
                <div className="presentation-preview__top">
                  {(displayStyle !== "minimal" || quietMode) && (
                    <span>Section 1 of {sections.length}</span>
                  )}
                  {displayStyle === "detailed" && !quietMode && (
                    <span>Total {formatTime(previewElapsed)} / {formatTime(totalTarget)}</span>
                  )}
                </div>
                <div className="presentation-preview__stage">
                  {presentationMode === "group" && (
                    <small>Presenting · {speakerLabel(previewSection?.speaker)}</small>
                  )}
                  <strong>{previewSection?.name}</strong>
                  <div className="presentation-preview__progress">
                    <span style={{ width: "50%" }} />
                  </div>
                  {displayStyle === "minimal" || quietMode ? (
                    <i className="presentation-preview__hint">{quietMode ? "Timing hidden" : "Time hidden"} · tap to peek</i>
                  ) : (
                    <time>{formatTime(previewElapsed)} / {formatTime(previewSection?.target ?? 0)}</time>
                  )}
                  {displayStyle === "detailed" && !quietMode && (
                    <b className="presentation-preview__status">On pace</b>
                  )}
                  <p>
                    {previewNext
                      ? presentationMode === "group"
                        ? `Up next · ${speakerLabel(previewNext.speaker)} — ${previewNext.name}${displayStyle === "detailed" && !quietMode ? ` · ${formatTime(previewNext.target)}` : ""}`
                        : `Next: ${previewNext.name}${displayStyle === "detailed" && !quietMode ? ` · ${formatTime(previewNext.target)}` : ""}`
                      : "Final section"}
                  </p>
                </div>
              </div>
              <p className="presentation-preview__caption">
                Preview of your first section, “{previewSection?.name}”, halfway through ({formatTime(previewElapsed)} of {formatTime(previewSection?.target ?? 0)}).
              </p>

              <div className="presentation-setting haptic-setting">
                <div>
                  <strong>Pacing cues</strong>
                  <small>Pulse in the final 5 seconds and vibrate when supported</small>
                </div>
                <button
                  aria-label="Toggle pacing cues"
                  aria-pressed={hapticsEnabled}
                  className="switch"
                  onClick={() => setHapticsEnabled((value) => !value)}
                  type="button"
                >
                  <span />
                </button>
              </div>
            </div>
          )}

          {savePanel}
        </section>
        <div className="sticky-action sticky-action--light">
          <Button className="button--full button--tall" icon="play" onClick={startPresentation}>
            Start
          </Button>
        </div>
      </main>
    );
  }

  if (screen === "present") {
    const current = sections[activeIndex];
    const isLast = activeIndex === sections.length - 1;
    const isOver = sectionElapsed > current.target;
    const progress = Math.min(100, (sectionElapsed / current.target) * 100);
    // Quiet view keeps the screen calm: no over/near colors, times or pace status.
    const pace = quietMode ? "neutral" : isOver ? "over" : progress >= 80 ? "near" : "neutral";
    const showTiming = !quietMode && displayStyle !== "minimal";
    const cueActive =
      hapticsEnabled &&
      isRunning &&
      sectionElapsed < current.target &&
      current.target - sectionElapsed <= 5;
    return (
      <main
        className={`present-screen present-screen--${pace} present-screen--${displayStyle} timer-color--${colorMode} ${cueActive ? "present-screen--cue" : ""} ${quietMode ? "present-screen--quiet" : ""}`}
        onClick={revealExactTime}
      >
        <div className="present-screen__top">
          <Button className="present-home-button" icon="home" onClick={goHome} variant="ghost">
            Home
          </Button>
          <div className="present-screen__meta">
            {(displayStyle !== "minimal" || quietMode) && (
              <span>Section {activeIndex + 1} of {sections.length}</span>
            )}
            {displayStyle === "detailed" && !quietMode && (
              <span>Presentation remaining: {totalElapsed > totalTarget ? `+${formatTime(totalElapsed - totalTarget)} over` : formatTime(totalTarget - totalElapsed)}</span>
            )}
          </div>
          <button
            aria-pressed={quietMode}
            className="present-quiet-toggle"
            onClick={(event) => {
              event.stopPropagation();
              setQuietMode((value) => !value);
            }}
            type="button"
          >
            {quietMode ? "Show timing" : "Quiet view"}
          </button>
        </div>

        <PresentHistoryHint hint={liveFeedback.cue ? null : currentHistoryHint}
          onDismiss={() => setDismissedHintSection(activeIndex)} />
        <LiveCueOverlay cue={liveFeedback.cue} onDismiss={liveFeedback.dismiss} />
        {coachDock("Present")}
        <div className="present-actions" onClick={(event) => event.stopPropagation()}>
          <Button ariaLabel="Go back to setup" icon="edit" onClick={resetToSetup} variant="ghost">
            Setup
          </Button>
          <Button ariaLabel="Restart current section" icon="restart" onClick={restartCurrentSection} variant="ghost">
            Restart
          </Button>
          <Button
            icon={isRunning ? "pause" : "play"}
            onClick={toggleTimer}
            variant="ghost"
          >
            {isRunning ? "Pause" : "Resume"}
          </Button>
        </div>

        <section className="present-stage" key={current.id}>
          {presentationMode === "group" && (
            <span className="present-speaker">
              <small>Presenting</small>
              <strong>{speakerLabel(current.speaker)}</strong>
            </span>
          )}
          <h1>{current.name}</h1>
          {showTiming && <p className="present-remaining-total">Presentation remaining: {totalElapsed > totalTarget ? `+${formatTime(totalElapsed - totalTarget)} over` : formatTime(totalTarget - totalElapsed)}</p>}
          <div className="present-progress" aria-label={`${Math.round(progress)} percent of section target`}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className={`present-exact-time ${exactTimeVisible || showTiming ? "present-exact-time--visible" : ""}`}>
            {isOver && !quietMode
              ? `Section over by +${formatTime(sectionElapsed - current.target)}`
              : `Section remaining: ${formatTime(current.target - sectionElapsed)}`}
          </div>
          {quietMode && !exactTimeVisible && (
            <span className="present-quiet-hint">Timing hidden · tap to peek</span>
          )}
          {displayStyle === "detailed" && !quietMode && (
            <div className="present-detail-status">
              {isOver ? "Over target" : progress >= 80 ? "Approaching target" : "On pace"}
            </div>
          )}
          {displayStyle === "minimal" && !quietMode && isOver && !exactTimeVisible && (
            <span className="present-overtime">+{formatTime(sectionElapsed - current.target)}</span>
          )}
          {!isLast && presentationMode === "group" ? (
            <div className="present-next present-next--speaker">
              <small>Up next</small>
              <strong>{speakerLabel(sections[activeIndex + 1].speaker)}</strong>
              <span>
                {sections[activeIndex + 1].name}
                {displayStyle === "detailed" && !quietMode && ` · ${formatTime(sections[activeIndex + 1].target)}`}
              </span>
            </div>
          ) : !isLast ? (
            <div className="present-next">
              <span>
                Next: {sections[activeIndex + 1].name}
                {displayStyle === "detailed" && !quietMode && ` · ${formatTime(sections[activeIndex + 1].target)}`}
              </span>
            </div>
          ) : (
            <div className="present-next"><span>Final section</span></div>
          )}
        </section>

        {presentExitDestination && (
          <ConfirmDialog title="Exit live presentation?" body="Your current live timing results are not saved. Keep presenting to preserve your running timer." cancelLabel="Keep presenting" confirmLabel="Exit presentation" danger onCancel={() => setPresentExitDestination(null)} onConfirm={() => { const destination=presentExitDestination; setPresentExitDestination(null); clock.current.since=null; setIsRunning(false); setAutosaveOn(false); setScreen(destination === "setup" ? "setup" : "concepts"); }}/>
        )}
        {!isRunning && <div className="present-paused">Paused</div>}

        <button
          className="present-advance"
          onClick={(event) => {
            event.stopPropagation();
            nextPresentationSection();
          }}
          type="button"
        >
          <span>{isLast ? "Finish presentation" : "Next section"}</span>
          <Icon name="chevron-right" size={24} />
          <small>Advance when you are ready</small>
        </button>
      </main>
    );
  }

  if (screen === "presentation-summary") {
    const liveTotal = actualTimes.reduce((total, value) => total + (value || 0), 0);
    const liveDifference = liveTotal - totalTarget;
    const summaryLine = Math.abs(liveDifference) <= 1
      ? "You finished right on target."
      : `You finished ${formatTime(Math.abs(liveDifference))} ${liveDifference > 0 ? "over" : "early"}.`;
    return (
      <main className={`app-shell presentation-summary-screen mode--${presentationMode}`}>
        <AppHeader account={account} onAccount={() => openAccount("presentation-summary")} onHome={goHome} />
        <section className="page-content">
          <span className="eyebrow">Presentation complete</span>
          <h1>Nicely done.</h1>
          <p className="review-title">{title}</p>

          <div className="live-summary">
            <span>Total time</span>
            <strong>{formatTime(liveTotal)}</strong>
            <small>{formatTime(totalTarget)} target</small>
            <p>{summaryLine}</p>
          </div>

          {speechCoach.segments.length > 0 && (
            <CoachReport metrics={speechMetrics} transcript={speechCoach.transcript} outline={coachOutline} />
          )}
          <button
            aria-expanded={showLiveBreakdown}
            className="breakdown-toggle"
            onClick={() => setShowLiveBreakdown((value) => !value)}
            type="button"
          >
            See section breakdown <Icon name="chevron-down" size={19} />
          </button>

          {showLiveBreakdown && (
            <div className="live-breakdown">
              {sections.map((section, index) => (
                <div key={section.id}>
                  <span>
                    <strong>{section.name}</strong>
                    {presentationMode === "group" && <small>{speakerLabel(section.speaker)}</small>}
                  </span>
                  <time>{formatTime(actualTimes[index] || 0)} / {formatTime(section.target)}</time>
                </div>
              ))}
            </div>
          )}

          <p className="results-not-saved">
            <Icon name="clock" size={16} />
            These times show only on this screen. Save setup stores your presentation setup, not this run.
          </p>

          {savePanel}
        </section>
        <div className="review-actions">
          <Button className="button--full" icon="check" onClick={() => setScreen("ready")}>
            Done
          </Button>
        </div>
      </main>
    );
  }

  if (screen === "rehearse") {
    const current = sections[activeIndex];
    const remaining = current.target - sectionElapsed;
    const isOver = remaining < 0;
    const isLast = activeIndex === sections.length - 1;
    const progress = Math.min(100, (sectionElapsed / current.target) * 100);
    return (
      <main className={`timer-screen mode--${presentationMode} timer-color--muted ${isOver ? "timer-screen--over" : ""}`}>
        <header className="timer-header">
          <Brand onClick={goHome} />
          <Button className="home-button" icon="home" onClick={goHome} variant="ghost">
            Home
          </Button>
        </header>
        <LiveCueOverlay cue={liveFeedback.cue} onDismiss={liveFeedback.dismiss} />
        {coachDock("Rehearse")}
        <section className="timer-content">
          <div className="timer-position">
            <span>{isLast ? "Last section" : `Section ${activeIndex + 1} of ${sections.length}`}</span>
            <span>Presentation remaining: {totalElapsed > totalTarget ? `+${formatTime(totalElapsed - totalTarget)} over` : formatTime(totalTarget - totalElapsed)}</span>
          </div>
          <div className="total-progress"><span style={{ width: `${Math.min(100, (totalElapsed / totalTarget) * 100)}%` }} /></div>
          <div className="current-section rehearsal-section-transition" key={`section-heading-${current.id}`}>
            <div className="eyebrow">
              {presentationMode === "group" ? (
                <>
                  <span>Presenting</span>
                  <strong>{speakerLabel(current.speaker)}</strong>
                </>
              ) : "Now presenting"}
            </div>
            <h1>{current.name}</h1>
          </div>
          <div
            className="timer-dial rehearsal-section-transition"
            key={`section-timer-${current.id}`}
            style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}
          >
            <div className="timer-dial__inner">
              <span>{isOver ? "Section over by" : "Section remaining"}</span>
              <strong>{isOver ? "+" : ""}{formatTime(Math.abs(remaining))}</strong>
              <small>{isRunning ? "Timer running" : "Paused"}</small>
            </div>
          </div>
          {isOver && (
            <div className="pace-warning"><Icon name="warning" /> +{formatTime(Math.abs(remaining))} over target</div>
          )}
          {presentationMode === "group" && !isLast && (
            <div className="next-speaker">
              <span>Up next</span>
              <strong>{speakerLabel(sections[activeIndex + 1].speaker)}</strong>
              <small>Next section · {sections[activeIndex + 1].name}</small>
            </div>
          )}
          <div className="timer-controls">
            <div className="rehearsal-actions">
              <Button
                ariaLabel="Go back to setup"
                className="pause-button"
                icon="edit"
                onClick={() => {
                  setResumeRehearsalAfterConfirm(isRunning);
                  if (isRunning) freezeClock();
                  setIsRunning(false);
                  setConfirmingRehearsalSetup(true);
                }}
                variant="secondary"
              >
                Setup
              </Button>
              <Button
                ariaLabel="Restart current section"
                className="pause-button"
                icon="restart"
                onClick={restartCurrentSection}
                variant="secondary"
              >
                Restart
              </Button>
              <Button
                className="pause-button"
                icon={isRunning ? "pause" : "play"}
                onClick={toggleTimer}
                variant="secondary"
              >
                {isRunning ? "Pause" : "Resume"}
              </Button>
            </div>
            <Button className="next-button button--full" onClick={nextSection}>
              {isLast ? "Finish" : "Next section"} <Icon name="chevron-right" />
            </Button>
          </div>
          {/* SCRUM-153: on the last section, Finish is the only way out, so ending there is always Complete. */}
          {!isLast && (
            <button className="end-link" onClick={() => finishRehearsal()} type="button">End rehearsal</button>
          )}
        </section>
        {confirmingRehearsalSetup && (
          <div className="rehearsal-confirm" role="presentation">
            <div
              aria-describedby="rehearsal-confirm-description"
              aria-labelledby="rehearsal-confirm-title"
              aria-modal="true"
              className="rehearsal-confirm__dialog"
              role="dialog"
            >
              <h2 id="rehearsal-confirm-title">Return to setup?</h2>
              <p id="rehearsal-confirm-description">
                Your current rehearsal progress will be discarded.
              </p>
              <div>
                <Button
                  className="button--full"
                  onClick={() => {
                    setConfirmingRehearsalSetup(false);
                    if (resumeRehearsalAfterConfirm) clock.current.since = performance.now();
                    setIsRunning(resumeRehearsalAfterConfirm);
                  }}
                  variant="secondary"
                >
                  Keep rehearsing
                </Button>
                <Button className="button--full" onClick={resetToSetup} variant="danger">
                  Return to setup
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  const actualTotal = actualTimes.reduce((total, value) => total + (value || 0), 0);
  const totalDifference = actualTotal - totalTarget;
  // Only sections that were fully finished are compared against their targets.
  const finishedCount = rehearsalIncomplete ? rehearsalEndIndex : sections.length;
  const sectionResult = (index: number) => {
    const section = sections[index];
    const actual = actualTimes[index] || 0;
    const difference = actual - section.target;
    if (rehearsalIncomplete && index > rehearsalEndIndex) return { actual, difference, status: "notreached" as const };
    if (rehearsalIncomplete && index === rehearsalEndIndex) return { actual, difference, status: "stopped" as const };
    if (actual < 1) return { actual, difference, status: "skipped" as const };
    const status = Math.abs(difference) <= 10 ? ("on" as const) : difference > 0 ? ("over" as const) : ("under" as const);
    return { actual, difference, status };
  };
  const speakerResults = speakerTotals
    .map((row) => {
      const finished = row.indexes.filter((index) => index < finishedCount);
      return {
        speaker: row.label,
        target: finished.reduce((total, index) => total + sections[index].target, 0),
        actual: finished.reduce((total, index) => total + (actualTimes[index] || 0), 0),
      };
    })
    .filter((result) => result.target > 0);
  const largestSpeakerTime = Math.max(1, ...speakerResults.map((result) => result.actual));
  return (
    <main className={`app-shell review-screen mode--${presentationMode}`}>
      <AppHeader account={account} onAccount={() => openAccount("review")} onHome={goHome} />
      <section className="page-content">
        <h1>Your pacing</h1>
        <p className="review-title">{title}</p>
        {rehearsalIncomplete ? (
          <p className="incomplete-note" role="status">
            <Icon name="warning" size={16} /> Incomplete rehearsal · ended during section {rehearsalEndIndex + 1} of {sections.length}.
            Times you recorded are kept below.
          </p>
        ) : (
          <p className="complete-note" role="status">
            <Icon name="check" size={16} /> Complete rehearsal{sections.length > 1 && ` · all ${sections.length} sections`}
          </p>
        )}

        <div className="results-hero">
          <span>Actual time</span>
          <strong>{formatTime(actualTotal)}</strong>
          {rehearsalIncomplete ? (
            <div className="status status--incomplete">
              <Icon name="warning" size={18} />
              Incomplete
            </div>
          ) : (
            <div className={`status status--${Math.abs(totalDifference) <= 10 ? "on" : totalDifference > 0 ? "over" : "under"}`}>
              <Icon name={Math.abs(totalDifference) <= 10 ? "check" : "warning"} size={18} />
              {Math.abs(totalDifference) <= 10
                ? "On time"
                : `${totalDifference > 0 ? "+" : "−"}${formatTime(Math.abs(totalDifference))} ${totalDifference > 0 ? "over" : "under"}`}
            </div>
          )}
          <small>{formatTime(totalTarget)} target{rehearsalIncomplete && " for the full presentation"}</small>
        </div>

        {speechCoach.segments.length > 0 && (
          <CoachReport metrics={speechMetrics} transcript={speechCoach.transcript} outline={coachOutline} />
        )}
        <SaveRehearsalPanel saved={savedHistoryRunId === currentRehearsalId}
          savingError={historySaveError} saveTranscript={saveHistoryTranscript}
          setSaveTranscript={setSaveHistoryTranscript} onSave={saveRehearsalHistory} />
        <HistoryPanel runs={presentationHistory} hints={historyHints}
          onDelete={deleteHistoryRun} onClear={clearPresentationHistory} compact />
        {presentationMode === "group" && (
          <section className="speaker-results">
            <div className="result-heading">
              <div>
                <h2>Speaking time</h2>
                <span>Compare pacing across the team</span>
              </div>
              <span>Actual / target</span>
            </div>
            {rehearsalIncomplete && (
              <p className="results-note">Only sections you finished are compared.</p>
            )}
            {speakerResults.length === 0 && (
              <p className="results-note">No speaker finished a full section before the rehearsal ended.</p>
            )}
            <div className="speaker-chart">
              {speakerResults.map((result) => {
                const difference = result.actual - result.target;
                const status = Math.abs(difference) <= 10 ? "on" : difference > 0 ? "over" : "under";
                return (
                  <div className="speaker-bar" key={result.speaker}>
                    <div className="speaker-bar__top">
                      <strong>{result.speaker}</strong>
                      <span>{formatTime(result.actual)} / {formatTime(result.target)}</span>
                    </div>
                    <div className="speaker-bar__track">
                      <span style={{ width: `${(result.actual / largestSpeakerTime) * 100}%` }} />
                    </div>
                    <small className={`speaker-bar__status speaker-bar__status--${status}`}>
                      <Icon name={status === "on" ? "check" : "warning"} size={13} />
                      {status === "on"
                        ? "On pace"
                        : `${difference > 0 ? "+" : "−"}${formatTime(Math.abs(difference))} ${status}`}
                    </small>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="result-heading">
          <h2>Section breakdown</h2>
          <span>±10s is on time</span>
        </div>
        <div className="result-list">
          {sections.map((section, index) => {
            const { actual, difference, status } = sectionResult(index);
            const neutral = status === "notreached" || status === "stopped" || status === "skipped";
            return (
              <article className={`result-row ${status === "notreached" ? "result-row--notreached" : ""}`} key={section.id}>
                <span className={`result-row__icon result-row__icon--${neutral ? "neutral" : status}`}>
                  <Icon name={status === "on" ? "check" : neutral ? "clock" : "warning"} size={18} />
                </span>
                <div className="result-row__name">
                  <strong>{section.name}</strong>
                  <span>
                    {presentationMode === "group" && `${speakerLabel(section.speaker)} · `}
                    {status === "notreached" ? "—" : formatTime(actual)} actual · {formatTime(section.target)} target
                  </span>
                </div>
                <div className={`result-row__status result-row__status--${neutral ? "neutral" : status}`}>
                  {status === "on"
                    ? "On time"
                    : status === "notreached"
                      ? "Not reached"
                      : status === "stopped"
                        ? "Ended here"
                        : status === "skipped"
                          ? "Skipped"
                          : `${difference > 0 ? "+" : "−"}${formatTime(Math.abs(difference))}`}
                  <small>{(status === "over" || status === "under") && status}</small>
                </div>
              </article>
            );
          })}
        </div>
        <p className="results-not-saved">
          <Icon name="clock" size={16} />
          Save setup only stores your setup. Use "Save rehearsal to history" above to keep this run's timing statistics.
        </p>
        {savePanel}
      </section>
      <div className="review-actions">
        <Button className="button--full" icon="play" onClick={startRehearsal}>Rehearse again</Button>
        <Button className="button--full" onClick={resetToSetup} variant="secondary">Adjust setup</Button>
      </div>
    </main>
  );
}
