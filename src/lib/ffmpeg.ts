import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';

let ff: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;
let queue: Promise<unknown> = Promise.resolve();
let logTail: string[] = [];

export type LoadStatus = (msg: string) => void;
let statusCb: LoadStatus | null = null;
export function onFfmpegStatus(cb: LoadStatus | null) { statusCb = cb; }

async function load(): Promise<FFmpeg> {
  const inst = new FFmpeg();
  inst.on('log', ({ message }) => {
    logTail.push(message);
    if (logTail.length > 40) logTail.shift();
  });
  const base = `${import.meta.env.BASE_URL}ffmpeg/`;
  statusCb?.('Menyiapkan mesin video (sekitar 30 MB, hanya sekali)…');
  await inst.load({
    coreURL: `${base}ffmpeg-core.js`,
    wasmURL: `${base}ffmpeg-core.wasm`,
  });
  statusCb?.('');
  return inst;
}

export function getFFmpeg(): Promise<FFmpeg> {
  if (ff) return Promise.resolve(ff);
  if (!loading) {
    loading = load()
      .then((i) => { ff = i; return i; })
      .catch((e) => { loading = null; throw new Error('Mesin video gagal dimuat. Coba muat ulang halaman. (' + (e?.message || e) + ')'); });
  }
  return loading;
}

/** Jalankan tugas ffmpeg satu per satu supaya tidak bentrok. */
export function runExclusive<T>(task: (ff: FFmpeg) => Promise<T>): Promise<T> {
  const p = queue.then(() => getFFmpeg()).then(task);
  queue = p.catch(() => undefined);
  return p;
}

/** Hentikan proses yang sedang jalan. Mesin akan dimuat ulang saat dibutuhkan. */
export function cancelFFmpeg() {
  try { ff?.terminate(); } catch { /* abaikan */ }
  ff = null;
  loading = null;
}

export async function exec(
  inst: FFmpeg,
  args: string[],
  onProgress?: (ratio: number) => void,
): Promise<void> {
  logTail = [];
  const handler = ({ progress }: { progress: number }) => {
    if (onProgress && isFinite(progress)) onProgress(Math.min(1, Math.max(0, progress)));
  };
  inst.on('progress', handler);
  let code: number;
  try {
    code = await inst.exec(args);
  } finally {
    inst.off('progress', handler);
  }
  if (code !== 0) {
    const tail = logTail.filter((l) => l.trim()).slice(-6).join('\n');
    throw new Error('Proses video gagal.\n' + tail);
  }
}

/** Pasang file video dari komputer tanpa menyalinnya ke memori. */
export async function withMountedFile<T>(
  inst: FFmpeg,
  file: File,
  fn: (path: string) => Promise<T>,
): Promise<T> {
  const mount = '/in';
  try { await inst.createDir(mount); } catch { /* sudah ada */ }
  await inst.mount(FFFSType.WORKERFS, { files: [file] }, mount);
  try {
    return await fn(`${mount}/${file.name}`);
  } finally {
    try { await inst.unmount(mount); } catch { /* abaikan */ }
    try { await inst.deleteDir(mount); } catch { /* abaikan */ }
  }
}

export async function ensureDir(inst: FFmpeg, path: string) {
  try { await inst.createDir(path); } catch { /* sudah ada */ }
}

export async function safeDelete(inst: FFmpeg, path: string) {
  try { await inst.deleteFile(path); } catch { /* abaikan */ }
}
