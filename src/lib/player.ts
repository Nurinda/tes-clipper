import { usePlayhead } from '../store';

/** Satu elemen <video> dipakai bersama oleh pratinjau dan timeline. */
export const player: { el: HTMLVideoElement | null } = { el: null };

export function seek(t: number) {
  const v = player.el;
  if (!v) return;
  v.currentTime = Math.max(0, t);
  usePlayhead.getState().set(Math.max(0, t));
}

export function togglePlay() {
  const v = player.el;
  if (!v) return;
  if (v.paused) v.play().catch(() => undefined);
  else v.pause();
}

export function pause() { player.el?.pause(); }
