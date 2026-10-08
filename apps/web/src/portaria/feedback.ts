/**
 * Sound and vibration for results. The audio context must be created by a user gesture (iOS):
 * `unlockAudio` is called from the "start" button.
 */
import type { Tone } from "./logic";

let audio: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    audio = null;
  }
}

function beep(frequency: number, startAt: number, durationS: number): void {
  if (audio === null) {
    return;
  }
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = "square";
  oscillator.frequency.value = frequency;
  gain.gain.value = 0.15;
  oscillator.connect(gain).connect(audio.destination);
  const start = audio.currentTime + startAt;
  oscillator.start(start);
  oscillator.stop(start + durationS);
}

/** One high beep for "enter", a low double buzz for a rejection, a middle tone for a warning. */
export function announce(tone: Tone): void {
  if (tone === "ok") {
    beep(1320, 0, 0.12);
  } else if (tone === "bad") {
    beep(220, 0, 0.18);
    beep(220, 0.25, 0.18);
  } else {
    beep(660, 0, 0.25);
  }
  // iPhone ignores vibration from the web; Android honours it.
  if ("vibrate" in navigator) {
    navigator.vibrate(tone === "ok" ? 80 : [200, 100, 200]);
  }
}
