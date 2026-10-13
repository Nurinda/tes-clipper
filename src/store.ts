import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Aspect, AnalysisOptions, Clip, ContentStyle, Fit, Project } from './types';
import { analyzeVideo, STEP_LABELS, type StepId, type StepState } from './lib/analyze';
import { makeClip } from './lib/clipDefaults';
import { coverOf, pickCandidates } from './lib/cover';
import { regenSubs } from './lib/subtitles';
import { exportOne, zipResults, type ExportResult } from './lib/exporter';
import type { ExportOptions } from './lib/ffargs';
import { cancelFFmpeg } from './lib/ffmpeg';
import { getFile, saveFile, saveProject } from './lib/storage';
import { clamp, downloadBlob, slug, uid } from './lib/utils';

/* ------------------------------------------------------------------ */
/* Pengaturan (disimpan di localStorage)                               */
/* ------------------------------------------------------------------ */

export interface Settings {
  apiKey: string;
  model: string;
  models: string[];
  transcribeModel: string;
  theme: 'terang' | 'gelap';
  saveCopy: boolean;
  defaults: {
    aspect: Aspect;
    fit: Fit;
    targetDur: number;
    maxClips: number;
    contentStyle: ContentStyle;
    language: string;
  };
}

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void;
  setDefaults: (patch: Partial<Settings['defaults']>) => void;
}

const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      apiKey: '',
      model: 'gpt-5.5',
      models: [],
      transcribeModel: 'whisper-1',
      theme: prefersDark ? 'gelap' : 'terang',
      saveCopy: true,
      defaults: { aspect: '9:16', fit: 'blur', targetDur: 45, maxClips: 8, contentStyle: 'podcast', language: 'id' },
      set: (patch) => set(patch),
      setDefaults: (patch) => set((s) => ({ defaults: { ...s.defaults, ...patch } })),
    }),
    { name: 'clipper-settings' },
  ),
);

/* ------------------------------------------------------------------ */
/* Toast                                                               */
/* ------------------------------------------------------------------ */

export interface Toast { id: string; text: string; kind: 'info' | 'error' | 'ok' }
interface ToastStore { items: Toast[]; push: (text: string, kind?: Toast['kind']) => void; drop: (id: string) => void }
export const useToasts = create<ToastStore>((set) => ({
  items: [],
  push: (text, kind = 'info') => {
    const id = uid();
    set((s) => ({ items: [...s.items, { id, text, kind }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((t) => t.id !== id) })), kind === 'error' ? 8000 : 4000);
  },
  drop: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));
export const toast = (t: string, k: Toast['kind'] = 'info') => useToasts.getState().push(t, k);

/* ------------------------------------------------------------------ */
/* Playhead (dipisah supaya render tidak membebani seluruh halaman)    */
/* ------------------------------------------------------------------ */

export const usePlayhead = create<{ t: number; playing: boolean; set: (t: number) => void; setPlaying: (p: boolean) => void }>((set) => ({
  t: 0,
  playing: false,
  set: (t) => set({ t }),
  setPlaying: (playing) => set({ playing }),
}));

/* ------------------------------------------------------------------ */
/* Aplikasi                                                            */
/* ------------------------------------------------------------------ */

export type View = 'beranda' | 'analisis' | 'proyek' | 'pengaturan';

export interface Pending { file: File; duration: number; w: number; h: number }

export interface Job {
  id: string;
  clipId: string;
  title: string;
  status: 'antri' | 'jalan' | 'selesai' | 'gagal' | 'batal';
  progress: number;
  result?: ExportResult;
  error?: string;
}

interface AppState {
  view: View;
  project: Project | null;
  file: File | null;
  videoUrl: string | null;
  video: { w: number; h: number };
  needFile: boolean;
  selectedId: string | null;
  pending: Pending | null;
  steps: StepState[];
  analyzeError: string | null;
  past: Clip[];
  future: Clip[];
  jobs: Job[];
  exporting: boolean;
  ffStatus: string;
  coverBusy: { done: number; total: number } | null;

  go: (v: View) => void;
  pickFile: (f: File) => Promise<void>;
  clearPending: () => void;
  startAnalysis: (opts: AnalysisOptions) => Promise<void>;
  cancelAnalysis: () => void;
  openProject: (p: Project) => Promise<void>;
  attachFile: (f: File) => Promise<void>;
  closeProject: () => void;
  select: (id: string | null) => void;
  updateClip: (id: string, patch: Partial<Clip> | ((c: Clip) => Partial<Clip>)) => void;
  addClip: (start: number, end: number) => void;
  removeClip: (id: string) => void;
  duplicateClip: (id: string) => void;
  splitClip: (id: string, t: number) => void;
  undo: () => void;
  redo: () => void;
  renameProject: (name: string) => void;
  runExport: (clipIds: string[], opts: ExportOptions) => Promise<void>;
  cancelExport: () => void;
  downloadAll: () => Promise<void>;
  clearJobs: () => void;
  setFfStatus: (s: string) => void;
  autoCovers: () => Promise<void>;
  applyStyleToAll: (fromId: string) => void;
}

export function readVideoMeta(file: File): Promise<{ duration: number; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    const done = () => { URL.revokeObjectURL(url); };
    v.onloadedmetadata = () => {
      const r = { duration: v.duration, w: v.videoWidth, h: v.videoHeight };
      done();
      if (!isFinite(r.duration) || !r.w) reject(new Error('Browser belum bisa membaca video ini.'));
      else resolve(r);
    };
    v.onerror = () => {
      done();
      reject(new Error('Browser tidak bisa memutar video ini. Coba ekspor ulang ke MP4 (H.264) dulu, lalu pilih lagi.'));
    };
    v.src = url;
  });
}

let analysisCtl: AbortController | null = null;
let exportCtl: AbortController | null = null;
let lastChange = 0;
let lastChangeId = '';

const initialSteps = (useAi: boolean): StepState[] =>
  (['audio', 'energy', 'transcribe', 'highlight'] as StepId[]).map((id) => ({
    id,
    label: STEP_LABELS[id],
    ratio: 0,
    status: id === 'transcribe' && !useAi ? 'skip' : 'wait',
  }));

function setVideo(file: File | null, prevUrl: string | null) {
  if (prevUrl) URL.revokeObjectURL(prevUrl);
  return file ? URL.createObjectURL(file) : null;
}

export const useApp = create<AppState>((set, get) => ({
  view: 'beranda',
  project: null,
  file: null,
  videoUrl: null,
  video: { w: 1920, h: 1080 },
  needFile: false,
  selectedId: null,
  pending: null,
  steps: [],
  analyzeError: null,
  past: [],
  future: [],
  jobs: [],
  exporting: false,
  ffStatus: '',
  coverBusy: null,

  go: (view) => set({ view }),
  setFfStatus: (ffStatus) => set({ ffStatus }),

  pickFile: async (file) => {
    try {
      const m = await readVideoMeta(file);
      set({ pending: { file, duration: m.duration, w: m.w, h: m.h } });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  },
  clearPending: () => set({ pending: null }),

  startAnalysis: async (options) => {
    const { pending } = get();
    if (!pending) return;
    const s = useSettings.getState();
    analysisCtl = new AbortController();
    set({ view: 'analisis', steps: initialSteps(options.useAi), analyzeError: null });
    const update = (id: StepId, ratio: number, detail?: string) =>
      set((st) => {
        const idx = st.steps.findIndex((x) => x.id === id);
        return {
          steps: st.steps.map((x, i) => {
            if (x.status === 'skip') return x;
            if (i < idx) return { ...x, status: 'done', ratio: 1 };
            if (i === idx) return { ...x, ratio, detail: detail ?? x.detail, status: ratio >= 1 && id === 'highlight' ? 'done' : 'run' };
            return x;
          }),
        };
      });
    try {
      const project = await analyzeVideo({
        file: pending.file,
        duration: pending.duration,
        options,
        apiKey: s.apiKey,
        model: s.model,
        transcribeModel: s.transcribeModel,
        defaults: { aspect: s.defaults.aspect, fit: s.defaults.fit },
        onStep: update,
        signal: analysisCtl.signal,
      });
      const url = setVideo(pending.file, get().videoUrl);
      set({
        project, file: pending.file, videoUrl: url, video: { w: pending.w, h: pending.h },
        needFile: false, selectedId: project.clips[0]?.id ?? null, past: [], future: [],
        pending: null, view: 'proyek', jobs: [],
      });
      await saveProject(project);
      get().autoCovers();
      if (s.saveCopy && pending.file.size < 1.6e9) {
        saveFile(project.id, pending.file).then((ok) => {
          if (!ok) toast('Video terlalu besar untuk disimpan di browser. Saat membuka proyek ini lagi, kamu perlu memilih file videonya lagi.', 'info');
        });
      }
    } catch (e) {
      const err = e as Error;
      if (err.name === 'AbortError' || /terminate/i.test(err.message)) {
        set({ view: 'beranda' });
      } else {
        set({ analyzeError: err.message });
      }
    }
  },
  cancelAnalysis: () => {
    analysisCtl?.abort();
    cancelFFmpeg();
    set({ view: 'beranda', analyzeError: null });
  },

  openProject: async (p) => {
    set({ jobs: [] });
    const file = await getFile(p.id);
    if (file) {
      try {
        const m = await readVideoMeta(file);
        const url = setVideo(file, get().videoUrl);
        set({ project: p, file, videoUrl: url, video: { w: m.w, h: m.h }, needFile: false, selectedId: p.clips[0]?.id ?? null, past: [], future: [], view: 'proyek' });
        get().autoCovers();
        return;
      } catch { /* jatuh ke minta file */ }
    }
    const url = setVideo(null, get().videoUrl);
    set({ project: p, file: null, videoUrl: url, needFile: true, selectedId: p.clips[0]?.id ?? null, past: [], future: [], view: 'proyek' });
  },
  attachFile: async (file) => {
    const p = get().project;
    if (!p) return;
    try {
      const m = await readVideoMeta(file);
      if (Math.abs(m.duration - p.duration) > 2) {
        toast('Durasi video ini berbeda dari proyek. Pastikan kamu memilih video yang sama.', 'error');
        return;
      }
      const url = setVideo(file, get().videoUrl);
      set({ file, videoUrl: url, video: { w: m.w, h: m.h }, needFile: false });
      get().autoCovers();
      if (useSettings.getState().saveCopy && file.size < 1.6e9) saveFile(p.id, file);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  },
  closeProject: () => {
    const url = get().videoUrl;
    if (url) URL.revokeObjectURL(url);
    set({ project: null, file: null, videoUrl: null, selectedId: null, view: 'beranda', past: [], future: [], jobs: [] });
  },

  select: (selectedId) => set({ selectedId }),

  updateClip: (id, patch) => {
    const { project, past } = get();
    if (!project) return;
    const cur = project.clips.find((c) => c.id === id);
    if (!cur) return;
    const p = typeof patch === 'function' ? patch(cur) : patch;
    const next = { ...cur, ...p };
    if (next.end - next.start < 1) return;
    const now = Date.now();
    let newPast = past;
    if (now - lastChange > 500 || lastChangeId !== id) {
      newPast = [...past, cur].slice(-100);
      set({ future: [] });
    }
    lastChange = now;
    lastChangeId = id;
    set({ past: newPast, project: { ...project, clips: project.clips.map((c) => (c.id === id ? next : c)) } });
  },

  addClip: (start, end) => {
    const { project } = get();
    if (!project) return;
    const s = useSettings.getState();
    const c = makeClip(clamp(start, 0, project.duration - 1), clamp(end, 1, project.duration), { aspect: s.defaults.aspect, fit: s.defaults.fit }, { title: 'Klip baru' });
    set({ project: { ...project, clips: [...project.clips, c] }, selectedId: c.id });
  },
  removeClip: (id) => {
    const { project, selectedId } = get();
    if (!project) return;
    const clips = project.clips.filter((c) => c.id !== id);
    set({ project: { ...project, clips }, selectedId: selectedId === id ? clips[0]?.id ?? null : selectedId });
  },
  duplicateClip: (id) => {
    const { project } = get();
    const c = project?.clips.find((x) => x.id === id);
    if (!project || !c) return;
    const copy: Clip = { ...structuredClone(c), id: uid(), title: c.title + ' (salinan)' };
    set({ project: { ...project, clips: [...project.clips, copy] }, selectedId: copy.id });
  },
  splitClip: (id, t) => {
    const { project } = get();
    const c = project?.clips.find((x) => x.id === id);
    if (!project || !c) return;
    if (t - c.start < 1 || c.end - t < 1) { toast('Taruh playhead minimal 1 detik dari ujung klip untuk membagi.', 'info'); return; }
    const a: Clip = { ...c, end: t, title: c.title + ' (1)' };
    const b: Clip = { ...structuredClone(c), id: uid(), start: t, title: c.title + ' (2)' };
    const idx = project.clips.findIndex((x) => x.id === id);
    const clips = [...project.clips];
    clips.splice(idx, 1, a, b);
    set({ project: { ...project, clips }, selectedId: b.id });
  },

  undo: () => {
    const { past, project, selectedId, future } = get();
    const prev = past[past.length - 1];
    if (!prev || !project) return;
    const cur = project.clips.find((c) => c.id === prev.id);
    set({
      past: past.slice(0, -1),
      future: cur ? [...future, cur] : future,
      project: { ...project, clips: project.clips.map((c) => (c.id === prev.id ? prev : c)) },
      selectedId: selectedId === prev.id ? selectedId : prev.id,
    });
    lastChange = 0;
  },
  redo: () => {
    const { future, project, past } = get();
    const nxt = future[future.length - 1];
    if (!nxt || !project) return;
    const cur = project.clips.find((c) => c.id === nxt.id);
    set({
      future: future.slice(0, -1),
      past: cur ? [...past, cur] : past,
      project: { ...project, clips: project.clips.map((c) => (c.id === nxt.id ? nxt : c)) },
    });
    lastChange = 0;
  },

  renameProject: (name) => {
    const { project } = get();
    if (project) set({ project: { ...project, name } });
  },

  runExport: async (clipIds, opts) => {
    const { project, file, video } = get();
    if (!project || !file) { toast('Pilih file videonya dulu.', 'error'); return; }
    exportCtl = new AbortController();
    const ctl = exportCtl;
    const jobs: Job[] = clipIds.map((id) => ({
      id: uid(), clipId: id, title: project.clips.find((c) => c.id === id)?.title ?? 'Klip', status: 'antri', progress: 0,
    }));
    set((s) => ({ jobs: [...s.jobs.filter((j) => !clipIds.includes(j.clipId)), ...jobs], exporting: true }));
    const patch = (id: string, p: Partial<Job>) => set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...p } : j)) }));

    for (const job of jobs) {
      if (ctl.signal.aborted) { patch(job.id, { status: 'batal' }); continue; }
      const clip = get().project?.clips.find((c) => c.id === job.clipId);
      if (!clip) { patch(job.id, { status: 'gagal', error: 'Klip sudah dihapus.' }); continue; }
      patch(job.id, { status: 'jalan', progress: 0 });
      try {
        const index = get().project!.clips.findIndex((c) => c.id === clip.id);
        const result = await exportOne({
          file, clip, srcW: video.w, srcH: video.h, opts, index,
          onProgress: (r) => patch(job.id, { progress: r }),
          signal: ctl.signal,
        });
        patch(job.id, { status: 'selesai', progress: 1, result });
      } catch (e) {
        const msg = (e as Error).message;
        if (ctl.signal.aborted) patch(job.id, { status: 'batal' });
        else patch(job.id, { status: 'gagal', error: msg });
      }
    }
    set({ exporting: false });
  },
  cancelExport: () => {
    exportCtl?.abort();
    cancelFFmpeg();
    set((s) => ({ exporting: false, jobs: s.jobs.map((j) => (j.status === 'jalan' || j.status === 'antri' ? { ...j, status: 'batal' } : j)) }));
  },
  downloadAll: async () => {
    const done = get().jobs.filter((j) => j.status === 'selesai' && j.result).map((j) => j.result!);
    if (!done.length) return;
    const blob = await zipResults(done);
    downloadBlob(blob, `${slug(get().project?.name || 'klip')}-klip.zip`);
  },
  clearJobs: () => set({ jobs: [] }),

  /** Pilih frame sampul terbaik untuk tiap klip yang belum punya, di latar belakang. */
  autoCovers: async () => {
    const st = get();
    const file = st.file;
    const project = st.project;
    if (!file || !project || st.coverBusy) return;
    const todo = project.clips.filter((c) => coverOf(c).time === null).map((c) => c.id);
    if (!todo.length) return;
    set({ coverBusy: { done: 0, total: todo.length } });
    for (let i = 0; i < todo.length; i++) {
      if (get().file !== file) break;
      const clip = get().project?.clips.find((c) => c.id === todo[i]);
      if (clip) {
        try {
          const best = (await pickCandidates(file, clip, 8))[0];
          if (best) {
            const cur = get().project;
            if (cur) {
              set({
                project: {
                  ...cur,
                  clips: cur.clips.map((c) => {
                    if (c.id !== clip.id) return c;
                    const cv = coverOf(c);
                    return { ...c, cover: { ...cv, time: best.t, focusX: best.fx ?? cv.focusX, focusY: best.fy ?? cv.focusY } };
                  }),
                },
              });
            }
          }
        } catch { /* lewati klip ini */ }
      }
      set({ coverBusy: { done: i + 1, total: todo.length } });
    }
    set({ coverBusy: null });
  },

  /** Salin gaya (rasio, subtitle, logo, warna, sampul) dari satu klip ke semua klip lain. */
  applyStyleToAll: (fromId) => {
    const { project } = get();
    const src = project?.clips.find((c) => c.id === fromId);
    if (!project || !src) return;
    const sc = coverOf(src);
    const clips = project.clips.map((c) => {
      if (c.id === fromId) return c;
      let subs = { ...c.subs, style: src.subs.style, font: src.subs.font, size: src.subs.size, color: src.subs.color, hlColor: src.subs.hlColor, position: src.subs.position };
      if (project.transcript && !c.subs.edited && c.subs.maxWords !== src.subs.maxWords) {
        subs = regenSubs(project.transcript, { ...c, subs: { ...subs, maxWords: src.subs.maxWords } });
      }
      const cc = coverOf(c);
      return {
        ...c,
        aspect: src.aspect, fit: src.fit,
        brightness: src.brightness, contrast: src.contrast, saturation: src.saturation,
        fadeIn: src.fadeIn, fadeOut: src.fadeOut, normalize: src.normalize,
        subs,
        watermark: structuredClone(src.watermark),
        cover: { ...cc, template: sc.template, color: sc.color, accent: sc.accent, logo: sc.logo, textSize: sc.textSize },
      };
    });
    set({ project: { ...project, clips } });
    toast(`Gaya dari klip ini sudah diterapkan ke ${clips.length - 1} klip lain.`, 'ok');
  },
}));
