import { useEffect, useRef, useState } from 'react';
import type { Clip, Project } from '../types';
import { useApp, usePlayhead, useSettings } from '../store';
import { seek } from '../lib/player';
import { clamp, fmtTime } from '../lib/utils';

export type Zoom = 10 | 30 | 90 | 0;
const H = 92;
const LANE = 10;

function niceStep(span: number, width: number): number {
  const target = span / Math.max(2, width / 90);
  return [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800].find((s) => s >= target) ?? 3600;
}

export default function Timeline({ clip, project, zoom }: { clip: Clip; project: Project; zoom: Zoom }) {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(600);
  const t = usePlayhead((s) => s.t);
  const theme = useSettings((s) => s.theme);
  const { updateClip, select } = useApp();

  const calcWin = (c: Clip, z: Zoom): [number, number] => {
    if (z === 0) return [0, project.duration];
    const a = Math.max(0, c.start - z);
    const b = Math.min(project.duration, c.end + z);
    return [a, b];
  };
  const [win, setWin] = useState<[number, number]>(() => calcWin(clip, zoom));
  const dragging = useRef(false);

  useEffect(() => { setWin(calcWin(clip, zoom)); /* eslint-disable-next-line */ }, [clip.id, zoom, project.duration]);
  useEffect(() => {
    if (dragging.current) return;
    if (zoom !== 0 && (clip.start < win[0] || clip.end > win[1])) setWin(calcWin(clip, zoom));
    // eslint-disable-next-line
  }, [clip.start, clip.end]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const [a, b] = win;
  const span = Math.max(1, b - a);
  const x = (tt: number) => ((tt - a) / span) * w;
  const tAt = (px: number) => clamp(a + (px / w) * span, 0, project.duration);

  // gambar gelombang suara
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr;
    c.height = H * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, H);
    const cs = getComputedStyle(document.documentElement);
    const mute = `rgb(${cs.getPropertyValue('--mute').trim().replace(/ /g, ',')})`;
    const line = `rgb(${cs.getPropertyValue('--line').trim().replace(/ /g, ',')})`;

    // jalur klip lain
    for (const k of project.clips) {
      if (k.end < a || k.start > b) continue;
      ctx.fillStyle = k.id === clip.id ? 'rgba(0,178,177,.9)' : 'rgba(0,178,177,.28)';
      ctx.fillRect(x(k.start), 0, Math.max(2, x(k.end) - x(k.start)), LANE - 3);
    }

    // gelombang
    const e = project.energy;
    const bars = Math.floor(w / 3);
    const mid = LANE + (H - LANE - 16) / 2;
    const maxH = (H - LANE - 16) / 2 - 2;
    for (let i = 0; i < bars; i++) {
      const t0 = a + (i / bars) * span;
      const t1 = a + ((i + 1) / bars) * span;
      let v = 0.04;
      if (e) {
        const i0 = Math.floor(t0 / e.step), i1 = Math.max(i0 + 1, Math.ceil(t1 / e.step));
        for (let j = i0; j < i1; j++) v = Math.max(v, e.rms[j] ?? 0);
      }
      const inside = t1 > clip.start && t0 < clip.end;
      ctx.fillStyle = inside ? '#00B2B1' : line;
      const hh = Math.max(1.5, v * maxH);
      ctx.fillRect(i * 3, mid - hh, 2, hh * 2);
    }

    // penggaris waktu
    const step = niceStep(span, w);
    ctx.fillStyle = mute;
    ctx.font = '600 10px "Nunito Variable", sans-serif';
    ctx.textBaseline = 'bottom';
    for (let s = Math.ceil(a / step) * step; s < b; s += step) {
      const px = x(s);
      ctx.fillRect(px, H - 14, 1, 4);
      if (px > 4 && px < w - 30) ctx.fillText(fmtTime(s), px + 3, H - 1);
    }
    // eslint-disable-next-line
  }, [w, a, b, clip.start, clip.end, clip.id, project.clips, project.energy, theme]);

  const scrub = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    seek(tAt(e.clientX - r.left));
  };
  const onTrackDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    scrub(e);
    dragging.current = true;
  };
  const onTrackMove = (e: React.PointerEvent) => { if (dragging.current && (e.buttons & 1)) scrub(e); };
  const onTrackUp = () => { dragging.current = false; };

  const dragHandle = (which: 'start' | 'end') => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = true;
    const move = (ev: PointerEvent) => {
      const r = box.current!.getBoundingClientRect();
      const tt = tAt(ev.clientX - r.left);
      if (which === 'start') {
        const v = clamp(tt, 0, clip.end - 1);
        updateClip(clip.id, { start: v });
        seek(v);
      } else {
        const v = clamp(tt, clip.start + 1, project.duration);
        updateClip(clip.id, { end: v });
        seek(Math.max(clip.start, v - 0.1));
      }
    };
    const up = () => {
      dragging.current = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const nudge = (which: 'start' | 'end') => (e: React.KeyboardEvent) => {
    const d = e.key === 'ArrowLeft' ? -0.1 : e.key === 'ArrowRight' ? 0.1 : 0;
    if (!d) return;
    e.preventDefault();
    const m = e.shiftKey ? 10 : 1;
    if (which === 'start') updateClip(clip.id, { start: clamp(clip.start + d * m, 0, clip.end - 1) });
    else updateClip(clip.id, { end: clamp(clip.end + d * m, clip.start + 1, project.duration) });
  };

  const handle = (which: 'start' | 'end') => {
    const px = x(which === 'start' ? clip.start : clip.end);
    return (
      <div
        role="slider" tabIndex={0}
        aria-label={which === 'start' ? 'Titik mulai klip' : 'Titik akhir klip'}
        aria-valuemin={0} aria-valuemax={project.duration} aria-valuenow={which === 'start' ? clip.start : clip.end}
        aria-valuetext={fmtTime(which === 'start' ? clip.start : clip.end, true)}
        onPointerDown={dragHandle(which)} onKeyDown={nudge(which)}
        className="absolute top-0 z-10 flex h-full w-4 -translate-x-1/2 cursor-ew-resize items-center justify-center"
        style={{ left: px }}
      >
        <div className="h-full w-[3px] rounded-full bg-hot" />
        <div className="absolute top-1/2 h-8 w-3.5 -translate-y-1/2 rounded-pill bg-hot shadow ring-2 ring-white/70 dark:ring-black/40" />
      </div>
    );
  };

  // klik pada jalur klip lain untuk memilihnya
  const onLaneClick = (e: React.MouseEvent) => {
    const r = box.current!.getBoundingClientRect();
    const tt = tAt(e.clientX - r.left);
    const hit = project.clips.find((k) => tt >= k.start && tt <= k.end);
    if (hit) select(hit.id);
  };

  return (
    <div ref={box} className="relative w-full select-none overflow-hidden rounded-2xl border border-line bg-surface" style={{ height: H, touchAction: 'none' }}>
      <canvas ref={cv} style={{ width: w, height: H }} className="absolute inset-0" onPointerDown={onTrackDown} onPointerMove={onTrackMove} onPointerUp={onTrackUp} aria-label="Gelombang suara. Klik untuk pindah posisi." />
      <div className="absolute inset-x-0 top-0 cursor-pointer" style={{ height: LANE }} onClick={onLaneClick} title="Klik untuk memilih klip" />
      {handle('start')}
      {handle('end')}
      {t >= a && t <= b && (
        <div className="pointer-events-none absolute top-0 z-20 h-full w-0.5 bg-ink" style={{ left: x(t) }}>
          <div className="absolute -left-[3px] top-0 h-2 w-2 rounded-full bg-ink" />
        </div>
      )}
    </div>
  );
}
