import type { Clip, CoverSettings } from '../types';
import { DEFAULT_COVER } from './clipDefaults';
import { clamp } from './utils';

export const coverOf = (c: Clip): CoverSettings => ({ ...DEFAULT_COVER, ...(c.cover || {}) });

export function coverText(c: Clip): string {
  const cv = coverOf(c);
  const raw = (cv.text ?? (c.hook || c.title) ?? '').trim();
  if (cv.text !== null) return raw;
  const words = raw.split(/\s+/);
  return words.length > 9 ? words.slice(0, 9).join(' ') + '…' : raw;
}

/* ---------- akses video (satu elemen, satu antrean) ---------- */

let cur: { file: File; video: HTMLVideoElement; url: string; ready: Promise<void> } | null = null;
let queue: Promise<unknown> = Promise.resolve();
function task<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn);
  queue = p.catch(() => undefined);
  return p;
}

async function getVideo(file: File): Promise<HTMLVideoElement> {
  if (cur && cur.file === file) { await cur.ready; return cur.video; }
  if (cur) URL.revokeObjectURL(cur.url);
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true;
  v.preload = 'auto';
  v.playsInline = true;
  v.src = url;
  const ready = new Promise<void>((res, rej) => {
    v.onloadeddata = () => res();
    v.onerror = () => rej(new Error('Video tidak bisa dibaca untuk membuat sampul.'));
  });
  cur = { file, video: v, url, ready };
  await ready;
  return v;
}

function seekTo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res) => {
    if (Math.abs(v.currentTime - t) < 0.02 && v.readyState >= 2) { res(); return; }
    const done = () => { v.removeEventListener('seeked', done); clearTimeout(to); res(); };
    const to = setTimeout(done, 6000);
    v.addEventListener('seeked', done);
    v.currentTime = t;
  });
}

const frames = new Map<string, HTMLCanvasElement>();
function remember(key: string, c: HTMLCanvasElement) {
  frames.set(key, c);
  if (frames.size > 60) frames.delete(frames.keys().next().value as string);
}

/** Ambil satu frame video sebagai kanvas (lebar maksimal maxW). */
export function getFrame(file: File, t: number, maxW = 1280): Promise<HTMLCanvasElement> {
  const key = `${file.name}|${file.size}|${t.toFixed(2)}|${maxW}`;
  const hit = frames.get(key);
  if (hit) return Promise.resolve(hit);
  return task(async () => {
    const v = await getVideo(file);
    await seekTo(v, clamp(t, 0, Math.max(0, v.duration - 0.05)));
    const k = Math.min(1, maxW / v.videoWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * k);
    c.height = Math.round(v.videoHeight * k);
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    remember(key, c);
    return c;
  });
}

/* ---------- penilaian frame ---------- */

interface Face { x: number; y: number; area: number }
let fd: { detect: (c: HTMLCanvasElement) => Promise<{ boundingBox: DOMRectReadOnly }[]> } | null | undefined;

async function detectFace(c: HTMLCanvasElement): Promise<Face | null> {
  if (fd === undefined) {
    const FD = (window as unknown as { FaceDetector?: new (o: object) => NonNullable<typeof fd> }).FaceDetector;
    try { fd = FD ? new FD({ fastMode: true, maxDetectedFaces: 3 }) : null; } catch { fd = null; }
  }
  if (!fd) return null;
  try {
    const found = await fd.detect(c);
    if (!found.length) return null;
    const b = found.sort((a, z) => z.boundingBox.width * z.boundingBox.height - a.boundingBox.width * a.boundingBox.height)[0].boundingBox;
    return { x: (b.x + b.width / 2) / c.width, y: (b.y + b.height / 2) / c.height, area: (b.width * b.height) / (c.width * c.height) };
  } catch { return null; }
}

function scoreCanvas(src: HTMLCanvasElement): number {
  const w = 96, h = Math.max(24, Math.round((96 * src.height) / src.width));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  let sum = 0, colorful = 0;
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
    g[i] = 0.299 * r + 0.587 * gg + 0.114 * b;
    sum += g[i];
    colorful += Math.abs(r - gg) + Math.abs(0.5 * (r + gg) - b);
  }
  const mean = sum / (w * h);
  let varSum = 0;
  for (let i = 0; i < g.length; i++) varSum += (g[i] - mean) ** 2;
  const std = Math.sqrt(varSum / g.length);
  let lap = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
      lap += l * l; n++;
    }
  }
  const sharp = Math.min(1, Math.log1p(lap / n) / Math.log1p(900));
  const bright = 1 - Math.min(1, Math.abs(mean / 255 - 0.5) / 0.5);
  const contrast = Math.min(1, std / 70);
  const color = Math.min(1, colorful / (w * h) / 60);
  let score = 0.4 * sharp + 0.2 * bright + 0.2 * contrast + 0.2 * color;
  if (mean < 28) score *= 0.3; // hampir gelap
  return score;
}

export interface Candidate { t: number; score: number; fx: number | null; fy: number | null; thumb: string }

/** Ambil beberapa frame dari klip, nilai, lalu urutkan dari yang terbaik. */
export async function pickCandidates(file: File, clip: Clip, n = 10): Promise<Candidate[]> {
  const dur = clip.end - clip.start;
  const out: Candidate[] = [];
  for (let i = 0; i < n; i++) {
    const t = clip.start + dur * (0.06 + (0.88 * i) / Math.max(1, n - 1));
    const fr = await getFrame(file, t, 640);
    let score = scoreCanvas(fr);
    const face = await detectFace(fr);
    if (face) score += 0.2 + Math.min(0.15, face.area * 2);
    const tc = document.createElement('canvas');
    tc.width = 160; tc.height = Math.round((160 * fr.height) / fr.width);
    tc.getContext('2d')!.drawImage(fr, 0, 0, tc.width, tc.height);
    out.push({ t, score, fx: face ? face.x : null, fy: face ? face.y : null, thumb: tc.toDataURL('image/jpeg', 0.7) });
  }
  return out.sort((a, b) => b.score - a.score);
}

/* ---------- menggambar sampul ---------- */

let fontsReady: Promise<unknown> | null = null;
export function ensureFonts() {
  if (!fontsReady) fontsReady = document.fonts.load("800 40px ClipMontserrat").catch(() => undefined);
  return fontsReady;
}

let logoImg: Promise<HTMLImageElement | null> | null = null;
export function getLogo(): Promise<HTMLImageElement | null> {
  if (!logoImg) {
    logoImg = new Promise((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => res(null);
      i.src = `${import.meta.env.BASE_URL}wm-kumparan-putih.png`;
    });
  }
  return logoImg;
}

const FONT = (px: number) => `800 ${px}px ClipMontserrat, 'Nunito Variable', sans-serif`;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const test = cur ? `${cur} ${w}` : w;
    if (!cur || ctx.measureText(test).width <= maxW) cur = test;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function fit(ctx: CanvasRenderingContext2D, text: string, W: number, base: number, maxLines: number, widthFactor = 0.84) {
  const maxW = W * widthFactor;
  let size = base;
  let lines: string[] = [];
  for (;;) {
    ctx.font = FONT(size);
    lines = wrap(ctx, text, maxW);
    const tooWide = lines.some((l) => ctx.measureText(l).width > maxW);
    if ((lines.length <= maxLines && !tooWide) || size < W * 0.04) break;
    size *= 0.93;
  }
  return { size, lines };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawCover(
  ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, clip: Clip, W: number, H: number, logo: HTMLImageElement | null,
) {
  const cv = coverOf(clip);
  const sw = src.width, sh = src.height;
  let cw = sw, ch = sh;
  if (sw / sh > W / H) cw = sh * (W / H); else ch = sw / (W / H);
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.filter = 'contrast(1.08) saturate(1.15)';
  ctx.drawImage(src, (sw - cw) * cv.focusX, (sh - ch) * cv.focusY, cw, ch, 0, 0, W, H);
  ctx.filter = 'none';
  ctx.restore();

  // bayangan halus di atas supaya logo tetap terbaca
  const top = ctx.createLinearGradient(0, 0, 0, H * 0.22);
  top.addColorStop(0, 'rgba(0,0,0,.4)'); top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top; ctx.fillRect(0, 0, W, H * 0.22);

  const text = coverText(clip);
  const vertical = H >= W;
  const margin = W * 0.07;

  if (cv.template === 'bawah' && text) {
    const g = ctx.createLinearGradient(0, H * (vertical ? 0.36 : 0.3), 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.9)');
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.3, W, H * 0.7);
    const { size, lines } = fit(ctx, text.toUpperCase(), W, W * 0.115 * cv.textSize * (vertical ? 1 : 0.6), vertical ? 4 : 3);
    ctx.font = FONT(size);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const lh = size * 1.12;
    const blockH = lines.length * lh;
    const y0 = H - margin * (vertical ? 1.9 : 1.2) - blockH;
    // garis aksen merah kumparan
    ctx.fillStyle = '#ED1847';
    roundRect(ctx, margin, y0 - size * 0.45, W * 0.14, Math.max(6, size * 0.14), size * 0.07); ctx.fill();
    lines.forEach((l, i) => {
      const y = y0 + (i + 1) * lh - size * 0.18;
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.18;
      ctx.strokeStyle = 'rgba(0,0,0,.85)';
      ctx.strokeText(l, margin, y);
      ctx.fillStyle = lines.length > 1 && i === lines.length - 1 ? cv.accent : cv.color;
      ctx.fillText(l, margin, y);
    });
  } else if (cv.template === 'kotak' && text) {
    ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.fillRect(0, 0, W, H);
    const { size, lines } = fit(ctx, text, W, W * 0.095 * cv.textSize * (vertical ? 1 : 0.62), vertical ? 4 : 3, 0.7);
    ctx.font = FONT(size);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const lh = size * 1.18;
    const pad = size * 0.55;
    const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const bw = tw + pad * 2, bh = lines.length * lh + pad * 1.5;
    const bx = margin, by = H - margin * (vertical ? 2 : 1.3) - bh;
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = size * 0.4; ctx.shadowOffsetY = size * 0.12;
    ctx.fillStyle = '#00B2B1';
    roundRect(ctx, bx, by, bw, bh, size * 0.5); ctx.fill();
    ctx.shadowColor = 'transparent';
    // pojok merah, mengingatkan pada huruf “u” di logo
    ctx.fillStyle = '#ED1847';
    roundRect(ctx, bx - size * 0.15, by - size * 0.15, size * 0.75, size * 0.75, size * 0.3); ctx.fill();
    ctx.fillStyle = cv.color;
    lines.forEach((l, i) => ctx.fillText(l, bx + pad, by + pad * 0.75 + (i + 1) * lh - size * 0.22));
  } else {
    const g = ctx.createLinearGradient(0, H * 0.7, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.7, W, H * 0.3);
  }

  if (cv.logo && logo) {
    const lw = W * 0.24;
    const lhh = (lw * logo.height) / logo.width;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = W * 0.012;
    ctx.drawImage(logo, W - lw - W * 0.05, W * 0.05, lw, lhh);
    ctx.restore();
  }
}

/** Pilih frame terbaik kalau belum dipilih, lalu kembalikan waktu dan fokusnya. */
export async function resolveCover(file: File, clip: Clip): Promise<CoverSettings> {
  const cv = coverOf(clip);
  if (cv.time !== null) return cv;
  const best = (await pickCandidates(file, clip, 8))[0];
  if (!best) return { ...cv, time: clip.start + (clip.end - clip.start) * 0.25 };
  return { ...cv, time: best.t, focusX: best.fx ?? cv.focusX, focusY: best.fy !== null ? clamp(best.fy, 0, 1) : cv.focusY };
}

export async function renderCoverBlob(file: File, clip: Clip, W: number, H: number, type: 'image/jpeg' | 'image/png' = 'image/jpeg'): Promise<Blob> {
  const cv = await resolveCover(file, clip);
  const full = { ...clip, cover: cv };
  const [src, logo] = await Promise.all([getFrame(file, cv.time!, 1920), getLogo(), ensureFonts()]);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  drawCover(c.getContext('2d')!, src, full, W, H, logo);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Gagal membuat sampul'))), type, 0.92));
}

const thumbs = new Map<string, string>();
/** Gambar sampul kecil untuk daftar klip. */
export async function coverDataUrl(file: File, clip: Clip, width: number, aspect: number): Promise<string> {
  const cv = coverOf(clip);
  const t = cv.time ?? clip.start + (clip.end - clip.start) * 0.25;
  const key = `${file.name}|${file.size}|${width}|${t.toFixed(2)}|${JSON.stringify(cv)}|${coverText(clip)}|${aspect.toFixed(3)}`;
  const hit = thumbs.get(key);
  if (hit) return hit;
  const [src, logo] = await Promise.all([getFrame(file, t, 640), getLogo(), ensureFonts()]);
  const W = width * 3, H = Math.round(W / aspect);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  drawCover(c.getContext('2d')!, src, clip, W, H, logo);
  const url = c.toDataURL('image/jpeg', 0.7);
  thumbs.set(key, url);
  if (thumbs.size > 200) thumbs.delete(thumbs.keys().next().value as string);
  return url;
}
