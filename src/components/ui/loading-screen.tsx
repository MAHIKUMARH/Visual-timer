"use client"

import React, { useEffect, useState } from "react"
import { ShaderBackground } from "./a-shader"

interface LoadingScreenProps {
  theme?: string
  darkMode?: boolean
  onComplete?: () => void
}

const CUTE_MESSAGES = [
  "Polishing fluted glass... ✨",
  "Winding up tactile dial... ⏱️",
  "Preparing your peaceful focus... 🌿",
]

export function LoadingScreen({
  theme = "forest",
  darkMode = true,
  onComplete,
}: LoadingScreenProps) {
  const [progress, setProgress] = useState(0)
  const [messageIndex, setMessageIndex] = useState(0)
  const [isFadingOut, setIsFadingOut] = useState(false)

  useEffect(() => {
    const duration = 1400 // 1.4s duration for optimal perceived elegance
    let start: number | null = null
    let frameId = 0
    let completionTimeoutId: number | undefined

    const frame = (now: number) => {
      start ??= now
      const elapsed = now - start
      const raw = Math.min(1, Math.max(0, elapsed / duration))
      // Ease out cubic
      const eased = 1 - Math.pow(1 - raw, 3)
      setProgress(Math.round(eased * 100))

      if (raw < 0.45) {
        setMessageIndex(0)
      } else if (raw < 0.8) {
        setMessageIndex(1)
      } else {
        setMessageIndex(2)
      }

      if (raw < 1) {
        frameId = requestAnimationFrame(frame)
      } else {
        setIsFadingOut(true)
        completionTimeoutId = window.setTimeout(() => {
          onComplete?.()
        }, 450)
      }
    }

    frameId = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(frameId)
      if (completionTimeoutId !== undefined) window.clearTimeout(completionTimeoutId)
    }
  }, [onComplete])

  return (
    <div
      className={`loading-screen-root ${isFadingOut ? "loading-fade-out" : ""} ${
        darkMode ? "dark-mode" : "light-mode"
      } theme-${theme}`}
      role="status"
      aria-live="polite"
      aria-label="Loading Visual Timer"
    >
      {/* Background fluted glass shader ambiance */}
      <div className="loading-shader-backdrop" aria-hidden="true">
        <ShaderBackground
          theme={theme}
          darkMode={darkMode}
          speed={0.7}
        />
        <div className="loading-backdrop-overlay" />
      </div>

      {/* Center Cute & Elegant Glass Pod */}
      <div className="loading-card glass-panel">
        {/* Floating cute sparkles */}
        <div className="sparkle sparkle-top" aria-hidden="true">✨</div>
        <div className="sparkle sparkle-bottom" aria-hidden="true">✦</div>
        <div className="sparkle sparkle-left" aria-hidden="true">⋆</div>

        {/* Dial Animation */}
        <div className="loading-dial-wrapper">
          <svg className="loading-dial-svg" viewBox="0 0 120 120">
            {/* Background glass track */}
            <circle
              cx="60"
              cy="60"
              r="48"
              className="loading-dial-track"
            />
            {/* Animated filling progress arc */}
            <circle
              cx="60"
              cy="60"
              r="48"
              className="loading-dial-arc"
              style={{
                strokeDasharray: 301.6,
                strokeDashoffset: 301.6 - (301.6 * progress) / 100,
              }}
            />
          </svg>

          {/* Central Cute Bobbing Clock Glyph */}
          <div className="loading-center-gem">
            <span className="loading-gem-icon">⏱</span>
          </div>
        </div>

        {/* Brand Title with Gradient */}
        <div className="loading-text-group">
          <h2 className="loading-title">Visual Timer</h2>
          <span className="loading-pill-badge">TACTILE & ASMR</span>
          <p key={messageIndex} className="loading-message-ticker">
            {CUTE_MESSAGES[messageIndex]}
          </p>
        </div>

        {/* Elegant Fluted Progress Track */}
        <div className="loading-progress-container">
          <div className="loading-progress-track">
            <div
              className="loading-progress-fill"
              style={{ width: `${progress}%` }}
            >
              <div className="loading-progress-glow" />
            </div>
          </div>
          <span className="loading-percentage">{progress}%</span>
        </div>
      </div>
    </div>
  )
}
