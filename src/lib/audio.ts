import { exec, runExclusive, safeDelete, withMountedFile } from './ffmpeg';
import type { EnergyData } from '../types';

export const CHUNK_SEC = 600; // 10 menit per potongan audio untuk transkripsi
export const ENERGY_STEP = 0.25;

export interface AudioChunk { bytes: Uint8Array; offset: number; duration: number }

/** Ambil audio dari video, mono 16 kHz, lalu potong per 10 menit. */
export async function extractAudioChunks(
  file: File,
  onProgress: (r: number) => void,
): Promise<Uint8Array[]> {
  return runExclusive((ff) =>
    withMountedFile(ff, file, async (path) => {
      await exec(
        ff,
        [
          '-i', path, '-vn', '-ac', '1', '-ar', '16000',
          '-c:a', 'libmp3lame', '-b:a', '32k',
          '-f', 'segment', '-segment_time', String(CHUNK_SEC), '-reset_timestamps', '1',
          'aud%03d.mp3',
        ],
        onProgress,
      );
      const listing = await ff.listDir('/');
      const names = listing
        .filter((n) => !n.isDir && /^aud\d+\.mp3$/.test(n.name))
        .map((n) => n.name)
        .sort();
      if (!names.length) throw new Error('Video ini sepertinya tidak punya suara, jadi tidak ada yang bisa dianalisis.');
      const out: Uint8Array[] = [];
      for (const name of names) {
        const data = (await ff.readFile(name)) as Uint8Array;
        out.push(new Uint8Array(data)); // salin supaya aman setelah file dihapus
        await safeDelete(ff, name);
      }
      return out;
    }),
  );
}

/** Decode tiap potongan: hitung durasi asli dan energi suara per 0,25 detik. */
export async function analyzeChunks(
  chunks: Uint8Array[],
  onProgress: (r: number) => void,
): Promise<{ chunks: AudioChunk[]; energy: EnergyData }> {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC({ sampleRate: 16000 });
  const out: AudioChunk[] = [];
  const rms: number[] = [];
  let offset = 0;
  try {
    for (let i = 0; i < chunks.length; i++) {
      const buf = await ctx.decodeAudioData(chunks[i].slice().buffer);
      const data = buf.getChannelData(0);
      const per = Math.round(buf.sampleRate * ENERGY_STEP);
      const n = Math.ceil(data.length / per);
      for (let k = 0; k < n; k++) {
        let sum = 0;
        const a = k * per;
        const b = Math.min(data.length, a + per);
        for (let j = a; j < b; j++) sum += data[j] * data[j];
        rms.push(Math.sqrt(sum / Math.max(1, b - a)));
      }
      out.push({ bytes: chunks[i], offset, duration: buf.duration });
      offset += buf.duration;
      onProgress((i + 1) / chunks.length);
    }
  } finally {
    ctx.close().catch(() => undefined);
  }
  return { chunks: out, energy: normalizeEnergy(rms) };
}

export function normalizeEnergy(raw: number[]): EnergyData {
  const sorted = [...raw].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const peak = Math.max(p95, 1e-6);
  // haluskan sedikit supaya lonjakan sesaat tidak mendominasi
  const norm = raw.map((v) => Math.min(1, v / peak));
  const rms = norm.map((v, i) => (norm[i - 1] ?? v) * 0.25 + v * 0.5 + (norm[i + 1] ?? v) * 0.25);

  // Cari jeda: ≥0,4 detik berturut-turut dengan energi sangat rendah
  const silence: number[] = [];
  const need = Math.round(0.4 / ENERGY_STEP);
  const silentAll = p95 < 0.002;
  let run = 0;
  for (let i = 0; i < rms.length; i++) {
    if (rms[i] < 0.12 || silentAll) {
      run++;
    } else {
      if (run >= need) silence.push(((i - run / 2) * ENERGY_STEP));
      run = 0;
    }
  }
  if (run >= need) silence.push(((rms.length - run / 2) * ENERGY_STEP));
  return { step: ENERGY_STEP, rms, silence };
}

export function energyAt(e: EnergyData | null, t: number): number {
  if (!e) return 0;
  return e.rms[Math.floor(t / e.step)] ?? 0;
}

export function meanEnergy(e: EnergyData | null, a: number, b: number): number {
  if (!e) return 0;
  const i0 = Math.max(0, Math.floor(a / e.step));
  const i1 = Math.min(e.rms.length, Math.ceil(b / e.step));
  if (i1 <= i0) return 0;
  let s = 0;
  let peaks = 0;
  for (let i = i0; i < i1; i++) {
    s += e.rms[i];
    if (e.rms[i] > 0.75) peaks++;
  }
  const mean = s / (i1 - i0);
  const peakRatio = peaks / (i1 - i0);
  return Math.min(1, mean * 0.7 + peakRatio * 0.9);
}

export function nearestSilence(e: EnergyData | null, t: number, range: number): number | null {
  if (!e) return null;
  let best: number | null = null;
  let bd = range;
  for (const s of e.silence) {
    const d = Math.abs(s - t);
    if (d <= bd) { bd = d; best = s; }
  }
  return best;
}
