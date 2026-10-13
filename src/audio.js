// High-precision Web Audio Synthesizer for Tactile ASMR Effects & High Alarm

let audioCtx = null;
let alarmIntervalId = null;
let isAlarmActive = false;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function initAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

/**
 * Satisfying mechanical rotary dial click (ASMR tick)
 */
export function playAsmrTick(muted = false, masterVolume = 0.8) {
  if (muted || masterVolume <= 0) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Filtered transient pulse
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1400, now);
    filter.Q.setValueAtTime(3.5, now);

    osc.type = "triangle";
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(350, now + 0.018);

    const baseVol = 0.35 * masterVolume;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(baseVol, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.025);
  } catch {}
}

/**
 * Soft tactile bubble pop for buttons & presets
 */
export function playAsmrPop(muted = false, masterVolume = 0.8, pitchMultiplier = 1) {
  if (muted || masterVolume <= 0) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    const startFreq = 420 * pitchMultiplier;
    const endFreq = 650 * pitchMultiplier;

    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.035);

    const vol = 0.28 * masterVolume;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.065);
  } catch {}
}

/**
 * Soft ambient clock tick for running focus (ASMR)
 */
export function playSoftTick(muted = false, masterVolume = 0.8) {
  if (muted || masterVolume <= 0) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, now);

    osc.type = "sine";
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.012);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.09 * masterVolume, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.022);
  } catch {}
}

/**
 * Harmonious start chime
 */
export function playStartChime(muted = false, masterVolume = 0.8) {
  if (muted || masterVolume <= 0) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5 major triad
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);

      const delay = idx * 0.06;
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.linearRampToValueAtTime(0.22 * masterVolume, now + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + delay);
      osc.stop(now + delay + 0.5);
    });
  } catch {}
}

/**
 * Gentle downward pause tone
 */
export function playPauseSound(muted = false, masterVolume = 0.8) {
  if (muted || masterVolume <= 0) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(580, now);
    osc.frequency.exponentialRampToValueAtTime(360, now + 0.12);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.2 * masterVolume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  } catch {}
}

/**
 * High-pitched, loud, urgent alarm sound sequence.
 * Repeats continuously until stopHighAlarm() is called!
 */
export function playHighAlarm(muted = false, masterVolume = 1.0) {
  if (muted) return;
  stopHighAlarm();
  isAlarmActive = true;

  const triggerBeepCycle = () => {
    if (!isAlarmActive) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // 4 rapid high-frequency piercing pulses (classic digital alarm)
      const pulses = [0, 0.12, 0.24, 0.36];
      pulses.forEach((timeOffset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        // High alarm pitch: 1568Hz (G6) to 1864Hz (Bb6) - highly audible & unmistakable
        osc.type = "square"; // square wave gives maximum harmonic energy & crisp alarm timbre
        osc.frequency.setValueAtTime(1600, now + timeOffset);
        osc.frequency.setValueAtTime(1850, now + timeOffset + 0.04);

        const vol = Math.min(1.0, 0.55 * masterVolume);
        gain.gain.setValueAtTime(0.0001, now + timeOffset);
        gain.gain.linearRampToValueAtTime(vol, now + timeOffset + 0.008);
        gain.gain.setValueAtTime(vol, now + timeOffset + 0.065);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + timeOffset + 0.085);

        // Lowpass to prevent digital clipping while preserving high brightness
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(4500, now + timeOffset);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + timeOffset);
        osc.stop(now + timeOffset + 0.095);
      });
    } catch {}
  };

  // Trigger first cycle immediately
  triggerBeepCycle();
  // Repeat every 800ms
  alarmIntervalId = setInterval(triggerBeepCycle, 800);
}

export function stopHighAlarm() {
  isAlarmActive = false;
  if (alarmIntervalId) {
    clearInterval(alarmIntervalId);
    alarmIntervalId = null;
  }
}

export function getIsAlarmActive() {
  return isAlarmActive;
}
