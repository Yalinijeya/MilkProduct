import { Injectable, signal } from '@angular/core';

const SOUND_KEY = 'admin_sound_enabled';

/**
 * Plays an alert chime with the Web Audio API (no audio file needed).
 * Browsers only allow audio after a user gesture, so call `unlock()` from a click handler.
 */
@Injectable({ providedIn: 'root' })
export class SoundService {
  private ctx: AudioContext | null = null;
  readonly enabled = signal(this.readPref());
  /** False until the browser lets us play audio (needs one click/keypress on the page). */
  readonly unlocked = signal(false);

  /** Must be called from a user gesture (click / keypress) to allow playback. */
  unlock(): void {
    if (!this.ctx) this.ctx = new AudioContext();
    const ctx = this.ctx;
    if (ctx.state === 'running') {
      this.unlocked.set(true);
      return;
    }
    ctx.resume().then(() => this.unlocked.set(ctx.state === 'running')).catch(() => {});
  }

  toggle(): void {
    this.enabled.update((v) => !v);
    try {
      localStorage.setItem(SOUND_KEY, String(this.enabled()));
    } catch {
      /* ignore */
    }
    if (this.enabled()) {
      this.unlock();
      this.playNewOrder();
    }
  }

  /** Three rising beeps, repeated twice. */
  playNewOrder(): void {
    if (!this.enabled()) return;
    this.unlock();
    const ctx = this.ctx!;
    const notes = [880, 1108.73, 1318.51];
    let t = ctx.currentTime + 0.05;
    for (let r = 0; r < 2; r++) {
      for (const freq of notes) {
        this.beep(ctx, freq, t, 0.16);
        t += 0.18;
      }
      t += 0.25;
    }
  }

  private beep(ctx: AudioContext, freq: number, start: number, duration: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private readPref(): boolean {
    try {
      return localStorage.getItem(SOUND_KEY) !== 'false';
    } catch {
      return true;
    }
  }
}
