import { useEffect, useMemo, useRef, useState } from "react";
import tickTockIcon from "./assets/tick-tock-icon.png";
import tickTockWordmark from "./assets/tick-tock-wordmark.png";

type Section = {
  id: number;
  name: string;
  target: number;
  speaker?: string;
};

type Screen =
  | "account"
  | "concepts"
  | "settings"
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
  speakers: string[];
  displayStyle: DisplayStyle;
  colorMode: ColorMode;
  hapticsEnabled: boolean;
};
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
  | "timer-settings-brush"
  | "restart"
  | "save"
  | "paintbrush"
  | "trash"
  | "user"
  | "users"
  | "warning";

const INITIAL_SECTIONS: Section[] = [
  { id: 1, name: "Intro", target: 10, speaker: "Maya" },
];

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
    paintbrush: <><path d="m14.7 5.3 4 4" /><path d="m12.2 7.8 4 4" /><path d="m3.8 20.2 6.5-6.5 4-4 2.7-2.7a2.8 2.8 0 0 0-4-4L10.3 5.7l-4 4-6.5 6.5L3.8 20.2Z" /><path d="M6.4 13.6 10.4 17.6" /></>,
    play: <path d="m8 5 11 7-11 7Z" />,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    "timer-settings-brush": <><path d="m13.7 4.1 6.2 6.2-4 4-6.2-6.2Z" /><path d="m9.9 8 6.1 6.1" /><path d="m3.2 20.8 2.5-6.5 4.1 4.1Z" /><path d="M5.7 14.3 9.8 18.4" /><path d="M5.1 4.2v2.4M3.9 5.4h2.4M19.1 17.4v2.2M18 18.5h2.2" /></>,
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

function parseTime(value: string) {
  if (/^\d+$/.test(value.trim())) return Number(value.trim());
  const match = value.trim().match(/^(\d+):([0-5]\d)$/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatTimeInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, -2)}:${digits.slice(-2)}`;
}

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
}) {
  return (
    <button
      aria-label={ariaLabel}
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

function AppHeader({
  onHome,
  onSettings,
}: {
  onHome: () => void;
  onSettings: () => void;
}) {
  return (
    <header className="app-header">
      <Button className="home-button" icon="home" onClick={onHome} variant="ghost">
        Home
      </Button>
      <div className="header-actions">
        <Button
          ariaLabel="Customize timer display"
          className="timer-settings-button"
          icon="timer-settings-brush"
          onClick={onSettings}
          title="Customize timer display"
          variant="ghost"
        />
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

const DISPLAY_STYLES: {
  id: DisplayStyle;
  name: string;
  description: string;
}[] = [
  { id: "minimal", name: "Focused", description: "Speaker and section" },
  { id: "standard", name: "Balanced", description: "Essential timing" },
  { id: "detailed", name: "Full timing", description: "Complete pacing" },
];

function readTimerSettings() {
  try {
    const saved = JSON.parse(window.localStorage.getItem("tick-tock-timer-settings") ?? "{}");
    return {
      displayStyle: DISPLAY_STYLES.some((style) => style.id === saved.displayStyle)
        ? saved.displayStyle as DisplayStyle
        : "standard" as DisplayStyle,
      colorMode: saved.colorMode === "bright" ? "bright" as ColorMode : "muted" as ColorMode,
      hapticsEnabled: Boolean(saved.hapticsEnabled),
    };
  } catch {
    return { displayStyle: "standard" as DisplayStyle, colorMode: "muted" as ColorMode, hapticsEnabled: false };
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("concepts");
  const [showWelcome, setShowWelcome] = useState(true);
  const [settingsReturnScreen, setSettingsReturnScreen] = useState<Screen>("concepts");
  const [presentationMode, setPresentationMode] = useState<PresentationMode>("individual");
  const [title, setTitle] = useState("Wolverine Venture Pitch");
  const [sections, setSections] = useState<Section[]>(INITIAL_SECTIONS);
  const [speakers, setSpeakers] = useState(["Maya", "Jordan", "Alex"]);
  const [newSpeaker, setNewSpeaker] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftTime, setDraftTime] = useState("");
  const [draftSpeaker, setDraftSpeaker] = useState("");
  const [formError, setFormError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [sectionElapsed, setSectionElapsed] = useState(0);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [actualTimes, setActualTimes] = useState<number[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragAnnouncement, setDragAnnouncement] = useState("");
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>(() => readTimerSettings().displayStyle);
  const [colorMode, setColorMode] = useState<ColorMode>(() => readTimerSettings().colorMode);
  const [hapticsEnabled, setHapticsEnabled] = useState(() => readTimerSettings().hapticsEnabled);
  const [showSettingsOnboarding, setShowSettingsOnboarding] = useState(() => {
    return window.localStorage.getItem("tick-tock-settings-onboarding-dismissed") !== "true";
  });
  const [showSetupSignInReminder, setShowSetupSignInReminder] = useState(true);
  const [exactTimeVisible, setExactTimeVisible] = useState(false);
  const [showLiveBreakdown, setShowLiveBreakdown] = useState(false);
  const [liveRunSaved, setLiveRunSaved] = useState(false);
  const [confirmingRehearsalSetup, setConfirmingRehearsalSetup] = useState(false);
  const [resumeRehearsalAfterConfirm, setResumeRehearsalAfterConfirm] = useState(false);
  const [account, setAccount] = useState<Account | null>(() => {
    try {
      const saved = window.localStorage.getItem("tick-tock-account");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [savedPresentations, setSavedPresentations] = useState<SavedPresentation[]>(() => {
    try {
      const saved = window.localStorage.getItem("tick-tock-presentations");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [accountName, setAccountName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountError, setAccountError] = useState("");
  const [accountReturnScreen, setAccountReturnScreen] = useState<Screen>("concepts");
  const [saveAfterSignIn, setSaveAfterSignIn] = useState(false);
  const [saveConfirmation, setSaveConfirmation] = useState("");
  const nextId = useRef(2);
  const exactTimeTimeout = useRef<number | null>(null);
  // Timer state always comes from elapsed monotonic time, not from interval counts.
  const clock = useRef({ totalMs: 0, sectionMs: 0, since: null as number | null });
  const lastHapticSection = useRef<number | null>(null);

  const totalTarget = useMemo(
    () => sections.reduce((total, section) => total + section.target, 0),
    [sections],
  );

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
    const welcomeTimer = window.setTimeout(() => setShowWelcome(false), 1800);
    return () => window.clearTimeout(welcomeTimer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("tick-tock-presentations", JSON.stringify(savedPresentations));
  }, [savedPresentations]);

  useEffect(() => {
    window.localStorage.setItem(
      "tick-tock-timer-settings",
      JSON.stringify({ displayStyle, colorMode, hapticsEnabled }),
    );
  }, [colorMode, displayStyle, hapticsEnabled]);

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
    setDraftTime(section ? formatTime(section.target) : "");
    setDraftSpeaker(section?.speaker ?? speakers[0] ?? "");
  };

  const saveSection = () => {
    const target = parseTime(draftTime);
    if (!draftName.trim() || !target) {
      setFormError("Add a section name and target time.");
      return;
    }
    if (editingId) {
      setSections((current) =>
        current.map((section) =>
          section.id === editingId
            ? {
                ...section,
                name: draftName.trim(),
                target,
                speaker: presentationMode === "group" ? draftSpeaker : section.speaker,
              }
            : section,
        ),
      );
    } else {
      setSections((current) => [
        ...current,
        {
          id: nextId.current++,
          name: draftName.trim(),
          target,
          speaker: presentationMode === "group" ? draftSpeaker : undefined,
        },
      ]);
    }
    setEditingId(null);
  };

  const continueToReady = () => {
    if (!title.trim() || sections.length === 0) {
      setFormError("Add a presentation title and at least one section.");
      return;
    }
    setFormError("");
    setScreen("ready");
    window.scrollTo(0, 0);
  };

  const startRehearsal = () => {
    clock.current = { totalMs: 0, sectionMs: 0, since: performance.now() };
    lastHapticSection.current = null;
    setActiveIndex(0);
    setSectionElapsed(0);
    setTotalElapsed(0);
    setActualTimes([]);
    setConfirmingRehearsalSetup(false);
    setIsRunning(true);
    setScreen("rehearse");
  };

  const startPresentation = () => {
    clock.current = { totalMs: 0, sectionMs: 0, since: performance.now() };
    lastHapticSection.current = null;
    setActiveIndex(0);
    setSectionElapsed(0);
    setTotalElapsed(0);
    setActualTimes([]);
    setExactTimeVisible(false);
    setShowLiveBreakdown(false);
    setLiveRunSaved(false);
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
    clock.current.since = null;
    setIsRunning(false);
    setScreen("setup");
    setEditingId(null);
    window.scrollTo(0, 0);
  };

  const goHome = () => {
    clock.current.since = null;
    setIsRunning(false);
    setEditingId(null);
    setScreen("concepts");
    window.scrollTo(0, 0);
  };

  const openSettings = (returnScreen: Screen = screen) => {
    if (returnScreen === "rehearse" || returnScreen === "present") {
      if (isRunning) freezeClock();
      setIsRunning(false);
    }
    setSettingsReturnScreen(returnScreen);
    setScreen("settings");
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
  ): SavedPresentation => ({
    id,
    ownerEmail,
    updatedAt: Date.now(),
    title: title.trim(),
    presentationMode,
    sections,
    speakers,
    displayStyle,
    colorMode,
    hapticsEnabled,
  });

  const savePresentation = (signedInAccount = account) => {
    if (!signedInAccount) {
      setSaveAfterSignIn(true);
      openAccount(screen);
      return;
    }
    if (!title.trim()) {
      setFormError("Add a presentation title before saving.");
      return;
    }
    const id = activeSavedId ?? crypto.randomUUID();
    const saved = buildSavedPresentation(id, signedInAccount.email);
    setSavedPresentations((current) => [
      saved,
      ...current.filter((presentation) => presentation.id !== id),
    ]);
    setActiveSavedId(id);
    setSaveConfirmation(activeSavedId ? "Changes saved" : "Presentation saved");
    window.setTimeout(() => setSaveConfirmation(""), 2400);
  };

  const signIn = () => {
    const name = accountName.trim();
    const email = accountEmail.trim().toLowerCase();
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) {
      setAccountError("Enter your name and a valid email address.");
      return;
    }
    const nextAccount = { name, email };
    setAccount(nextAccount);
    window.localStorage.setItem("tick-tock-account", JSON.stringify(nextAccount));
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
    setAccount(null);
    setActiveSavedId(null);
    window.localStorage.removeItem("tick-tock-account");
    setScreen("concepts");
  };

  const startNewPresentation = (mode: PresentationMode) => {
    setPresentationMode(mode);
    setTitle("");
    setSections([{ id: 1, name: "Intro", target: 60, speaker: mode === "group" ? "Speaker 1" : undefined }]);
    setSpeakers(mode === "group" ? ["Speaker 1"] : []);
    setActiveSavedId(null);
    setFormError("");
    nextId.current = 2;
    setScreen("setup");
    window.scrollTo(0, 0);
  };

  const openSavedPresentation = (presentation: SavedPresentation) => {
    setTitle(presentation.title);
    setPresentationMode(presentation.presentationMode);
    setSections(presentation.sections);
    setSpeakers(presentation.speakers);
    setActiveSavedId(presentation.id);
    nextId.current = Math.max(0, ...presentation.sections.map((section) => section.id)) + 1;
    setScreen("setup");
    window.scrollTo(0, 0);
  };

  const userPresentations = account
    ? savedPresentations.filter((presentation) => presentation.ownerEmail === account.email)
    : [];

  const addSpeaker = () => {
    const name = newSpeaker.trim();
    if (!name || speakers.some((speaker) => speaker.toLowerCase() === name.toLowerCase())) return;
    setSpeakers((current) => [...current, name]);
    setNewSpeaker("");
  };

  if (showWelcome) {
    return (
      <main className="welcome-screen" aria-label="Tick-Tock welcome">
        <div className="welcome-screen__content">
          <img className="welcome-screen__icon" alt="" src={tickTockIcon} />
          <img className="welcome-screen__wordmark" alt="Tick-Tock" src={tickTockWordmark} />
          <p>Practice your pace.</p>
        </div>
      </main>
    );
  }

  if (screen === "account") {
    return (
      <main className="app-shell account-screen">
        <header className="app-header">
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
              <p className="account-device-note">This prototype saves account data on this device.</p>
            </>
          ) : (
            <>
              <span className="eyebrow">Tick-Tock account</span>
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
              <p className="account-device-note">No account is required to rehearse or present.</p>
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
          <div className="gallery-header__actions">
            <div className="timer-settings-launcher">
              <Button
                ariaLabel="Customize timer display"
                className="timer-settings-button"
                icon="timer-settings-brush"
                onClick={() => openSettings("concepts")}
                title="Customize timer display"
                variant="ghost"
              />
              {showSettingsOnboarding && (
                <div className="settings-onboarding" role="status">
                  <button
                    aria-label="Dismiss timer settings introduction"
                    onClick={() => {
                      setShowSettingsOnboarding(false);
                      window.localStorage.setItem("tick-tock-settings-onboarding-dismissed", "true");
                    }}
                    type="button"
                  >
                    ×
                  </button>
                  <strong>Customize your timer</strong>
                  <span>Choose how your presentation timer looks during Present mode.</span>
                </div>
              )}
            </div>
            <Button
              className={`account-button ${account ? "account-button--signed-in" : ""}`}
              icon="user"
              onClick={() => openAccount("concepts")}
              variant="ghost"
            >
              {account ? account.name.split(" ")[0] : "Sign in"}
            </Button>
          </div>
        </header>
        <section className="gallery-content">
          <div className="gallery-intro">
            <span className="eyebrow">{account ? `Welcome back, ${account.name.split(" ")[0]}` : "Guest mode"}</span>
            <h1>{account ? "Your presentations" : "Start a presentation"}</h1>
            <p>{account ? "Open a saved presentation or begin something new." : "Rehearse and present without an account. Sign in only when you want to save."}</p>
          </div>
          {account && userPresentations.length > 0 && (
            <div className="presentation-library">
              {userPresentations.map((presentation) => (
                <article className="saved-presentation" key={presentation.id}>
                  <button onClick={() => openSavedPresentation(presentation)} type="button">
                    <span className={`saved-presentation__icon saved-presentation__icon--${presentation.presentationMode}`}>
                      <Icon name={presentation.presentationMode === "group" ? "users" : "user"} />
                    </span>
                    <span className="saved-presentation__copy">
                      <strong>{presentation.title}</strong>
                      <small>
                        {presentation.sections.length} {presentation.sections.length === 1 ? "section" : "sections"} · {formatTime(presentation.sections.reduce((total, section) => total + section.target, 0))}
                      </small>
                      <time>Updated {new Date(presentation.updatedAt).toLocaleDateString()}</time>
                    </span>
                    <Icon name="chevron-right" />
                  </button>
                  <Button
                    ariaLabel={`Delete ${presentation.title}`}
                    icon="trash"
                    onClick={() => setSavedPresentations((current) => current.filter((item) => item.id !== presentation.id))}
                    variant="ghost"
                  />
                </article>
              ))}
            </div>
          )}
          {!account && (
            <button className="save-callout" onClick={() => openAccount("concepts")} type="button">
              <span className="save-callout__icon"><Icon name="save" /></span>
              <span><strong>Want to save your work?</strong><small>Sign in to keep one or many presentations.</small></span>
              <Icon name="chevron-right" />
            </button>
          )}
          <div className="new-presentation-heading">
            <h2>{account && userPresentations.length ? "New presentation" : "Choose a setup"}</h2>
          </div>
          <div className="concept-grid">
            {MODES.map((mode) => (
              <button
                className={`concept-card concept-card--${mode.id}`}
                key={mode.id}
                onClick={() => startNewPresentation(mode.id)}
                type="button"
              >
                <span className="mode-icon">
                  <Icon name={mode.id === "individual" ? "user" : "users"} size={22} />
                </span>
                <span className="concept-card__copy">
                  <strong>{mode.name}</strong>
                  <small>{mode.description}</small>
                </span>
                <Icon name="chevron-right" />
              </button>
            ))}
          </div>
        </section>
      </main>
    );
  }

  if (screen === "settings") {
    const previewIsDetailed = displayStyle === "detailed";
    const previewHasTiming = displayStyle !== "minimal";
    return (
      <main className="app-shell timer-settings-screen">
        <header className="app-header">
          <Button className="home-button" icon="arrow-left" onClick={() => setScreen(settingsReturnScreen)} variant="ghost">
            Back
          </Button>
        </header>
        <section className="page-content">
          <span className="eyebrow">Present mode</span>
          <h1>Timer Settings</h1>
          <p className="lede">Choose what your countdown shows when you present. These preferences apply to both individual and group presentations.</p>

          <section aria-label="Live timer preview" className={`timer-settings-preview presentation-preview presentation-preview--${colorMode} ${hapticsEnabled ? "presentation-preview--cue" : ""}`}>
            <div className="presentation-preview__top">
              {previewHasTiming && <span>Section 1 of 3</span>}
              {previewIsDetailed && <span>Total 0:05 / 3:00</span>}
            </div>
            <div className="presentation-preview__stage">
              <small>Presenting · Maya</small>
              <strong>Opening</strong>
              <div className="presentation-preview__progress"><span /></div>
              {previewHasTiming && <time>0:05 / 1:00</time>}
              {previewIsDetailed && <b className="presentation-preview__status">On pace</b>}
              {hapticsEnabled && <b className="presentation-preview__cue">Pacing cue · final 5 seconds</b>}
              <p>Up next · Jordan — Market opportunity</p>
            </div>
          </section>

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
          </fieldset>

          <fieldset className="presentation-setting">
            <legend>Timer colors</legend>
            <div className="segmented-control segmented-control--two">
              {(["muted", "bright"] as ColorMode[]).map((mode) => (
                <button
                  aria-pressed={colorMode === mode}
                  key={mode}
                  onClick={() => setColorMode(mode)}
                  type="button"
                >
                  {mode}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="presentation-setting haptic-setting">
            <div>
              <strong>Pacing cues</strong>
              <small>Show a visual pulse in the final 5 seconds and vibrate when supported.</small>
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
        </section>
      </main>
    );
  }

  if (screen === "setup") {
    return (
      <main className={`app-shell mode--${presentationMode}`}>
        <AppHeader onHome={goHome} onSettings={() => openSettings("setup")} />
        <section className="page-content">
          {!account && showSetupSignInReminder && (
            <aside className="setup-sign-in-banner">
              <span><strong>Want to save your presentation?</strong><small>Sign in to keep it for later.</small></span>
              <Button onClick={() => openAccount("setup")} variant="ghost">Sign in</Button>
              <button
                aria-label="Dismiss sign-in reminder for this session"
                className="setup-sign-in-banner__dismiss"
                onClick={() => setShowSetupSignInReminder(false)}
                type="button"
              >
                ×
              </button>
            </aside>
          )}
          <div className="setup-heading">
            <div>
              <span className="eyebrow">{account ? (activeSavedId ? "Saved presentation" : "New presentation") : "Guest presentation"}</span>
              <h1>{presentationMode === "group" ? "Group setup" : "Presentation setup"}</h1>
            </div>
            <Button icon="save" onClick={() => savePresentation()} variant="secondary">
              Save
            </Button>
          </div>
          {saveConfirmation && <div aria-live="polite" className="save-confirmation"><Icon name="check" size={17} />{saveConfirmation}</div>}

          <label className="field">
            <span className="field__label">Presentation title</span>
            <input
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Final pitch"
              value={title}
            />
          </label>

          {presentationMode === "group" && (
            <div className="team-panel">
              <div className="team-panel__heading">
                <h2>Speakers</h2>
                <span>{speakers.length} speakers</span>
              </div>
              <div className="speaker-chips">
                {speakers.map((speaker) => (
                  <span className="speaker-chip" key={speaker}>{speaker}</span>
                ))}
              </div>
              <div className="add-speaker">
                <input
                  aria-label="New speaker name"
                  onChange={(event) => setNewSpeaker(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addSpeaker();
                  }}
                  placeholder="Add speaker name"
                  value={newSpeaker}
                />
                <Button
                  disabled={!newSpeaker.trim()}
                  icon="plus"
                  onClick={addSpeaker}
                  variant="secondary"
                >
                  Add
                </Button>
              </div>
            </div>
          )}

          <div className="section-heading">
            <h2>Sections</h2>
            <div className="total-time">
              <span>Total</span>
              <strong>{formatTime(totalTarget)}</strong>
            </div>
          </div>

          <div className="section-list">
            {sections.map((section, index) => (
              <article
                className={`section-card ${draggingId === section.id ? "section-card--dragging" : ""}`}
                data-section-id={section.id}
                key={section.id}
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
                    {presentationMode === "group" && section.speaker && <b>{section.speaker} · </b>}
                    {formatTime(section.target)} target
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
            ))}
          </div>
          <span className="sr-only" id="drag-instructions">
            Drag to reorder. Keyboard users can press Space, then use the up and down arrow keys,
            and press Space again to drop.
          </span>
          <span aria-live="polite" className="sr-only">{dragAnnouncement}</span>

          {editingId !== null && (
            <div className="editor-card">
              <div className="editor-card__top">
                <h3>{editingId === 0 ? "Add a section" : "Edit section"}</h3>
                <button className="text-button" onClick={() => setEditingId(null)} type="button">Cancel</button>
              </div>
              <div className="editor-grid">
                <label className="field">
                  <span className="field__label">Section name</span>
                  <input
                    autoFocus
                    onChange={(event) => setDraftName(event.target.value)}
                    placeholder="e.g. Team intro"
                    value={draftName}
                  />
                </label>
                <label className="field field--time">
                  <span className="field__label">Target</span>
                  <input
                    inputMode="numeric"
                    onBlur={() => {
                      if (draftTime && !draftTime.includes(":")) {
                        setDraftTime(formatTime(Number(draftTime)));
                      }
                    }}
                    onChange={(event) => setDraftTime(formatTimeInput(event.target.value))}
                    placeholder="45"
                    value={draftTime}
                  />
                  <span className="field__hint">Type 45 for 0:45</span>
                </label>
                {presentationMode === "group" && (
                  <label className="field field--speaker">
                    <span className="field__label">Speaker</span>
                    <span className="speaker-select">
                      <select onChange={(event) => setDraftSpeaker(event.target.value)} value={draftSpeaker}>
                        {speakers.map((speaker) => <option key={speaker}>{speaker}</option>)}
                      </select>
                      <Icon name="chevron-down" size={22} />
                    </span>
                  </label>
                )}
              </div>
              {formError && <div className="form-error"><Icon name="warning" size={18} />{formError}</div>}
              <Button className="button--full" icon="check" onClick={saveSection}>
                Save section
              </Button>
            </div>
          )}

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
        <AppHeader onHome={goHome} onSettings={() => openSettings("ready")} />
        <section className="page-content">
          <button className="back-link" onClick={() => setScreen("setup")} type="button">
            <Icon name="arrow-left" /> Edit setup
          </button>
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
                    {presentationMode === "group" && <small>{section.speaker}</small>}
                  </span>
                  <time>{formatTime(section.target)}</time>
                </li>
                {presentationMode === "group" &&
                  index < sections.length - 1 &&
                  section.speaker !== sections[index + 1].speaker && (
                    <div className="transition-indicator">
                      <Icon name="chevron-right" size={15} />
                      Handoff to {sections[index + 1].speaker}
                    </div>
                  )}
              </div>
            ))}
          </div>
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
    return (
      <main className={`app-shell presentation-ready-screen mode--${presentationMode}`}>
        <AppHeader onHome={goHome} onSettings={() => openSettings("presentation-ready")} />
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
            <small>{sections.length} {sections.length === 1 ? "section" : "sections"}</small>
          </div>

          <div className="presentation-ready__sections">
            {sections.map((section, index) => (
              <div key={section.id}>
                <span>{index + 1}</span>
                <div>
                  <strong>{section.name}</strong>
                  {presentationMode === "group" && <small>{section.speaker}</small>}
                </div>
                <time>{formatTime(section.target)}</time>
              </div>
            ))}
          </div>

          <div className="presentation-save-panel">
            <span>
              <strong>{account ? (activeSavedId ? "Keep this presentation up to date" : "Save this presentation") : "Want to use this again?"}</strong>
              <small>{account ? "Save your timing and display choices." : "Sign in to save all settings and inputs."}</small>
            </span>
            <Button icon="save" onClick={() => savePresentation()} variant="secondary">
              {activeSavedId ? "Update" : "Save"}
            </Button>
          </div>
          {saveConfirmation && <div aria-live="polite" className="save-confirmation"><Icon name="check" size={17} />{saveConfirmation}</div>}

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
    const pace = isOver ? "over" : progress >= 80 ? "near" : "neutral";
    const cueActive =
      hapticsEnabled &&
      isRunning &&
      sectionElapsed < current.target &&
      current.target - sectionElapsed <= 5;
    return (
      <main
        className={`present-screen present-screen--${pace} present-screen--${displayStyle} timer-color--${colorMode} ${cueActive ? "present-screen--cue" : ""}`}
        onClick={revealExactTime}
      >
        <div className="present-screen__top">
          <Button className="present-home-button" icon="home" onClick={goHome} variant="ghost">
            Home
          </Button>
          <div className="present-screen__top-actions">
            <div className="present-screen__meta">
              {displayStyle !== "minimal" && (
                <span>Section {activeIndex + 1} of {sections.length}</span>
              )}
              {displayStyle === "detailed" && (
                <span>Total {formatTime(totalElapsed)} / {formatTime(totalTarget)}</span>
              )}
            </div>
            <Button
              ariaLabel="Customize timer display"
              className="timer-settings-button present-settings-button"
              icon="timer-settings-brush"
              onClick={() => openSettings("present")}
              title="Customize timer display"
              variant="ghost"
            />
          </div>
        </div>

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
              <strong>{current.speaker}</strong>
            </span>
          )}
          <h1>{current.name}</h1>
          <div className="present-progress" aria-label={`${Math.round(progress)} percent of section target`}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className={`present-exact-time ${exactTimeVisible || displayStyle !== "minimal" ? "present-exact-time--visible" : ""}`}>
            {isOver
              ? `+${formatTime(sectionElapsed - current.target)}`
              : `${formatTime(sectionElapsed)} / ${formatTime(current.target)}`}
          </div>
          {displayStyle === "detailed" && (
            <div className="present-detail-status">
              {isOver ? "Over target" : progress >= 80 ? "Approaching target" : "On pace"}
            </div>
          )}
          {displayStyle === "minimal" && isOver && !exactTimeVisible && (
            <span className="present-overtime">+{formatTime(sectionElapsed - current.target)}</span>
          )}
          {!isLast && presentationMode === "group" ? (
            <div className="present-next present-next--speaker">
              <small>Up next</small>
              <strong>{sections[activeIndex + 1].speaker}</strong>
              <span>
                {sections[activeIndex + 1].name}
                {displayStyle === "detailed" && ` · ${formatTime(sections[activeIndex + 1].target)}`}
              </span>
            </div>
          ) : !isLast ? (
            <div className="present-next">
              <span>
                Next: {sections[activeIndex + 1].name}
                {displayStyle === "detailed" && ` · ${formatTime(sections[activeIndex + 1].target)}`}
              </span>
            </div>
          ) : (
            <div className="present-next"><span>Final section</span></div>
          )}
        </section>

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
        <AppHeader onHome={goHome} onSettings={() => openSettings("presentation-summary")} />
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
                    {presentationMode === "group" && <small>{section.speaker}</small>}
                  </span>
                  <time>{formatTime(actualTimes[index] || 0)} / {formatTime(section.target)}</time>
                </div>
              ))}
            </div>
          )}

          {liveRunSaved && (
            <div className="history-entry">
              <div>
                <span className="live-badge">Live</span>
                <strong>{title}</strong>
              </div>
              <span>{formatTime(liveTotal)} · Saved just now</span>
            </div>
          )}
        </section>
        <div className="review-actions">
          <Button
            className="button--full"
            icon="check"
            onClick={() => setLiveRunSaved(true)}
            disabled={liveRunSaved}
          >
            {liveRunSaved ? "Saved to history" : "Save run"}
          </Button>
          <Button className="button--full" onClick={() => setScreen("ready")} variant="secondary">
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
      <main className={`timer-screen mode--${presentationMode} timer-color--${colorMode} ${isOver ? "timer-screen--over" : ""}`}>
        <header className="timer-header">
          <Button className="home-button" icon="home" onClick={goHome} variant="ghost">
            Home
          </Button>
          <Button
            ariaLabel="Customize timer display"
            className="timer-settings-button"
            icon="timer-settings-brush"
            onClick={() => openSettings("rehearse")}
            title="Customize timer display"
            variant="ghost"
          />
        </header>
        <section className="timer-content">
          <div className="timer-position">
            <span>{isLast ? "Last section" : `Section ${activeIndex + 1} of ${sections.length}`}</span>
            <span>Total {formatTime(totalElapsed)} / {formatTime(totalTarget)}</span>
          </div>
          <div className="total-progress"><span style={{ width: `${Math.min(100, (totalElapsed / totalTarget) * 100)}%` }} /></div>
          <div className="current-section rehearsal-section-transition" key={`section-heading-${current.id}`}>
            <div className="eyebrow">
              {presentationMode === "group" ? (
                <>
                  <span>Presenting</span>
                  <strong>{current.speaker}</strong>
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
              <span>{isOver ? "Over by" : "Time remaining"}</span>
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
              <strong>{sections[activeIndex + 1].speaker}</strong>
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
          <button className="end-link" onClick={() => finishRehearsal()} type="button">End rehearsal</button>
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
  const speakerResults = speakers.map((speaker) => {
    const assignedSections = sections
      .map((section, index) => ({ section, index }))
      .filter(({ section }) => section.speaker === speaker);
    return {
      speaker,
      target: assignedSections.reduce((total, { section }) => total + section.target, 0),
      actual: assignedSections.reduce((total, { index }) => total + (actualTimes[index] || 0), 0),
    };
  }).filter((result) => result.target > 0);
  const largestSpeakerTime = Math.max(1, ...speakerResults.map((result) => result.actual));
  return (
    <main className={`app-shell review-screen mode--${presentationMode}`}>
      <AppHeader onHome={goHome} onSettings={() => openSettings("review")} />
      <section className="page-content">
        <h1>Your pacing</h1>
        <p className="review-title">{title}</p>

        <div className="results-hero">
          <span>Actual time</span>
          <strong>{formatTime(actualTotal)}</strong>
          <div className={`status status--${Math.abs(totalDifference) <= 10 ? "on" : totalDifference > 0 ? "over" : "under"}`}>
            <Icon name={Math.abs(totalDifference) <= 10 ? "check" : "warning"} size={18} />
            {Math.abs(totalDifference) <= 10
              ? "On time"
              : `${totalDifference > 0 ? "+" : "−"}${formatTime(Math.abs(totalDifference))} ${totalDifference > 0 ? "over" : "under"}`}
          </div>
          <small>{formatTime(totalTarget)} target</small>
        </div>

        {presentationMode === "group" && (
          <section className="speaker-results">
            <div className="result-heading">
              <div>
                <h2>Speaking time</h2>
                <span>Compare pacing across the team</span>
              </div>
              <span>Actual / target</span>
            </div>
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
            const actual = actualTimes[index] || 0;
            const difference = actual - section.target;
            const status = Math.abs(difference) <= 10 ? "on" : difference > 0 ? "over" : "under";
            return (
              <article className="result-row" key={section.id}>
                <span className={`result-row__icon result-row__icon--${status}`}>
                  <Icon name={status === "on" ? "check" : "warning"} size={18} />
                </span>
                <div className="result-row__name">
                  <strong>{section.name}</strong>
                  <span>
                    {presentationMode === "group" && section.speaker && `${section.speaker} · `}
                    {formatTime(actual)} actual · {formatTime(section.target)} target
                  </span>
                </div>
                <div className={`result-row__status result-row__status--${status}`}>
                  {status === "on"
                    ? "On time"
                    : `${difference > 0 ? "+" : "−"}${formatTime(Math.abs(difference))}`}
                  <small>{status !== "on" && status}</small>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <div className="review-actions">
        <Button className="button--full" icon="play" onClick={startRehearsal}>Rehearse again</Button>
        <Button className="button--full" onClick={resetToSetup} variant="secondary">Adjust setup</Button>
      </div>
    </main>
  );
}
