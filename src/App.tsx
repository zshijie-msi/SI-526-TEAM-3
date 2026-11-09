import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from "react";
import tickTockIcon from "./assets/tick-tock-icon.png";
import tickTockWordmark from "./assets/tick-tock-wordmark.png";

type Section = {
  id: number;
  name: string;
  target: number;
  speaker?: string;
};

type Screen = "concepts" | "setup" | "ready" | "rehearse" | "review";
type PresentationMode = "individual" | "group";
type IconName =
  | "arrow-left"
  | "check"
  | "chevron-right"
  | "clock"
  | "edit"
  | "grip"
  | "pause"
  | "play"
  | "plus"
  | "sound-off"
  | "trash"
  | "user"
  | "users"
  | "warning";

const INITIAL_SECTIONS: Section[] = [
  { id: 1, name: "Intro", target: 10, speaker: "Maya" },
];

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    "arrow-left": <><path d="m15 18-6-6 6-6" /><path d="M9 12h10" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    "chevron-right": <path d="m9 18 6-6-6-6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    edit: <><path d="M12 20h9" /><path d="m16.5 3.5 4 4L9 19l-5 1 1-5Z" /></>,
    grip: <><circle cx="9" cy="5" r=".8" fill="currentColor" stroke="none" /><circle cx="15" cy="5" r=".8" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r=".8" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r=".8" fill="currentColor" stroke="none" /><circle cx="9" cy="19" r=".8" fill="currentColor" stroke="none" /><circle cx="15" cy="19" r=".8" fill="currentColor" stroke="none" /></>,
    pause: <><path d="M9 5v14" /><path d="M15 5v14" /></>,
    play: <path d="m8 5 11 7-11 7Z" />,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    "sound-off": <><path d="M11 5 6 9H3v6h3l5 4Z" /><path d="m16 9 5 6" /><path d="m21 9-5 6" /></>,
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
}: {
  children?: ReactNode;
  className?: string;
  icon?: IconName;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={`button button--${variant} ${className}`}
      disabled={disabled}
      onClick={onClick}
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

function AppHeader({ onHome }: { onHome: () => void }) {
  return (
    <header className="app-header">
      <Brand onClick={onHome} />
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

export default function App() {
  const [screen, setScreen] = useState<Screen>("concepts");
  const [presentationMode, setPresentationMode] = useState<PresentationMode>("individual");
  const [title, setTitle] = useState("Wolverine Venture Pitch");
  const [sections, setSections] = useState<Section[]>(INITIAL_SECTIONS);
  const [speakers, setSpeakers] = useState(["Maya", "Jordan", "Alex"]);
  const [newSpeaker, setNewSpeaker] = useState("");
  const [sharedSession, setSharedSession] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftTime, setDraftTime] = useState("");
  const [draftSpeaker, setDraftSpeaker] = useState("");
  const [formError, setFormError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [sectionElapsed, setSectionElapsed] = useState(0);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [actualTimes, setActualTimes] = useState<number[]>([]);
  const [isIncomplete, setIsIncomplete] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragAnnouncement, setDragAnnouncement] = useState("");
  const nextId = useRef(2);
  // Millisecond clock independent of the number of timer callbacks executed.
  const clock = useRef({ totalMs: 0, sectionMs: 0, since: null as number | null });

  const totalTarget = useMemo(
    () => sections.reduce((total, section) => total + section.target, 0),
    [sections],
  );

  // Use actual elapsed time: background tabs and throttled timers cannot create drift.
  const snapshot = () => {
    const now = performance.now();
    const extra = clock.current.since === null ? 0 : now - clock.current.since;
    return {
      totalMs: clock.current.totalMs + extra,
      sectionMs: clock.current.sectionMs + extra,
    };
  };

  const freezeClock = () => {
    const { totalMs, sectionMs } = snapshot();
    clock.current = { totalMs, sectionMs, since: null };
    setTotalElapsed(totalMs / 1000);
    setSectionElapsed(sectionMs / 1000);
    return { totalMs, sectionMs };
  };

  useEffect(() => {
    if (!isRunning || screen !== "rehearse") return;
    const update = () => {
      const elapsed = clock.current.since === null ? 0 : performance.now() - clock.current.since;
      setSectionElapsed((clock.current.sectionMs + elapsed) / 1000);
      setTotalElapsed((clock.current.totalMs + elapsed) / 1000);
    };
    update();
    const timer = window.setInterval(update, 200);
    return () => window.clearInterval(timer);
  }, [isRunning, screen]);

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

  const handleDragMove = (event: PointerEvent<HTMLButtonElement>) => {
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
    event: KeyboardEvent<HTMLButtonElement>,
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
    setActiveIndex(0);
    setSectionElapsed(0);
    setTotalElapsed(0);
    setActualTimes([]);
    setIsIncomplete(false);
    setIsRunning(true);
    setScreen("rehearse");
    window.scrollTo(0, 0);
  };

  const pauseOrResume = () => {
    if (isRunning) {
      freezeClock();
      setIsRunning(false);
    } else {
      clock.current.since = performance.now();
      setIsRunning(true);
    }
  };

  const finishRehearsal = (incomplete = true) => {
    const { sectionMs } = freezeClock();
    setIsRunning(false);
    setActualTimes((current) => {
      const next = [...current];
      next[activeIndex] = sectionMs / 1000;
      return next;
    });
    setIsIncomplete(incomplete);
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
      setIsIncomplete(false);
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

  const addSpeaker = () => {
    const name = newSpeaker.trim();
    if (!name || speakers.some((speaker) => speaker.toLowerCase() === name.toLowerCase())) return;
    setSpeakers((current) => [...current, name]);
    setNewSpeaker("");
  };

  if (screen === "concepts") {
    return (
      <main className="concept-gallery">
        <header className="gallery-header">
          <Brand onClick={goHome} />
        </header>
        <section className="gallery-content">
          <div className="gallery-intro">
            <h1>How are you rehearsing?</h1>
            <p>Choose a setup to begin.</p>
          </div>
          <div className="concept-grid">
            {MODES.map((mode) => (
              <button
                className={`concept-card concept-card--${mode.id}`}
                key={mode.id}
                onClick={() => {
                  setPresentationMode(mode.id);
                  setScreen("setup");
                  window.scrollTo(0, 0);
                }}
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

  if (screen === "setup") {
    return (
      <main className={`app-shell mode--${presentationMode}`}>
        <AppHeader onHome={goHome} />
        <div className="direction-strip">
          <button onClick={() => setScreen("concepts")} type="button">
            <Icon name="arrow-left" size={17} /> Change mode
          </button>
          <span>{presentationMode} presentation</span>
        </div>
        <section className="page-content">
          <h1>{presentationMode === "group" ? "Group setup" : "Presentation setup"}</h1>

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
                <Button icon="plus" onClick={addSpeaker} variant="secondary">Add</Button>
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
                    <select onChange={(event) => setDraftSpeaker(event.target.value)} value={draftSpeaker}>
                      {speakers.map((speaker) => <option key={speaker}>{speaker}</option>)}
                    </select>
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
        <AppHeader onHome={goHome} />
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
          {presentationMode === "group" && (
            <div className="shared-session">
              <div className="shared-session__icon"><Icon name="sound-off" /></div>
              <div>
                <strong>{sharedSession ? "Team room is ready" : "Rehearse together"}</strong>
                <span>
                  {sharedSession
                    ? "Room BLUE-42 · 1 of 3 joined"
                    : "Sync teammates to this rehearsal."}
                </span>
              </div>
              <Button
                onClick={() => {
                  if (sharedSession) {
                    void navigator.clipboard?.writeText("Join our Tick-Tock rehearsal: BLUE-42");
                    setInviteCopied(true);
                  } else {
                    setSharedSession(true);
                  }
                }}
                variant={sharedSession ? "primary" : "secondary"}
              >
                {sharedSession ? (inviteCopied ? "Invite copied" : "Copy invite") : "Create room"}
              </Button>
            </div>
          )}
          <div className="timeline">
            {sections.map((section, index) => (
              <div className="timeline-block" key={section.id}>
                <div className="timeline-row">
                  <span className="timeline__number">{index + 1}</span>
                  <span className="timeline__content">
                    <strong>{section.name}</strong>
                    {presentationMode === "group" && <small>{section.speaker}</small>}
                  </span>
                  <time>{formatTime(section.target)}</time>
                </div>
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
        </section>
        <div className="sticky-action sticky-action--light">
          <Button className="button--full button--tall" icon="play" onClick={startRehearsal}>
            Start rehearsal
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
      <main className={`timer-screen mode--${presentationMode} ${isOver ? "timer-screen--over" : ""}`}>
        <header className="timer-header">
          <Brand onClick={goHome} />
          <span className="sound-pill"><Icon name="sound-off" size={17} /> Sound off</span>
        </header>
        <section className="timer-content">
          <div className="timer-position">
            <span>{isLast ? "Last section" : `Section ${activeIndex + 1} of ${sections.length}`}</span>
            <span>Total {formatTime(totalElapsed)} / {formatTime(totalTarget)}</span>
          </div>
          <div className="total-progress"><span style={{ width: `${Math.min(100, (totalElapsed / totalTarget) * 100)}%` }} /></div>
          <div className="current-section">
            <div className="eyebrow">
              {presentationMode === "group" ? `${current.speaker} is presenting` : "Now presenting"}
            </div>
            <h1>{current.name}</h1>
          </div>
          <div className="timer-dial" style={{ "--progress": `${progress * 3.6}deg` } as CSSProperties}>
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
              <strong>
                {sections[activeIndex + 1].speaker === current.speaker
                  ? `${current.speaker} continues`
                  : `Handoff to ${sections[activeIndex + 1].speaker}`}
              </strong>
              <small>{sections[activeIndex + 1].name}</small>
            </div>
          )}
          <div className="timer-controls">
            <Button
              className="pause-button"
              icon={isRunning ? "pause" : "play"}
              onClick={pauseOrResume}
              variant="secondary"
            >
              {isRunning ? "Pause" : "Resume"}
            </Button>
            <Button className="next-button" onClick={nextSection}>
              {isLast ? "Finish" : "Next section"} <Icon name="chevron-right" />
            </Button>
          </div>
          <button className="end-link" onClick={() => finishRehearsal(true)} type="button">End rehearsal</button>
        </section>
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
      <AppHeader onHome={goHome} />
      <section className="page-content">
        <h1>Your pacing</h1>
        <p className="review-title">{title}</p>
        {isIncomplete && <p className="incomplete-note"><Icon name="warning" size={16} /> Incomplete rehearsal</p>}

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
