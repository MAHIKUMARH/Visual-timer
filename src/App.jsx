import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { RotaryDial } from "./RotaryDial";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/ui/loading-screen";
import {
  initAudio,
  playAsmrTick,
  playAsmrPop,
  playStartChime,
  playPauseSound,
  playSoftTick,
  playHighAlarm,
  stopHighAlarm,
} from "./audio";
import "./styles.css";

const DEFAULT_PRESETS = [
  { id: "default-pomodoro", name: "Pomodoro Focus", mode: "countdown", duration: 25 * 60, work: 25, rest: 5, cycles: 1 },
  { id: "default-deep", name: "Deep Work Sprint", mode: "countdown", duration: 45 * 60, work: 45, rest: 10, cycles: 1 },
  { id: "default-quick", name: "Quick Brainstorm", mode: "countdown", duration: 10 * 60, work: 10, rest: 2, cycles: 1 },
  { id: "default-workout", name: "HIIT Workout", mode: "interval", duration: 60, work: 1, rest: 30, cycles: 6 },
  { id: "default-nap", name: "Power Nap", mode: "countdown", duration: 20 * 60, work: 20, rest: 5, cycles: 1 },
];

const HISTORY_KEY = "visualTimerHistory";
const PRESETS_KEY = "visualTimerPresets";
const THEME_KEY = "visualTimerTheme";
const DARK_KEY = "visualTimerDarkMode";
const SETTINGS_KEY = "visualTimerSettings";
const TIMER_NAME_KEY = "visualTimerCustomName";

const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || min));

const formatTime = (seconds, showHours = false) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (showHours || h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

const formatDuration = (seconds) => {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const minutes = Math.floor(s / 60);
  const hours = Math.floor(minutes / 60);
  if (hours) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
};

const modeLabel = (mode) =>
  ({ countdown: "Countdown", pomodoro: "Pomodoro", interval: "Interval", stopwatch: "Stopwatch" }[mode] || mode);

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// Background worker code to guarantee tick precision without browser tab throttling
const WORKER_BLOB_CODE = `
  let intervalId = null;
  self.onmessage = function(e) {
    if (e.data === "start") {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        self.postMessage("tick");
      }, 250);
    } else if (e.data === "stop") {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
    }
  };
`;

function App() {
  const [mode, setMode] = useState("countdown");
  const [countdownMinutes, setCountdownMinutes] = useState(25);
  const [pomodoroMinutes, setPomodoroMinutes] = useState(25);
  const [pomodoroPhase, setPomodoroPhase] = useState("work");
  const [intervalWork, setIntervalWork] = useState(1);
  const [intervalRest, setIntervalRest] = useState(30);
  const [intervalCycles, setIntervalCycles] = useState(4);
  const [currentCycle, setCurrentCycle] = useState(1);
  const [intervalPhase, setIntervalPhase] = useState("work");
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const [showLoading, setShowLoading] = useState(true);
  const completeLoading = useCallback(() => setShowLoading(false), []);
  const [customTimerName, setCustomTimerName] = useState(() => localStorage.getItem(TIMER_NAME_KEY) || "Focus Sprint");
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "forest");
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem(DARK_KEY);
    return stored === null ? false : stored === "true";
  });

  // Sound & ASMR settings
  const [settings, setSettings] = useState(() => {
    const defaultSettings = {
      muted: false,
      alertStyle: "sound",
      volume: 0.85,
      alarmVolume: 1.0,
      ambientTick: false,
      notificationsEnabled: false,
      compactFullscreen: false,
    };
    return readStorage(SETTINGS_KEY, defaultSettings);
  });

  const [fullscreen, setFullscreen] = useState(false);
  const [showTopbarActions, setShowTopbarActions] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [presets, setPresets] = useState(() => readStorage(PRESETS_KEY, DEFAULT_PRESETS));
  const [history, setHistory] = useState(() => readStorage(HISTORY_KEY, []));
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [editHours, setEditHours] = useState(0);
  const [editMinutes, setEditMinutes] = useState(25);
  const [editSeconds, setEditSeconds] = useState(0);
  const [tempTimerName, setTempTimerName] = useState("");
  const [presetNameInput, setPresetNameInput] = useState("");
  const [toastMessage, setToastMessage] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);

  // Background timer references
  const targetEndTimeRef = useRef(null);
  const topbarMenuRef = useRef(null);
  const workerRef = useRef(null);
  const lastTickTimeRef = useRef(Date.now());
  const sessionStartedAtRef = useRef(null);

  // Persist state to LocalStorage
  useEffect(() => localStorage.setItem(THEME_KEY, theme), [theme]);
  useEffect(() => localStorage.setItem(DARK_KEY, darkMode), [darkMode]);
  useEffect(() => localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)), [presets]);
  useEffect(() => localStorage.setItem(HISTORY_KEY, JSON.stringify(history)), [history]);
  useEffect(() => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)), [settings]);
  useEffect(() => localStorage.setItem(TIMER_NAME_KEY, customTimerName), [customTimerName]);

  useEffect(() => {
    if (!showTopbarActions) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!topbarMenuRef.current?.contains(event.target)) setShowTopbarActions(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setShowTopbarActions(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [showTopbarActions]);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3200);
  }, []);

  // Capture PWA install prompt
  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  const triggerInstallApp = async () => {
    if (!installPrompt) {
      showToast("App is ready to use offline in your browser!");
      return;
    }
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setInstallPrompt(null);
      showToast("Visual Timer installed successfully!");
    }
  };

  // Check URL shareable parameters on mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const sharedMode = params.get("mode");
      const sharedName = params.get("name");
      const sharedDuration = params.get("duration");
      const sharedWork = params.get("work");
      const sharedRest = params.get("rest");
      const sharedCycles = params.get("cycles");
      const sharedTheme = params.get("theme");

      if (sharedTheme && ["forest", "ocean", "violet", "sunset", "midnight"].includes(sharedTheme)) {
        setTheme(sharedTheme);
      }
      if (sharedName) {
        setCustomTimerName(decodeURIComponent(sharedName));
      }
      if (sharedMode && ["countdown", "pomodoro", "interval", "stopwatch"].includes(sharedMode)) {
        setMode(sharedMode);
        if (sharedMode === "countdown" && sharedDuration) {
          const mins = clamp(Math.round(Number(sharedDuration) / 60), 1, 60);
          setCountdownMinutes(mins);
          setTimeLeft(mins * 60);
        } else if (sharedMode === "pomodoro" && sharedWork) {
          const mins = clamp(Number(sharedWork), 1, 120);
          setPomodoroMinutes(mins);
          setTimeLeft(mins * 60);
        } else if (sharedMode === "interval") {
          const w = clamp(Number(sharedWork) || 1, 1, 60);
          const r = clamp(Number(sharedRest) || 30, 5, 600);
          const c = clamp(Number(sharedCycles) || 4, 1, 50);
          setIntervalWork(w);
          setIntervalRest(r);
          setIntervalCycles(c);
          setTimeLeft(w * 60);
        }
        showToast(`Loaded preset "${sharedName || modeLabel(sharedMode)}" from shared link`);
      }
    } catch {}
  }, [showToast]);

  // Request browser notification permission
  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      showToast("Browser notifications are not supported on this device.");
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      setSettings((s) => ({ ...s, notificationsEnabled: true }));
      showToast("Notifications enabled! You'll be alerted when time's up.");
    } else {
      setSettings((s) => ({ ...s, notificationsEnabled: false }));
      showToast("Notification permission was denied.");
    }
  };

  const sendBrowserNotification = useCallback(() => {
    if (!settings.notificationsEnabled || !("Notification" in window) || Notification.permission !== "granted") {
      return;
    }
    try {
      new Notification("⏰ TIME'S UP!", {
        body: `${customTimerName}: Your visual countdown has completed!`,
        icon: "/icon-192.svg",
        vibrate: [200, 100, 200, 100, 300],
        tag: "visual-timer-alarm",
      });
    } catch {}
  }, [customTimerName, settings.notificationsEnabled]);

  // Calculate duration
  const getCurrentDuration = useCallback(() => {
    if (mode === "countdown") return countdownMinutes * 60;
    if (mode === "pomodoro") return (pomodoroPhase === "work" ? pomodoroMinutes : 5) * 60;
    if (mode === "interval") return intervalPhase === "work" ? intervalWork * 60 : intervalRest;
    return Math.max(1, elapsedTime || 1);
  }, [mode, countdownMinutes, pomodoroPhase, pomodoroMinutes, intervalPhase, intervalWork, intervalRest, elapsedTime]);

  const progress = useMemo(() => {
    if (mode === "stopwatch") return ((elapsedTime % 3600) / 3600) * 100;
    const duration = getCurrentDuration();
    return duration ? clamp((timeLeft / Math.max(3600, duration)) * 100, 0, 100) : 0;
  }, [mode, getCurrentDuration, timeLeft, elapsedTime]);

  // Record history
  const addHistory = useCallback(
    (completed = true, customDuration = null) => {
      const started = sessionStartedAtRef.current || Date.now();
      const configured = customDuration ?? getCurrentDuration();
      const actual = mode === "stopwatch" ? elapsedTime : Math.max(0, configured - timeLeft);
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        name: customTimerName,
        date: new Date().toISOString(),
        mode,
        duration: Math.max(0, Math.round(actual || configured)),
        configuredDuration: Math.max(0, Math.round(configured)),
        completed,
        startedAt: new Date(started).toISOString(),
        theme,
      };
      setHistory((prev) => [entry, ...prev].slice(0, 500));
    },
    [customTimerName, getCurrentDuration, mode, elapsedTime, timeLeft, theme]
  );

  // Complete timer and trigger the selected alert.
  const completeTimer = useCallback(() => {
    if (settings.alertStyle === "loud") {
      playHighAlarm(settings.muted, settings.alarmVolume);
    } else if (settings.alertStyle !== "silent") {
      playStartChime(settings.muted, settings.volume);
    }
    sendBrowserNotification();

    if (mode === "countdown") {
      addHistory(true, countdownMinutes * 60);
      setRunning(false);
      setPaused(false);
      setFinished(true);
      setTimeLeft(0);
      return;
    }
    if (mode === "pomodoro") {
      addHistory(true, (pomodoroPhase === "work" ? pomodoroMinutes : 5) * 60);
      if (pomodoroPhase === "work") {
        setPomodoroPhase("break");
        setTimeLeft(5 * 60);
        showToast("Great focus! Take a 5-minute break.");
      } else {
        setPomodoroPhase("work");
        setTimeLeft(pomodoroMinutes * 60);
        showToast("Break over. Ready for another focus sprint!");
      }
      setFinished(true);
      return;
    }
    if (mode === "interval") {
      if (intervalPhase === "work") {
        setIntervalPhase("rest");
        setTimeLeft(intervalRest);
        return;
      }
      if (currentCycle >= intervalCycles) {
        addHistory(true, (intervalWork * 60 + intervalRest) * intervalCycles);
        setRunning(false);
        setPaused(false);
        setFinished(true);
        setTimeLeft(0);
        return;
      }
      setCurrentCycle((prev) => prev + 1);
      setIntervalPhase("work");
      setTimeLeft(intervalWork * 60);
    }
  }, [
    settings.muted,
    settings.alertStyle,
    settings.alarmVolume,
    settings.volume,
    sendBrowserNotification,
    mode,
    countdownMinutes,
    addHistory,
    pomodoroPhase,
    pomodoroMinutes,
    showToast,
    intervalPhase,
    intervalRest,
    currentCycle,
    intervalCycles,
    intervalWork,
  ]);

  const stopAlarmAndDismiss = useCallback(() => {
    stopHighAlarm();
    setFinished(false);
    playAsmrPop(settings.muted, settings.volume);
  }, [settings.muted, settings.volume]);

  // Setup Web Worker for background precision
  useEffect(() => {
    try {
      const blob = new Blob([WORKER_BLOB_CODE], { type: "application/javascript" });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);
      workerRef.current = worker;

      worker.onmessage = () => {
        if (!running || paused) return;

        if (mode === "stopwatch") {
          if (sessionStartedAtRef.current !== null) {
            setElapsedTime(Math.floor((Date.now() - sessionStartedAtRef.current) / 1000));
          }
          return;
        }

        if (targetEndTimeRef.current !== null) {
          const now = Date.now();
          const remaining = Math.max(0, Math.ceil((targetEndTimeRef.current - now) / 1000));
          setTimeLeft(remaining);

          // Optional subtle ASMR ambient tick
          if (settings.ambientTick && Math.floor(now / 1000) !== Math.floor(lastTickTimeRef.current / 1000)) {
            playSoftTick(settings.muted, settings.volume);
          }
          lastTickTimeRef.current = now;

          if (remaining <= 0) {
            targetEndTimeRef.current = null;
            completeTimer();
          }
        }
      };

      return () => {
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
      };
    } catch {
      // Fallback if workers are blocked
      return undefined;
    }
  }, [running, paused, mode, completeTimer, settings.ambientTick, settings.muted, settings.volume]);

  // Manage Worker start/stop
  useEffect(() => {
    if (running && !paused) {
      if (mode !== "stopwatch" && !targetEndTimeRef.current) {
        targetEndTimeRef.current = Date.now() + timeLeft * 1000;
      }
      workerRef.current?.postMessage("start");
    } else {
      targetEndTimeRef.current = null;
      workerRef.current?.postMessage("stop");
    }
  }, [running, paused, timeLeft, mode]);

  // Listen to visibilitychange: Keep timer running & resync instantly when returning to tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && running && !paused && targetEndTimeRef.current) {
        const remaining = Math.max(0, Math.ceil((targetEndTimeRef.current - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (remaining <= 0) {
          targetEndTimeRef.current = null;
          completeTimer();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [running, paused, completeTimer]);

  // Update document title with remaining countdown
  useEffect(() => {
    const display = mode === "stopwatch" ? elapsedTime : timeLeft;
    if (finished) {
      document.title = "⏰ TIME'S UP! · Visual Timer";
    } else if (running && !paused) {
      document.title = `(${formatTime(display)}) ${customTimerName} · Visual Timer`;
    } else if (paused) {
      document.title = `❚❚ [Paused] ${formatTime(display)} · Visual Timer`;
    } else {
      document.title = "Visual Timer · Focus Visually";
    }
  }, [finished, running, paused, mode, elapsedTime, timeLeft, customTimerName]);

  // Timer controls
  const startTimer = () => {
    initAudio();
    if (finished) {
      stopHighAlarm();
      setFinished(false);
    }
    playStartChime(settings.muted, settings.volume);
    targetEndTimeRef.current = Date.now() + timeLeft * 1000;
    sessionStartedAtRef.current = mode === "stopwatch" ? Date.now() - elapsedTime * 1000 : Date.now();
    setRunning(true);
    setPaused(false);
  };

  const pauseTimer = () => {
    if (mode === "stopwatch" && sessionStartedAtRef.current) {
      setElapsedTime(Math.floor((Date.now() - sessionStartedAtRef.current) / 1000));
      sessionStartedAtRef.current = null;
    }
    playPauseSound(settings.muted, settings.volume);
    setPaused(true);
    targetEndTimeRef.current = null;
  };

  const resumeTimer = () => {
    playStartChime(settings.muted, settings.volume);
    if (mode === "stopwatch") {
      sessionStartedAtRef.current = Date.now() - elapsedTime * 1000;
    }
    targetEndTimeRef.current = Date.now() + timeLeft * 1000;
    setPaused(false);
    setRunning(true);
  };

  const resetTimer = () => {
    stopHighAlarm();
    playAsmrPop(settings.muted, settings.volume, 0.9);
    if (running || paused) addHistory(false);
    setRunning(false);
    setPaused(false);
    setFinished(false);
    targetEndTimeRef.current = null;
    sessionStartedAtRef.current = null;
    setCurrentCycle(1);
    setIntervalPhase("work");
    setPomodoroPhase("work");
    setElapsedTime(0);

    if (mode === "countdown") setTimeLeft(countdownMinutes * 60);
    if (mode === "pomodoro") setTimeLeft(pomodoroMinutes * 60);
    if (mode === "interval") setTimeLeft(intervalWork * 60);
    if (mode === "stopwatch") setTimeLeft(0);
  };

  const changeMode = (newMode) => {
    stopHighAlarm();
    playAsmrPop(settings.muted, settings.volume, 1.1);
    setMode(newMode);
    setRunning(false);
    setPaused(false);
    setFinished(false);
    targetEndTimeRef.current = null;
    sessionStartedAtRef.current = null;
    setCurrentCycle(1);
    setIntervalPhase("work");
    setPomodoroPhase("work");
    setElapsedTime(0);

    if (newMode === "countdown") setTimeLeft(countdownMinutes * 60);
    if (newMode === "pomodoro") setTimeLeft(pomodoroMinutes * 60);
    if (newMode === "interval") setTimeLeft(intervalWork * 60);
    if (newMode === "stopwatch") setTimeLeft(0);
  };

  const updateCountdownMinutes = (value) => {
    const v = clamp(value, 1, 60);
    setCountdownMinutes(v);
    if ((!running || paused) && mode === "countdown") {
      setTimeLeft(v * 60);
    }
  };

  const openTimeEditor = useCallback(() => {
    const currentTotal = mode === "stopwatch" ? elapsedTime : timeLeft;
    const h = Math.floor(currentTotal / 3600);
    const m = Math.floor((currentTotal % 3600) / 60);
    const s = currentTotal % 60;
    setEditHours(h);
    setEditMinutes(m);
    setEditSeconds(s);
    setShowTimeModal(true);
    playAsmrPop(settings.muted, settings.volume);
  }, [mode, elapsedTime, timeLeft, settings.muted, settings.volume]);

  const applyCustomTime = (h, m, s) => {
    const safeH = clamp(h, 0, 99);
    const safeM = clamp(m, 0, 59);
    const safeS = clamp(s, 0, 59);
    const total = Math.max(1, safeH * 3600 + safeM * 60 + safeS);

    if (mode === "countdown") {
      const mins = Math.max(1, Math.round(total / 60));
      setCountdownMinutes(mins);
      setTimeLeft(total);
      if (running && !paused) {
        targetEndTimeRef.current = Date.now() + total * 1000;
      }
    } else if (mode === "pomodoro") {
      const mins = Math.max(1, Math.round(total / 60));
      setPomodoroMinutes(mins);
      setTimeLeft(total);
      if (running && !paused) {
        targetEndTimeRef.current = Date.now() + total * 1000;
      }
    } else {
      setTimeLeft(total);
    }

    setShowTimeModal(false);
    playAsmrPop(settings.muted, settings.volume, 1.1);
    showToast(`Timer set to ${formatTime(total, total >= 3600)}`);
  };

  const nudgeTime = (deltaSeconds) => {
    setTimeLeft((prev) => {
      const next = Math.max(1, prev + deltaSeconds);
      if (running && !paused) {
        targetEndTimeRef.current = Date.now() + next * 1000;
      }
      if (mode === "countdown") {
        setCountdownMinutes(Math.max(1, Math.round(next / 60)));
      }
      return next;
    });
    playAsmrTick(settings.muted, settings.volume);
    const sign = deltaSeconds > 0 ? "+" : "";
    const label = Math.abs(deltaSeconds) >= 60 ? `${Math.round(deltaSeconds / 60)}m` : `${deltaSeconds}s`;
    showToast(`${sign}${label}`);
  };

  const skipInterval = () => {
    if (mode !== "interval") return;
    playAsmrPop(settings.muted, settings.volume);
    if (intervalPhase === "work") {
      setIntervalPhase("rest");
      setTimeLeft(intervalRest);
      return;
    }
    if (currentCycle >= intervalCycles) {
      completeTimer();
      return;
    }
    setCurrentCycle((v) => v + 1);
    setIntervalPhase("work");
    setTimeLeft(intervalWork * 60);
  };

  // Preset operations
  const saveCurrentPreset = () => {
    const name = presetNameInput.trim() || customTimerName;
    const newPreset = {
      id: `user-${Date.now()}`,
      name,
      mode,
      duration:
        mode === "countdown"
          ? countdownMinutes * 60
          : mode === "pomodoro"
          ? pomodoroMinutes * 60
          : mode === "interval"
          ? intervalWork * 60
          : elapsedTime,
      work: mode === "interval" ? intervalWork : pomodoroMinutes,
      rest: mode === "interval" ? intervalRest : 5,
      cycles: mode === "interval" ? intervalCycles : 1,
    };
    setPresets((prev) => [newPreset, ...prev]);
    setPresetNameInput("");
    setShowPresetModal(false);
    playAsmrPop(settings.muted, settings.volume);
    showToast(`Preset "${name}" saved!`);
  };

  const deletePreset = (id) => {
    playAsmrPop(settings.muted, settings.volume, 0.85);
    setPresets((prev) => prev.filter((p) => p.id !== id));
  };

  const resetPresetsToDefaults = () => {
    if (window.confirm("Are you sure you want to reset all presets back to defaults?")) {
      setPresets(DEFAULT_PRESETS);
      playAsmrPop(settings.muted, settings.volume);
      showToast("Presets restored to defaults");
    }
  };

  const loadPreset = (p) => {
    stopHighAlarm();
    playAsmrPop(settings.muted, settings.volume);
    setCustomTimerName(p.name);
    setMode(p.mode);
    setRunning(false);
    setPaused(false);
    setFinished(false);
    targetEndTimeRef.current = null;

    if (p.mode === "countdown") {
      const m = clamp(Math.round(p.duration / 60), 1, 60);
      setCountdownMinutes(m);
      setTimeLeft(m * 60);
    }
    if (p.mode === "pomodoro") {
      const m = Math.max(1, Math.round(p.duration / 60));
      setPomodoroMinutes(m);
      setTimeLeft(m * 60);
    }
    if (p.mode === "interval") {
      setIntervalWork(p.work || 1);
      setIntervalRest(p.rest || 30);
      setIntervalCycles(p.cycles || 1);
      setTimeLeft((p.work || 1) * 60);
    }
    if (p.mode === "stopwatch") {
      setTimeLeft(0);
      setElapsedTime(0);
    }
    showToast(`Loaded "${p.name}"`);
  };

  // Share timer via URL
  const copyShareLink = (targetPreset = null) => {
    const item = targetPreset || {
      mode,
      name: customTimerName,
      duration:
        mode === "countdown"
          ? countdownMinutes * 60
          : mode === "pomodoro"
          ? pomodoroMinutes * 60
          : intervalWork * 60,
      work: intervalWork,
      rest: intervalRest,
      cycles: intervalCycles,
    };

    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set("mode", item.mode);
    url.searchParams.set("name", item.name);
    url.searchParams.set("duration", item.duration);
    if (item.mode === "interval") {
      url.searchParams.set("work", item.work);
      url.searchParams.set("rest", item.rest);
      url.searchParams.set("cycles", item.cycles);
    }
    url.searchParams.set("theme", theme);

    navigator.clipboard
      .writeText(url.toString())
      .then(() => {
        playAsmrPop(settings.muted, settings.volume);
        showToast("Shareable link copied to clipboard! 📋");
      })
      .catch(() => {
        showToast("Failed to copy link. Check clipboard permissions.");
      });
  };

  // Toggle fullscreen
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {
      setFullscreen((v) => !v);
    }
  };

  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // Keyboard navigation & accessibility shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (["input", "textarea", "select"].includes(tag) || e.target?.isContentEditable) return;

      if (e.code === "Space") {
        e.preventDefault();
        initAudio();
        if (finished) stopAlarmAndDismiss();
        else if (!running) startTimer();
        else if (paused) resumeTimer();
        else pauseTimer();
      } else if (e.key === "Escape") {
        if (finished) {
          stopAlarmAndDismiss();
        } else if (showSettings) {
          setShowSettings(false);
        } else if (showStats) {
          setShowStats(false);
        } else if (showPresetModal) {
          setShowPresetModal(false);
        } else if (showRenameModal) {
          setShowRenameModal(false);
        } else if (showTimeModal) {
          setShowTimeModal(false);
        }
      } else if (e.key.toLowerCase() === "r") {
        resetTimer();
      } else if (e.key.toLowerCase() === "m") {
        setSettings((s) => {
          const nextMuted = !s.muted;
          showToast(nextMuted ? "Sound muted" : "Sound unmuted");
          return { ...s, muted: nextMuted };
        });
      } else if (e.key.toLowerCase() === "f") {
        toggleFullscreen();
      } else if (e.key.toLowerCase() === "h") {
        setShowStats((v) => !v);
      } else if (e.key.toLowerCase() === "s") {
        setShowSettings((v) => !v);
      } else if (e.key.toLowerCase() === "n") {
        skipInterval();
      } else if (mode === "countdown" && (!running || paused)) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          updateCountdownMinutes(countdownMinutes - (e.shiftKey ? 5 : 1));
          playAsmrTick(settings.muted, settings.volume);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          updateCountdownMinutes(countdownMinutes + (e.shiftKey ? 5 : 1));
          playAsmrTick(settings.muted, settings.volume);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    running,
    paused,
    finished,
    mode,
    countdownMinutes,
    showSettings,
    showStats,
    showPresetModal,
    showRenameModal,
    settings.muted,
    settings.volume,
    stopAlarmAndDismiss,
    showToast,
  ]);

  const clearHistory = () => {
    if (window.confirm("Clear all session history?")) {
      setHistory([]);
      showToast("History cleared");
    }
  };

  // Statistics calculation
  const stats = useMemo(() => {
    const completed = history.filter((h) => h.completed);
    const totalFocus = completed.reduce((sum, h) => sum + (h.duration || 0), 0);
    const totalSessions = history.length;
    const completionRate = totalSessions ? Math.round((completed.length / totalSessions) * 100) : 0;
    const byMode = completed.reduce((acc, h) => {
      acc[h.mode] = (acc[h.mode] || 0) + 1;
      return acc;
    }, {});
    const mostUsed = Object.entries(byMode).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    const today = new Date();
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const weekStart = dayStart - ((today.getDay() + 6) % 7) * 86400000;
    const todaySeconds = completed
      .filter((h) => new Date(h.date).getTime() >= dayStart)
      .reduce((s, h) => s + h.duration, 0);
    const weekSeconds = completed
      .filter((h) => new Date(h.date).getTime() >= weekStart)
      .reduce((s, h) => s + h.duration, 0);

    const daily = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart + i * 86400000);
      const start = d.getTime();
      const end = start + 86400000;
      const seconds = completed
        .filter((h) => {
          const t = new Date(h.date).getTime();
          return t >= start && t < end;
        })
        .reduce((s, h) => s + h.duration, 0);
      return { label: d.toLocaleDateString(undefined, { weekday: "short" }), seconds };
    });

    return { totalFocus, totalSessions, completed: completed.length, completionRate, mostUsed, todaySeconds, weekSeconds, daily };
  }, [history]);

  const timerLabel = finished
    ? "TIME'S UP"
    : mode === "countdown"
    ? "COUNTDOWN"
    : mode === "pomodoro"
    ? pomodoroPhase === "work"
      ? "WORK"
      : "REST"
    : mode === "interval"
    ? `${intervalPhase === "work" ? "WORK" : "REST"} (${currentCycle}/${intervalCycles})`
    : "STOPWATCH";

  const displayTime = mode === "stopwatch" ? elapsedTime : timeLeft;

  return (
    <>
    {showLoading && (
      <LoadingScreen
        theme={theme}
        darkMode={darkMode}
        onComplete={completeLoading}
      />
    )}
    <main
      className={`app theme-${theme} ${darkMode ? "dark-mode" : "light-mode"} ${
        finished ? "is-finished" : ""
      } ${running && !paused ? "is-running" : ""} ${paused ? "is-paused" : ""} ${
        fullscreen ? "fullscreen-mode" : ""
      } ${settings.compactFullscreen ? "compact-display" : ""}`}
    >
      {/* Top Bar */}
      <header className="topbar">
        <div className="brand-group">
          <div className="brand-title-row">
            <h1 className="brand">Visual Timer</h1>
          </div>
        </div>

        <div className={`topbar-action-menu ${showTopbarActions ? "is-open" : ""}`} ref={topbarMenuRef}>
          <button
            type="button"
            className="icon-button topbar-menu-trigger"
            onClick={() => setShowTopbarActions((open) => !open)}
            aria-label={showTopbarActions ? "Close actions menu" : "More actions"}
            aria-haspopup="menu"
            aria-expanded={showTopbarActions}
            aria-controls="topbar-action-items"
            title="More actions"
          >
            <span aria-hidden="true">⋮</span>
          </button>

          <div id="topbar-action-items" className="topbar-action-items" role="menu" aria-label="Timer actions">
            {installPrompt && (
              <button
                className="pwa-install-button"
                role="menuitem"
                onClick={() => {
                  setShowTopbarActions(false);
                  triggerInstallApp();
                }}
                title="Install Visual Timer on your device"
              >
                Install
              </button>
            )}

            <button
              className={`icon-button ${settings.muted ? "is-muted" : ""}`}
              role="menuitem"
              onClick={() => {
                setSettings((s) => ({ ...s, muted: !s.muted }));
                playAsmrPop(settings.muted, settings.volume);
                setShowTopbarActions(false);
              }}
              title={settings.muted ? "Unmute audio (M)" : "Mute audio (M)"}
              aria-label="Toggle mute"
            >
              {settings.muted ? "🔇" : "🔊"}
            </button>

            <button
              className="icon-button"
              role="menuitem"
              onClick={() => {
                copyShareLink();
                setShowTopbarActions(false);
              }}
              title="Copy shareable link for current timer"
              aria-label="Share timer"
            >
              ↗
            </button>

            <button
              className="icon-button"
              role="menuitem"
              onClick={() => {
                setShowStats((v) => !v);
                setShowSettings(false);
                setShowTopbarActions(false);
                playAsmrPop(settings.muted, settings.volume);
              }}
              title="Statistics & History (H)"
              aria-label="Toggle statistics"
            >
              ▥
            </button>

            <button
              className="icon-button"
              role="menuitem"
              onClick={() => {
                setShowSettings((v) => !v);
                setShowStats(false);
                setShowTopbarActions(false);
                playAsmrPop(settings.muted, settings.volume);
              }}
              title="Settings (S)"
              aria-label="Toggle settings"
            >
              ⚙
            </button>

            <button
              className="icon-button"
              role="menuitem"
              onClick={() => {
                toggleFullscreen();
                setShowTopbarActions(false);
                playAsmrPop(settings.muted, settings.volume);
              }}
              title="Toggle fullscreen (F)"
              aria-label="Toggle fullscreen"
            >
              ⛶
            </button>
          </div>
        </div>
      </header>

      {/* Main timer */}
      <section className="timer-layout">
        <div className="timer-card">
          {/* Mode Tabs */}
          <div className="mode-selector" role="tablist" aria-label="Timer modes">
            {[
              ["countdown", "Countdown"],
              ["pomodoro", "Pomodoro"],
              ["interval", "Interval"],
              ["stopwatch", "Stopwatch"],
            ].map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={mode === key}
                className={`mode-button ${mode === key ? "active" : ""}`}
                onClick={() => changeMode(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Interactive Rotary Dial Area */}
          <div className="timer-area">
            <RotaryDial
              minutes={countdownMinutes}
              onMinutesChange={updateCountdownMinutes}
              progress={progress}
              remainingSeconds={displayTime}
              duration={getCurrentDuration()}
              deadline={targetEndTimeRef.current}
              running={running}
              paused={paused}
              finished={finished}
              mode={mode}
              timerLabel={timerLabel}
              displayTimeFormatted={formatTime(displayTime, displayTime >= 3600)}
              customTimerName={customTimerName}
              onEditName={() => {
                setTempTimerName(customTimerName);
                setShowRenameModal(true);
              }}
              onEditTime={openTimeEditor}
              muted={settings.muted}
              volume={settings.volume}
              onStopAlarm={stopAlarmAndDismiss}
              isAlarmActive={finished}
            />

            {mode === "countdown" && (!running || paused) && (
              <div className="dial-adjuster" aria-label="Adjust timer duration">
                <button
                  type="button"
                  className="dial-adjust-button"
                  onClick={() => updateCountdownMinutes(countdownMinutes - 1)}
                  aria-label="Decrease duration by one minute"
                >
                  −
                </button>
                <span>{countdownMinutes} min</span>
                <button
                  type="button"
                  className="dial-adjust-button"
                  onClick={() => updateCountdownMinutes(countdownMinutes + 1)}
                  aria-label="Increase duration by one minute"
                >
                  +
                </button>
              </div>
            )}

            {/* Primary Action Buttons */}
            <div className="timer-controls">
              {!running && !finished && (
                <Button
                  className="primary-button cta-start"
                  onClick={startTimer}
                  aria-label="Start timer"
                >
                  <span className="btn-icon">▶</span> Start
                </Button>
              )}

              {running && !paused && (
                <Button
                  className="primary-button cta-pause"
                  onClick={pauseTimer}
                  aria-label="Pause timer"
                >
                  <span className="btn-icon">❚❚</span> Pause
                </Button>
              )}

              {running && paused && (
                <Button
                  className="primary-button cta-resume"
                  onClick={resumeTimer}
                  aria-label="Resume timer"
                >
                  <span className="btn-icon">▶</span> Resume
                </Button>
              )}

              {finished && (
                <Button
                  className="primary-button cta-restart"
                  onClick={() => {
                    stopAlarmAndDismiss();
                    resetTimer();
                  }}
                  aria-label="Restart timer"
                >
                  <span className="btn-icon">↻</span> Restart
                </Button>
              )}

              <Button
                variant="secondary"
                className="secondary-button"
                onClick={resetTimer}
                aria-label="Reset timer"
              >
                Reset (R)
              </Button>

              <Button
                variant="secondary"
                className="secondary-button"
                onClick={openTimeEditor}
                title="Enter exact custom hours, minutes, and seconds"
                aria-label="Edit custom time"
              >
                ✎ Edit Time
              </Button>

              {mode === "interval" && (
                <button
                  className="secondary-button"
                  onClick={skipInterval}
                  aria-label="Skip current interval"
                >
                  Skip
                </button>
              )}

              <button
                className="save-current-button"
                onClick={() => {
                  setPresetNameInput(customTimerName);
                  setShowPresetModal(true);
                  playAsmrPop(settings.muted, settings.volume);
                }}
                title="Save this configuration as a reusable preset"
              >
                ＋ Save Preset
              </button>
            </div>
          </div>

          <details className="timer-advanced">
            <summary>Duration settings and presets</summary>

          {/* Mode Configuration Panels */}
          {mode === "countdown" && (
            <div className="control-section">
              <div className="section-header-row">
                <div>
                  <div className="section-title">Custom Time & Duration</div>
                  <div className="section-subtitle">
                    Type exact hours, minutes, seconds or drag the rotary dial.
                  </div>
                </div>
                <button
                  className="edit-time-pill-btn"
                  onClick={openTimeEditor}
                  title="Open full custom time editor"
                >
                  ✎ Custom: {formatTime(timeLeft, timeLeft >= 3600)}
                </button>
              </div>

              {/* Direct Inline Numerical Time Setter */}
              <div className="custom-inline-time-setter glass-subcard">
                <span className="setter-label">Set Exact Time:</span>
                <div className="inline-time-inputs">
                  <div className="time-input-col">
                    <input
                      type="number"
                      min="0"
                      max="23"
                      value={Math.floor(timeLeft / 3600)}
                      onChange={(e) => {
                        const h = clamp(e.target.value, 0, 23);
                        const m = Math.floor((timeLeft % 3600) / 60);
                        const s = timeLeft % 60;
                        applyCustomTime(h, m, s);
                      }}
                      className="time-box-input"
                      aria-label="Hours"
                    />
                    <span className="unit-label">hr</span>
                  </div>
                  <span className="time-colon">:</span>
                  <div className="time-input-col">
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={Math.floor((timeLeft % 3600) / 60)}
                      onChange={(e) => {
                        const h = Math.floor(timeLeft / 3600);
                        const m = clamp(e.target.value, 0, 59);
                        const s = timeLeft % 60;
                        applyCustomTime(h, m, s);
                      }}
                      className="time-box-input"
                      aria-label="Minutes"
                    />
                    <span className="unit-label">min</span>
                  </div>
                  <span className="time-colon">:</span>
                  <div className="time-input-col">
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={timeLeft % 60}
                      onChange={(e) => {
                        const h = Math.floor(timeLeft / 3600);
                        const m = Math.floor((timeLeft % 3600) / 60);
                        const s = clamp(e.target.value, 0, 59);
                        applyCustomTime(h, m, s);
                      }}
                      className="time-box-input"
                      aria-label="Seconds"
                    />
                    <span className="unit-label">sec</span>
                  </div>
                </div>

                {/* Quick Nudges */}
                <div className="quick-nudge-group">
                  <button className="nudge-chip" onClick={() => nudgeTime(-60)} title="Subtract 1 minute">
                    -1m
                  </button>
                  <button className="nudge-chip" onClick={() => nudgeTime(30)} title="Add 30 seconds">
                    +30s
                  </button>
                  <button className="nudge-chip" onClick={() => nudgeTime(60)} title="Add 1 minute">
                    +1m
                  </button>
                  <button className="nudge-chip" onClick={() => nudgeTime(300)} title="Add 5 minutes">
                    +5m
                  </button>
                  <button className="nudge-chip" onClick={() => nudgeTime(600)} title="Add 10 minutes">
                    +10m
                  </button>
                </div>
              </div>

              {/* Quick minute pills */}
              <div className="preset-row">
                {[1, 3, 5, 10, 15, 20, 25, 30, 45, 60].map((m) => (
                  <button
                    key={m}
                    className={`preset-pill ${countdownMinutes === m && timeLeft % 60 === 0 ? "active" : ""}`}
                    onClick={() => {
                      updateCountdownMinutes(m);
                      playAsmrTick(settings.muted, settings.volume);
                    }}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === "pomodoro" && (
            <div className="control-section">
              <div className="section-title">Pomodoro Focus Cycle</div>
              <div className="section-subtitle">
                Sprint through high-intensity focus sessions with automated 5-minute restorative breaks.
              </div>
              <div className="setting-grid">
                <label>
                  Focus Duration (minutes)
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={pomodoroMinutes}
                    onChange={(e) => {
                      const v = clamp(e.target.value, 1, 120);
                      setPomodoroMinutes(v);
                      if (!running && pomodoroPhase === "work") setTimeLeft(v * 60);
                    }}
                  />
                </label>
              </div>
            </div>
          )}

          {mode === "interval" && (
            <div className="control-section">
              <div className="section-title">Interval / HIIT Training</div>
              <div className="section-subtitle">
                Configurable work and rest intervals with automatic cycle progression.
              </div>
              <div className="setting-grid">
                <label>
                  Work (min)
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={intervalWork}
                    onChange={(e) => {
                      const v = clamp(e.target.value, 1, 60);
                      setIntervalWork(v);
                      if (!running && intervalPhase === "work") setTimeLeft(v * 60);
                    }}
                  />
                </label>
                <label>
                  Rest (sec)
                  <input
                    type="number"
                    min="5"
                    max="600"
                    value={intervalRest}
                    onChange={(e) => {
                      const v = clamp(e.target.value, 5, 600);
                      setIntervalRest(v);
                      if (!running && intervalPhase === "rest") setTimeLeft(v);
                    }}
                  />
                </label>
                <label>
                  Cycles
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={intervalCycles}
                    onChange={(e) => setIntervalCycles(clamp(e.target.value, 1, 50))}
                  />
                </label>
              </div>
            </div>
          )}

          {/* Saved Presets Section */}
          <section className="saved-presets-section">
            <div className="saved-presets-header">
              <div>
                <div className="section-title">Saved Presets</div>
                <div className="section-subtitle">Quick launch and share custom timers</div>
              </div>
              <button className="text-button" onClick={resetPresetsToDefaults}>
                Reset to Defaults
              </button>
            </div>

            <div className="preset-list">
              {presets.map((p) => (
                <div className="saved-preset-card glass-subcard" key={p.id}>
                  <div className="saved-preset-info">
                    <div className="saved-preset-icon" aria-hidden="true">⏱</div>
                    <div>
                      <div className="saved-preset-name">{p.name}</div>
                      <div className="saved-preset-description">
                        {p.mode === "interval"
                          ? `${p.work}m work · ${p.rest}s rest · ${p.cycles} cycles`
                          : `${Math.round(p.duration / 60)} minutes · ${modeLabel(p.mode)}`}
                      </div>
                    </div>
                  </div>
                  <div className="saved-preset-actions">
                    <button
                      className="preset-start"
                      onClick={() => loadPreset(p)}
                      title="Load preset"
                    >
                      Start
                    </button>
                    <button
                      className="preset-share"
                      onClick={() => copyShareLink(p)}
                      title="Share preset link"
                      aria-label="Share preset"
                    >
                      ↗
                    </button>
                    {!p.id.startsWith("default-") && (
                      <button
                        className="preset-delete"
                        onClick={() => deletePreset(p.id)}
                        title="Delete preset"
                        aria-label="Delete preset"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
          </details>
        </div>

        {/* Optional settings and history */}
        {showStats ? (
          <StatsPanel stats={stats} history={history} clearHistory={clearHistory} />
        ) : showSettings ? (
          <SettingsPanel
            theme={theme}
            setTheme={setTheme}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            settings={settings}
            setSettings={setSettings}
            onRequestNotifications={requestNotificationPermission}
            onClose={() => setShowSettings(false)}
          />
        ) : null}
      </section>

      {/* Save Preset Modal */}
      {showPresetModal && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => e.target === e.currentTarget && setShowPresetModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-card glass-panel">
            <div className="modal-header">
              <div>
                <h2>Save Preset</h2>
                <p>Save this timer to your device presets.</p>
              </div>
              <button
                className="close-settings"
                onClick={() => setShowPresetModal(false)}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>
            <input
              autoFocus
              className="modal-input"
              value={presetNameInput}
              placeholder="e.g. Afternoon Coding"
              onChange={(e) => setPresetNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveCurrentPreset()}
            />
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setShowPresetModal(false)}>
                Cancel
              </button>
              <button className="primary-button" onClick={saveCurrentPreset}>
                Save Preset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Timer Modal */}
      {showRenameModal && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => e.target === e.currentTarget && setShowRenameModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-card glass-panel">
            <div className="modal-header">
              <div>
                <h2>Custom Timer Name</h2>
                <p>Personalize what you're focusing on right now.</p>
              </div>
              <button
                className="close-settings"
                onClick={() => setShowRenameModal(false)}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>
            <input
              autoFocus
              className="modal-input"
              value={tempTimerName}
              placeholder="e.g. Study Chemistry, Workout"
              onChange={(e) => setTempTimerName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (tempTimerName.trim()) setCustomTimerName(tempTimerName.trim());
                  setShowRenameModal(false);
                }
              }}
            />
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setShowRenameModal(false)}>
                Cancel
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  if (tempTimerName.trim()) setCustomTimerName(tempTimerName.trim());
                  setShowRenameModal(false);
                }}
              >
                Save Name
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Time Editor Modal */}
      {showTimeModal && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => e.target === e.currentTarget && setShowTimeModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-card glass-panel time-editor-modal">
            <div className="modal-header">
              <div>
                <h2>Set Custom Time</h2>
                <p>Enter your exact hours, minutes, and seconds.</p>
              </div>
              <button
                className="close-settings"
                onClick={() => setShowTimeModal(false)}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>

            <div className="modal-time-picker-grid">
              <div className="modal-time-box">
                <span className="picker-label">HOURS</span>
                <button
                  type="button"
                  className="picker-step-btn"
                  onClick={() => {
                    setEditHours((h) => (h >= 23 ? 0 : h + 1));
                    playAsmrTick(settings.muted, settings.volume);
                  }}
                  aria-label="Increase hours"
                >
                  ▲
                </button>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={editHours}
                  onChange={(e) => setEditHours(clamp(e.target.value, 0, 23))}
                  className="picker-input"
                  autoFocus
                />
                <button
                  type="button"
                  className="picker-step-btn"
                  onClick={() => {
                    setEditHours((h) => (h <= 0 ? 23 : h - 1));
                    playAsmrTick(settings.muted, settings.volume);
                  }}
                  aria-label="Decrease hours"
                >
                  ▼
                </button>
              </div>

              <span className="picker-colon">:</span>

              <div className="modal-time-box">
                <span className="picker-label">MINUTES</span>
                <button
                  type="button"
                  className="picker-step-btn"
                  onClick={() => {
                    setEditMinutes((m) => (m >= 59 ? 0 : m + 1));
                    playAsmrTick(settings.muted, settings.volume);
                  }}
                  aria-label="Increase minutes"
                >
                  ▲
                </button>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={editMinutes}
                  onChange={(e) => setEditMinutes(clamp(e.target.value, 0, 59))}
                  className="picker-input"
                />
                <button
                  type="button"
                  className="picker-step-btn"
                  onClick={() => {
                    setEditMinutes((m) => (m <= 0 ? 59 : m - 1));
                    playAsmrTick(settings.muted, settings.volume);
                  }}
                  aria-label="Decrease minutes"
                >
                  ▼
                </button>
              </div>

              <span className="picker-colon">:</span>

              <div className="modal-time-box">
                <span className="picker-label">SECONDS</span>
                <button
                  type="button"
                  className="picker-step-btn"
                  onClick={() => {
                    setEditSeconds((s) => (s >= 59 ? 0 : s + 1));
                    playAsmrTick(settings.muted, settings.volume);
                  }}
                  aria-label="Increase seconds"
                >
                  ▲
                </button>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={editSeconds}
                  onChange={(e) => setEditSeconds(clamp(e.target.value, 0, 59))}
                  className="picker-input"
                />
                <button
                  type="button"
                  className="picker-step-btn"
                  onClick={() => {
                    setEditSeconds((s) => (s <= 0 ? 59 : s - 1));
                    playAsmrTick(settings.muted, settings.volume);
                  }}
                  aria-label="Decrease seconds"
                >
                  ▼
                </button>
              </div>
            </div>

            {/* Quick Presets within modal */}
            <div className="modal-quick-presets">
              <span className="quick-title">Quick Adjust:</span>
              <div className="quick-chip-row">
                <button
                  type="button"
                  className="nudge-chip"
                  onClick={() => setEditMinutes((m) => Math.min(59, m + 1))}
                >
                  +1m
                </button>
                <button
                  type="button"
                  className="nudge-chip"
                  onClick={() => setEditMinutes((m) => Math.min(59, m + 5))}
                >
                  +5m
                </button>
                <button
                  type="button"
                  className="nudge-chip"
                  onClick={() => setEditMinutes((m) => Math.min(59, m + 15))}
                >
                  +15m
                </button>
                <button
                  type="button"
                  className="nudge-chip"
                  onClick={() => setEditHours((h) => Math.min(23, h + 1))}
                >
                  +1h
                </button>
                <button
                  type="button"
                  className="nudge-chip reset-chip"
                  onClick={() => {
                    setEditHours(0);
                    setEditMinutes(0);
                    setEditSeconds(0);
                  }}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setShowTimeModal(false)}>
                Cancel
              </button>
              <button
                className="primary-button"
                onClick={() => applyCustomTime(editHours, editMinutes, editSeconds)}
              >
                Apply Time
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toastMessage && (
        <div className="toast-notification" role="status">
          {toastMessage}
        </div>
      )}

      {/* Bottom Keyboard Guide */}
      <footer className="footer-note">
        <span>Space: Start/Pause</span> · <span>Esc: Stop Alarm</span> · <span>R: Reset</span> ·{" "}
        <span>M: Mute</span> · <span>← / →: Adjust Min</span> · <span>F: Fullscreen</span>
      </footer>
    </main>
    </>
  );
}

function QuickInfo({ stats, customTimerName, onEditName }) {
  return (
    <aside className="quick-panel glass-panel">
      <div className="panel-kicker">CURRENT FOCUS</div>
      <div className="quick-focus-header">
        <h2 className="current-focus-title">{customTimerName}</h2>
        <button className="edit-name-inline" onClick={onEditName} title="Rename timer">
          ✎
        </button>
      </div>
      <p className="panel-lead">
        Visual countdown with rotary tactile feedback. Time flows clockwise so you instinctively gauge remaining time.
      </p>

      <div className="mini-stat-grid">
        <div className="glass-subcard">
          <strong>{formatDuration(stats.todaySeconds)}</strong>
          <span>Today's Focus</span>
        </div>
        <div className="glass-subcard">
          <strong>{stats.completed}</strong>
          <span>Completed</span>
        </div>
        <div className="glass-subcard">
          <strong>{stats.completionRate}%</strong>
          <span>Completion</span>
        </div>
        <div className="glass-subcard">
          <strong>{formatDuration(stats.weekSeconds)}</strong>
          <span>This Week</span>
        </div>
      </div>

      <div className="tips-card glass-subcard">
        <strong>💡 Visual Tips</strong>
        <span>• Drag along the dial rim to smoothly adjust countdown minutes.</span>
        <span>• Background timer accuracy guarantees the alarm rings even with tabs asleep.</span>
        <span>• High piercing alarm and blinking red dial will alert you the moment time expires.</span>
      </div>
    </aside>
  );
}

function StatsPanel({ stats, history, clearHistory }) {
  return (
    <aside className="side-panel glass-panel">
      <div className="settings-header">
        <div>
          <h2>Session Statistics</h2>
          <p>Local offline history & progress</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card glass-subcard">
          <span>Total Focus</span>
          <strong>{formatDuration(stats.totalFocus)}</strong>
        </div>
        <div className="stat-card glass-subcard">
          <span>Sessions</span>
          <strong>{stats.totalSessions}</strong>
        </div>
        <div className="stat-card glass-subcard">
          <span>Completion</span>
          <strong>{stats.completionRate}%</strong>
        </div>
        <div className="stat-card glass-subcard">
          <span>Most Used</span>
          <strong>{modeLabel(stats.mostUsed)}</strong>
        </div>
      </div>

      <div className="stats-section">
        <div className="stats-section-title">Weekly Focus Hours</div>
        <div className="week-summary">
          <span>{formatDuration(stats.weekSeconds)}</span>
          <small>focus time this week</small>
        </div>
        <div className="bar-chart">
          {stats.daily.map((d) => {
            const max = Math.max(...stats.daily.map((x) => x.seconds), 1);
            const heightPercent = Math.min(100, (d.seconds / max) * 100);
            return (
              <div className="bar-column" key={d.label}>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ height: `${heightPercent}%` }}
                    title={`${d.label}: ${formatDuration(d.seconds)}`}
                  />
                </div>
                <small>{d.label}</small>
              </div>
            );
          })}
        </div>
      </div>

      <div className="history-section">
        <div className="saved-presets-header">
          <div className="stats-section-title">Recent Sessions</div>
          {history.length > 0 && (
            <button className="text-button" onClick={clearHistory}>
              Clear
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <div className="empty-history">No sessions recorded yet. Start a timer!</div>
        ) : (
          history.slice(0, 10).map((h) => (
            <div className="history-row" key={h.id}>
              <div>
                <strong>{h.name || modeLabel(h.mode)}</strong>
                <span>{new Date(h.date).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <div>
                <b>{formatDuration(h.duration)}</b>
                <em className={h.completed ? "done" : "stopped"}>
                  {h.completed ? "Done" : "Stopped"}
                </em>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

function SettingsPanel({
  theme,
  setTheme,
  darkMode,
  setDarkMode,
  settings,
  setSettings,
  onRequestNotifications,
  onClose,
}) {
  return (
    <aside className="settings-panel glass-panel">
      <div className="settings-header">
        <div>
          <h2>Settings</h2>
          <p>Audio, visual theme & notifications</p>
        </div>
        <button className="close-settings" onClick={onClose} aria-label="Close settings">
          ×
        </button>
      </div>

      {/* Appearance */}
      <div className="theme-settings">
        <div className="setting-heading">
          <strong>Appearance</strong>
          <span>Choose a light or dark surface</span>
        </div>
        <div className="appearance-row">
          <button
            className={`appearance-button ${!darkMode ? "active" : ""}`}
            onClick={() => setDarkMode(false)}
          >
            ☀ Light
          </button>
          <button
            className={`appearance-button ${darkMode ? "active" : ""}`}
            onClick={() => setDarkMode(true)}
          >
            ◐ Dark
          </button>
        </div>
      </div>

      {/* Theme palette */}
      <div className="theme-settings">
        <div className="setting-heading">
          <strong>Timer color</strong>
          <span>Choose the ring accent</span>
        </div>
        <div className="theme-grid">
          {[
            { id: "forest", name: "Forest Emerald", color: "#10b981" },
            { id: "ocean", name: "Ocean Azure", color: "#0ea5e9" },
            { id: "violet", name: "Neon Violet", color: "#8b5cf6" },
            { id: "sunset", name: "Sunset Amber", color: "#f97316" },
            { id: "midnight", name: "Midnight Cyber", color: "#06b6d4" },
          ].map((t) => (
            <button
              key={t.id}
              className={`theme-option ${t.id} ${theme === t.id ? "active" : ""}`}
              onClick={() => setTheme(t.id)}
            >
              <i className="theme-preview" style={{ backgroundColor: t.color }} />
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* ASMR Sound & Alarm */}
      <div className="theme-settings">
        <div className="setting-heading">
          <strong>Alerts</strong>
          <span>Choose how the timer signals completion</span>
        </div>

        <div className="sound-toggle-list">
          <label className="alert-select-row">
            <span>Completion sound</span>
            <select
              value={settings.alertStyle || "sound"}
              onChange={(e) => setSettings({ ...settings, alertStyle: e.target.value })}
            >
              <option value="sound">Gentle chime</option>
              <option value="loud">Loud alarm</option>
              <option value="silent">Silent</option>
            </select>
          </label>

          <label className="toggle-row">
            <div>
              <span>Mute All Sounds</span>
              <small>Disables ASMR clicks and alarm sound</small>
            </div>
            <input
              type="checkbox"
              checked={settings.muted}
              onChange={(e) => setSettings({ ...settings, muted: e.target.checked })}
            />
            <i />
          </label>

          <label className="toggle-row">
            <div>
              <span>Ambient ASMR Tick</span>
              <small>Soft rhythmic watch tick every second</small>
            </div>
            <input
              type="checkbox"
              checked={settings.ambientTick}
              onChange={(e) => setSettings({ ...settings, ambientTick: e.target.checked })}
            />
            <i />
          </label>

          <div className="slider-control-row">
            <div className="slider-label-row">
              <span>Master Sound Volume</span>
              <strong>{Math.round(settings.volume * 100)}%</strong>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={settings.volume}
              onChange={(e) => setSettings({ ...settings, volume: Number(e.target.value) })}
              className="range-input"
            />
          </div>

          <div className="alarm-test-row">
            <button
              className="secondary-button test-sound-btn"
              onClick={() => {
                initAudio();
                playHighAlarm(settings.muted, settings.alarmVolume);
                setTimeout(stopHighAlarm, 1500);
              }}
            >
              🔔 Test High Alarm (1.5s)
            </button>
          </div>
        </div>
      </div>

      {/* Browser Notifications */}
      <div className="theme-settings">
        <div className="setting-heading">
          <strong>Browser Notifications</strong>
          <span>Alerts even when tab is backgrounded</span>
        </div>
        <button className="primary-button full-width" onClick={onRequestNotifications}>
          🔔 Enable Push Notifications
        </button>
      </div>

      {/* Compact Fullscreen */}
      <div className="theme-settings">
        <label className="toggle-row">
          <div>
            <span>Compact Fullscreen</span>
            <small>Hides panels in fullscreen for room display</small>
          </div>
          <input
            type="checkbox"
            checked={settings.compactFullscreen}
            onChange={(e) => setSettings({ ...settings, compactFullscreen: e.target.checked })}
          />
          <i />
        </label>
      </div>
    </aside>
  );
}

export default App;
