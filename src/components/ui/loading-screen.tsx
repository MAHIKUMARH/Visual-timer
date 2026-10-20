"use client"

import React, { useEffect, useState } from "react"

interface LoadingScreenProps {
  theme?: string
  darkMode?: boolean
  onComplete?: () => void
}

const LOADING_MESSAGES = ["Setting the dial", "Getting ready", "Ready"]

export function LoadingScreen({
  theme = "forest",
  darkMode = true,
  onComplete,
}: LoadingScreenProps) {
  const [progress, setProgress] = useState(0)
  const [messageIndex, setMessageIndex] = useState(0)
  const [secondsRemaining, setSecondsRemaining] = useState(2)
  const [isFadingOut, setIsFadingOut] = useState(false)

  useEffect(() => {
    const totalDuration = 2000
    const progressDuration = 1600
    const start = performance.now()
    let frameId = 0
    let completionTimeoutId: number | undefined
    let fadeTimeoutId: number | undefined

    const frame = (now: number) => {
      const elapsed = now - start
      const raw = Math.min(1, Math.max(0, elapsed / progressDuration))
      setProgress(Math.floor(raw * 100))
      setSecondsRemaining(Math.ceil(Math.max(0, totalDuration - elapsed) / 1000))

      if (raw < 0.45) {
        setMessageIndex(0)
      } else if (raw < 0.8) {
        setMessageIndex(1)
      } else {
        setMessageIndex(2)
      }

      if (raw < 1) {
        frameId = requestAnimationFrame(frame)
      }
    }

    frameId = requestAnimationFrame(frame)
    fadeTimeoutId = window.setTimeout(() => {
      setProgress(100)
      setIsFadingOut(true)
    }, progressDuration)
    completionTimeoutId = window.setTimeout(() => onComplete?.(), totalDuration)

    return () => {
      cancelAnimationFrame(frameId)
      if (completionTimeoutId !== undefined) window.clearTimeout(completionTimeoutId)
      if (fadeTimeoutId !== undefined) window.clearTimeout(fadeTimeoutId)
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
      <div className="loading-card">
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

          <div className="loading-center-gem">
            <span className="loading-gem-icon">00:0{secondsRemaining}</span>
          </div>
        </div>

        <div className="loading-text-group">
          <h2 className="loading-title">Visual Timer</h2>
          <p key={messageIndex} className="loading-message-ticker">
            {LOADING_MESSAGES[messageIndex]}
          </p>
        </div>

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
