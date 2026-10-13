import React, { useRef, useCallback, useEffect } from "react";
import { playAsmrTick } from "./audio";

const TICK_COUNT = 60;
const RADIUS = 135;
const CENTER = 160;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // ~848.23

export function RotaryDial({
  minutes,
  onMinutesChange,
  progress, // 0 to 100
  running,
  paused,
  finished,
  mode,
  timerLabel,
  displayTimeFormatted,
  customTimerName,
  onEditName,
  onEditTime,
  muted,
  volume,
  onStopAlarm,
  isAlarmActive,
}) {
  const dialRef = useRef(null);
  const isDraggingRef = useRef(false);
  const prevMinuteRef = useRef(minutes);

  const calculateMinuteFromEvent = useCallback((clientX, clientY) => {
    if (!dialRef.current) return null;
    const rect = dialRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;

    // Angle clockwise from 12 o'clock (0 to 360 deg)
    let deg = (Math.atan2(dy, dx) * (180 / Math.PI)) + 90;
    if (deg < 0) deg += 360;

    let targetMin = Math.round((deg / 360) * 60);
    if (targetMin === 0) targetMin = 60;
    return Math.max(1, Math.min(60, targetMin));
  }, []);

  const handlePointerDown = (e) => {
    if (running && !paused) return; // Locked while active
    if (mode !== "countdown") return; // Interactive dragging primarily sets countdown

    isDraggingRef.current = true;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const newMin = calculateMinuteFromEvent(clientX, clientY);

    if (newMin !== null && newMin !== minutes) {
      playAsmrTick(muted, volume);
      prevMinuteRef.current = newMin;
      onMinutesChange(newMin);
    }
  };

  useEffect(() => {
    const handlePointerMove = (e) => {
      if (!isDraggingRef.current) return;
      if (e.cancelable) e.preventDefault(); // Prevent touch scroll while rotating dial

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const newMin = calculateMinuteFromEvent(clientX, clientY);

      if (newMin !== null && newMin !== prevMinuteRef.current) {
        playAsmrTick(muted, volume);
        prevMinuteRef.current = newMin;
        onMinutesChange(newMin);
      }
    };

    const handlePointerUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
      }
    };

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
    window.addEventListener("touchmove", handlePointerMove, { passive: false });
    window.addEventListener("touchend", handlePointerUp);

    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
      window.removeEventListener("touchmove", handlePointerMove);
      window.removeEventListener("touchend", handlePointerUp);
    };
  }, [calculateMinuteFromEvent, onMinutesChange, muted, volume]);

  // Compute knob position on dial perimeter based on minutes (or progress)
  const knobAngleDeg = (minutes / 60) * 360 - 90; // -90 so 0 is at 12 o'clock
  const knobRad = (knobAngleDeg * Math.PI) / 180;
  const knobX = CENTER + RADIUS * Math.cos(knobRad);
  const knobY = CENTER + RADIUS * Math.sin(knobRad);

  const strokeDashoffset = CIRCUMFERENCE - (CIRCUMFERENCE * Math.min(100, Math.max(0, progress))) / 100;

  // Generate 60 tick marks
  const tickMarks = [];
  for (let i = 0; i < TICK_COUNT; i++) {
    const isMajor = i % 5 === 0;
    const angle = (i / TICK_COUNT) * 360 - 90;
    const rad = (angle * Math.PI) / 180;
    const outerR = 154;
    const innerR = isMajor ? 141 : 146;
    const x1 = CENTER + outerR * Math.cos(rad);
    const y1 = CENTER + outerR * Math.sin(rad);
    const x2 = CENTER + innerR * Math.cos(rad);
    const y2 = CENTER + innerR * Math.sin(rad);

    // Label for major ticks
    let label = null;
    if (isMajor) {
      const labelR = 127;
      const lx = CENTER + labelR * Math.cos(rad);
      const ly = CENTER + labelR * Math.sin(rad);
      const num = i === 0 ? "60" : String(i);
      label = (
        <text
          key={`label-${i}`}
          x={lx}
          y={ly}
          textAnchor="middle"
          dominantBaseline="central"
          className="dial-tick-number"
        >
          {num}
        </text>
      );
    }

    tickMarks.push(
      <g key={`tick-${i}`}>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          className={`dial-tick-line ${isMajor ? "major" : "minor"}`}
        />
        {label}
      </g>
    );
  }

  // Determine status pill
  let statusBadge = { label: "READY", className: "badge-idle" };
  if (finished) {
    statusBadge = { label: "TIME'S UP!", className: "badge-finished" };
  } else if (running && !paused) {
    statusBadge = {
      label: mode === "pomodoro" ? (timerLabel === "WORK" ? "DEEP FOCUS" : "REST BREAK") : "RUNNING",
      className: "badge-running",
    };
  } else if (paused) {
    statusBadge = { label: "PAUSED", className: "badge-paused" };
  }

  return (
    <div
      ref={dialRef}
      className={`rotary-dial-container ${finished ? "dial-times-up-red-blinking" : ""} ${
        running && !paused ? "dial-running" : ""
      } ${paused ? "dial-paused" : ""}`}
      onMouseDown={handlePointerDown}
      onTouchStart={handlePointerDown}
      role="slider"
      aria-label="Interactive rotary countdown timer dial"
      aria-valuemin={1}
      aria-valuemax={60}
      aria-valuenow={minutes}
      tabIndex={0}
      onKeyDown={(e) => {
        if (mode !== "countdown" || (running && !paused)) return;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          const next = Math.min(60, minutes + (e.shiftKey ? 5 : 1));
          playAsmrTick(muted, volume);
          onMinutesChange(next);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          const next = Math.max(1, minutes - (e.shiftKey ? 5 : 1));
          playAsmrTick(muted, volume);
          onMinutesChange(next);
        }
      }}
    >
      <svg
        className="rotary-svg"
        viewBox="0 0 320 320"
        aria-hidden="true"
      >
        <defs>
          {/* Gradients */}
          <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent-gradient-start, #10b981)" />
            <stop offset="100%" stopColor="var(--accent-gradient-end, #059669)" />
          </linearGradient>

          <linearGradient id="redAlarmGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ff4d4d" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>

          <filter id="dialGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          <filter id="redAlarmGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="14" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Outer Bezel Rim */}
        <circle cx={CENTER} cy={CENTER} r="158" className="dial-bezel-rim" />

        {/* Dial Ticks */}
        <g className="dial-ticks-group">{tickMarks}</g>

        {/* Background Track Ring */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          className="dial-track-ring"
        />

        {/* Active Progress Ring */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          className={`dial-progress-arc ${finished ? "red-blinking-stroke" : ""}`}
          stroke={finished ? "url(#redAlarmGrad)" : "url(#progressGrad)"}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={strokeDashoffset}
          filter={finished ? "url(#redAlarmGlow)" : running ? "url(#dialGlow)" : undefined}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
        />

        {/* Draggable Knob (in countdown mode when not running) */}
        {mode === "countdown" && (!running || paused) && !finished && (
          <g className="dial-knob-group" transform={`translate(${knobX}, ${knobY})`}>
            <circle r="14" className="knob-halo" />
            <circle r="9" className="knob-body" />
            <circle r="3.5" className="knob-core" />
          </g>
        )}
      </svg>

      {/* Center Glass Display Hub */}
      <div className="dial-center-glass">
        {/* Custom Timer Title badge */}
        <div className="custom-timer-title-wrap" onClick={onEditName} title="Click to rename timer">
          <span className="timer-name-badge">{customTimerName || "Visual Timer"}</span>
          <span className="timer-edit-icon" aria-hidden="true">✎</span>
        </div>

        {/* Status Pill Indicator */}
        <div className={`status-pill ${statusBadge.className}`}>
          <span className="status-indicator-dot" />
          <span className="status-text">{statusBadge.label}</span>
        </div>

        {/* Big Tabular Time Display (Click to edit custom time) */}
        <div
          className={`timer-display-digits ${finished ? "digits-times-up-red" : ""} ${
            !running || paused ? "digits-editable" : ""
          }`}
          onClick={!running || paused ? onEditTime : undefined}
          title={!running || paused ? "Click to set your own custom time" : undefined}
          role={!running || paused ? "button" : undefined}
          tabIndex={!running || paused ? 0 : undefined}
          onKeyDown={(e) => {
            if ((!running || paused) && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              e.stopPropagation();
              onEditTime?.();
            }
          }}
          aria-live="polite"
        >
          {displayTimeFormatted}
          {(!running || paused) && <span className="time-edit-badge" title="Click to edit time">✎</span>}
        </div>

        {/* Helper Subtext / Stop Alarm Action */}
        {finished ? (
          <button
            type="button"
            className="stop-alarm-pill-btn"
            onClick={(e) => {
              e.stopPropagation();
              onStopAlarm?.();
            }}
          >
            🔔 STOP ALARM
          </button>
        ) : (
          <div className="dial-helper-text">
            {mode === "countdown" && !running && "Drag ring or use presets"}
            {mode === "countdown" && running && `${minutes}m total session`}
            {mode === "pomodoro" && (timerLabel === "WORK" ? "Stay deeply focused" : "Relax and recharge")}
            {mode === "interval" && `${timerLabel}`}
            {mode === "stopwatch" && "Elapsed Stopwatch"}
          </div>
        )}
      </div>
    </div>
  );
}
