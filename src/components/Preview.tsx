import { useEffect, useMemo, useRef, useState } from 'react';
import { Move } from 'lucide-react';
import type { Clip } from '../types';
import { ASPECT_RATIO } from '../types';
import { useApp, usePlayhead } from '../store';
import { player, togglePlay } from '../lib/player';
import { FONT_FILES } from '../lib/subtitles';

function BlurBg({ video, w, h }: { video: HTMLVideoElement | null; w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const t = usePlayhead((s) => s.t);
  useEffect(() => {
    const c = ref.current;
    if (!c || !video || !video.videoWidth) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const sw = video.videoWidth, sh = video.videoHeight;
    const tr = w / h, sr = sw / sh;
    let cw = sw, ch = sh;
    if (sr > tr) cw = sh * tr; else ch = sw / tr;
    ctx.drawImage(video, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, c.width, c.height);
  }, [t, video, w, h]);
  return <canvas ref={ref} width={48} height={Math.max(8, Math.round(48 * (h / w)))} className="absolute inset-0 h-full w-full scale-125 blur-xl" aria-hidden />;
}

export default function Preview({ clip }: { clip: Clip }) {
  const { videoUrl, video, updateClip } = useApp();
  const t = usePlayhead((s) => s.t);
  const wrap = useRef<HTMLDivElement>(null);
  const vref = useRef<HTMLVideoElement>(null);
  const [box, setBox] = useState({ w: 640, h: 560 });
  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  const [hint, setHint] = useState(true);

  const ar = clip.aspect === 'asli' ? video.w / video.h : ASPECT_RATIO[clip.aspect][0] / ASPECT_RATIO[clip.aspect][1];

  useEffect(() => {
    const r = wrap.current;
    if (!r) return;
    const ro = new ResizeObserver(() => setBox({ w: r.clientWidth, h: Math.min(window.innerHeight * 0.62, 700) }));
    ro.observe(r);
    setBox({ w: r.clientWidth, h: Math.min(window.innerHeight * 0.62, 700) });
    return () => ro.disconnect();
  }, []);

  const fw = Math.max(120, Math.min(box.w, box.h * ar));
  const fh = fw / ar;

  // daftarkan elemen video
  useEffect(() => {
    player.el = vref.current;
    setEl(vref.current);
    return () => { player.el = null; };
  }, [videoUrl]);

  // pindah ke awal klip saat klip berganti
  useEffect(() => {
    const v = vref.current;
    if (!v) return;
    const go = () => { v.currentTime = clip.start; usePlayhead.getState().set(clip.start); };
    if (v.readyState >= 1) go(); else v.addEventListener('loadedmetadata', go, { once: true });
    v.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.id, videoUrl]);

  useEffect(() => { if (vref.current) { vref.current.playbackRate = clip.speed; vref.current.volume = Math.min(1, clip.volume); } }, [clip.speed, clip.volume, videoUrl]);

  // loop pemutaran di dalam rentang klip
  useEffect(() => {
    const v = vref.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      if (!v.paused) {
        if (v.currentTime >= clip.end - 0.02 || v.currentTime < clip.start - 0.3) {
          v.currentTime = clip.start;
        }
        usePlayhead.getState().set(v.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onPlay = () => { usePlayhead.getState().setPlaying(true); if (v.currentTime >= clip.end - 0.05 || v.currentTime < clip.start) v.currentTime = clip.start; };
    const onPause = () => usePlayhead.getState().setPlaying(false);
    const onSeeked = () => usePlayhead.getState().set(v.currentTime);
    v.addEventListener('play', onPlay); v.addEventListener('pause', onPause); v.addEventListener('seeked', onSeeked);
    return () => { cancelAnimationFrame(raf); v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause); v.removeEventListener('seeked', onSeeked); };
  }, [clip.start, clip.end, videoUrl]);

  // geser bingkai (mode potong tengah)
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const vr = video.w / video.h;
  const cover = clip.fit === 'crop' || clip.aspect === 'asli';
  const overflowX = Math.max(0, (vr > ar ? fh * vr - fw : 0));
  const overflowY = Math.max(0, (vr < ar ? fw / vr - fh : 0));

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: clip.posX, py: clip.posY, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (!d.moved || !cover) return;
    setHint(false);
    const patch: Partial<Clip> = {};
    if (overflowX > 1) patch.posX = Math.min(1, Math.max(0, d.px - dx / overflowX));
    if (overflowY > 1) patch.posY = Math.min(1, Math.max(0, d.py - dy / overflowY));
    updateClip(clip.id, patch);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) togglePlay();
  };

  const css = `brightness(${1 + clip.brightness * 1.6}) contrast(${clip.contrast}) saturate(${clip.saturation})`;
  const font = FONT_FILES[clip.subs.font];
  const line = clip.subs.enabled ? clip.subs.lines.find((l) => t >= l.s && t < l.e) : undefined;
  const subFs = (fw * clip.subs.size) / 100;
  const rel = t - clip.start;

  const subPos = useMemo(() => {
    const p = clip.subs.position;
    return p === 'atas' ? { top: '9%' } : p === 'tengah' ? { top: '50%', transform: 'translateY(-50%)' } : { bottom: '12%' };
  }, [clip.subs.position]);

  const wmSrc = clip.watermark.source === 'custom' ? clip.watermark.customDataUrl : clip.watermark.source === 'kumparan' ? '/wm-kumparan.png' : '/wm-kumparan-putih.png';
  const wmPos: Record<string, React.CSSProperties> = {
    ka: { top: '4%', right: '4%' }, ki: { top: '4%', left: '4%' }, ba: { bottom: '4%', right: '4%' }, bi: { bottom: '4%', left: '4%' },
  };

  return (
    <div ref={wrap} className="flex w-full justify-center">
      <div
        className="relative select-none overflow-hidden rounded-2xl bg-black shadow-lg ring-1 ring-line"
        style={{ width: fw, height: fh, touchAction: cover ? 'none' : 'auto', cursor: cover && (overflowX > 1 || overflowY > 1) ? 'grab' : 'pointer' }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
      >
        {clip.fit === 'blur' && clip.aspect !== 'asli' && <BlurBg video={el} w={fw} h={fh} />}
        <video
          ref={vref}
          src={videoUrl ?? undefined}
          playsInline
          preload="auto"
          className="absolute inset-0 h-full w-full"
          style={{ objectFit: cover ? 'cover' : 'contain', objectPosition: `${clip.posX * 100}% ${clip.posY * 100}%`, filter: css }}
        />

        {clip.overlays.map((o) =>
          rel >= o.s && rel < o.e && o.text.trim() ? (
            <div
              key={o.id}
              className="pointer-events-none absolute text-center font-extrabold leading-tight"
              style={{
                left: `${o.x * 100}%`, top: `${o.y * 100}%`, transform: 'translate(-50%,-50%)',
                maxWidth: '88%', fontSize: (fw * o.size) / 100, color: o.color, fontFamily: font.css,
                background: o.bg ?? undefined, padding: o.bg ? '0.15em 0.4em' : undefined, borderRadius: o.bg ? '0.2em' : undefined,
                WebkitTextStroke: o.bg ? undefined : `${Math.max(1, (fw * o.size) / 100 / 12)}px #000`, paintOrder: 'stroke fill',
              }}
            >
              {o.text}
            </div>
          ) : null,
        )}

        {line && (
          <div className="pointer-events-none absolute inset-x-0 flex justify-center px-[6%] text-center" style={subPos}>
            <span
              className="leading-tight"
              style={{
                fontSize: subFs, fontFamily: font.css, fontWeight: clip.subs.font === 'poppins' ? 700 : clip.subs.font === 'bebas' ? 400 : 800,
                color: clip.subs.color,
                WebkitTextStroke: clip.subs.style === 'kotak' || clip.subs.style === 'minimal' ? undefined : `${subFs * (clip.subs.style === 'garis' ? 0.2 : 0.12)}px #000`,
                paintOrder: 'stroke fill',
                background: clip.subs.style === 'kotak' ? 'rgba(0,0,0,.82)' : undefined,
                padding: clip.subs.style === 'kotak' ? '0.12em 0.4em' : undefined,
                borderRadius: clip.subs.style === 'kotak' ? '0.18em' : undefined,
                textShadow: clip.subs.style === 'minimal' ? '0 2px 6px rgba(0,0,0,.7)' : undefined,
              }}
            >
              {clip.subs.style === 'karaoke' && line.words?.length
                ? line.words.map((w, i) => (
                    <span key={i} style={{ color: t >= w.s ? clip.subs.hlColor : clip.subs.color }}>{w.w}{' '}</span>
                  ))
                : line.text}
            </span>
          </div>
        )}

        {clip.watermark.enabled && wmSrc && (
          <img
            src={wmSrc} alt="" className="pointer-events-none absolute"
            style={{ ...wmPos[clip.watermark.corner], width: `${clip.watermark.size}%`, opacity: clip.watermark.opacity }}
          />
        )}

        {cover && hint && (overflowX > 1 || overflowY > 1) && (
          <div className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-pill bg-black/65 px-3 py-1 text-xs font-bold text-white">
            <Move size={13} /> Geser untuk mengatur bingkai
          </div>
        )}
      </div>
    </div>
  );
}
