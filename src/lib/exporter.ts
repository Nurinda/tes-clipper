import { zipSync } from 'fflate';
import type { Clip } from '../types';
import { buildCopyArgs, buildRenderArgs, outputSize, type ExportOptions } from './ffargs';
import { cancelFFmpeg, ensureDir, exec, runExclusive, safeDelete, withMountedFile } from './ffmpeg';
import { FONT_FILES, hasAssContent, toAss, toSrt } from './subtitles';
import { slug } from './utils';
import { renderCoverBlob } from './cover';

/** Musik latar disimpan di memori saja (tidak ikut tersimpan di proyek). */
export const musicFiles = new Map<string, File>();

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Gagal memuat berkas pendukung: ' + url);
  return new Uint8Array(await res.arrayBuffer());
}

const asset = (p: string) => `${import.meta.env.BASE_URL}${p}`;

export interface RenderArgs {
  file: File;
  clip: Clip;
  srcW: number;
  srcH: number;
  opts: ExportOptions;
  onProgress: (r: number) => void;
  signal?: AbortSignal;
}

export async function renderClip(a: RenderArgs): Promise<Blob> {
  const { file, clip, opts } = a;
  const onAbort = () => cancelFFmpeg();
  a.signal?.addEventListener('abort', onAbort);
  try {
    return await runExclusive((ff) =>
      withMountedFile(ff, file, async (inPath) => {
        const out = 'hasil.mp4';
        const temp: string[] = [out];
        if (opts.mode === 'cepat') {
          await exec(ff, buildCopyArgs(clip, inPath, out), a.onProgress);
        } else {
          const [W, H] = outputSize(clip.aspect, opts.res, a.srcW, a.srcH);

          let assPath: string | null = null;
          if (hasAssContent(clip)) {
            await ff.writeFile('klip.ass', toAss(clip, W, H));
            temp.push('klip.ass');
            await ensureDir(ff, '/fonts');
            const f = FONT_FILES[clip.subs.font];
            await ff.writeFile(`/fonts/${f.file}`, await fetchBytes(asset(`fonts/${f.file}`)));
            assPath = 'klip.ass';
          }

          let wmPath: string | null = null;
          if (clip.watermark.enabled) {
            const wm = clip.watermark;
            const bytes = wm.source === 'custom' && wm.customDataUrl
              ? new Uint8Array(await (await fetch(wm.customDataUrl)).arrayBuffer())
              : await fetchBytes(asset(wm.source === 'kumparan' ? 'wm-kumparan.png' : 'wm-kumparan-putih.png'));
            await ff.writeFile('logo.png', bytes);
            temp.push('logo.png');
            wmPath = 'logo.png';
          }

          let musicPath: string | null = null;
          const mf = musicFiles.get(clip.id);
          if (clip.musicName && mf) {
            const ext = (mf.name.split('.').pop() || 'mp3').replace(/[^a-z0-9]/gi, '');
            musicPath = `musik.${ext}`;
            await ff.writeFile(musicPath, new Uint8Array(await mf.arrayBuffer()));
            temp.push(musicPath);
          }

          await exec(
            ff,
            buildRenderArgs({ clip, input: inPath, output: out, W, H, opts, assPath, fontsDir: '/fonts', wmPath, musicPath }),
            a.onProgress,
          );
        }
        const data = (await ff.readFile(out)) as Uint8Array;
        const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' });
        for (const t of temp) await safeDelete(ff, t);
        return blob;
      }),
    );
  } finally {
    a.signal?.removeEventListener('abort', onAbort);
  }
}

export function metaText(clip: Clip): string {
  return [
    clip.title,
    '',
    clip.description,
    '',
    clip.hashtags.map((h) => '#' + h).join(' '),
    '',
    clip.hook ? `Teks pembuka: ${clip.hook}` : '',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim() + '\n';
}

export interface ExportResult {
  name: string;
  files: { name: string; blob: Blob }[];
}

export async function exportOne(
  a: RenderArgs & { index: number },
): Promise<ExportResult> {
  const { clip, opts } = a;
  const base = `${String(a.index + 1).padStart(2, '0')}-${slug(clip.title)}`;
  const files: ExportResult['files'] = [];
  files.push({ name: `${base}.mp4`, blob: await renderClip(a) });
  if (opts.srt && clip.subs.enabled && clip.subs.lines.length) {
    files.push({ name: `${base}.srt`, blob: new Blob([toSrt(clip)], { type: 'text/plain' }) });
  }
  if (opts.meta) files.push({ name: `${base}.txt`, blob: new Blob([metaText(clip)], { type: 'text/plain' }) });
  if (opts.thumb) {
    try {
      const [W, H] = outputSize(clip.aspect, 1080, a.srcW, a.srcH);
      files.push({ name: `${base}-sampul.jpg`, blob: await renderCoverBlob(a.file, clip, W, H) });
    } catch { /* sampul opsional */ }
  }
  return { name: base, files };
}

export async function zipResults(results: ExportResult[]): Promise<Blob> {
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const r of results) {
    for (const f of r.files) {
      entries[f.name] = [new Uint8Array(await f.blob.arrayBuffer()), { level: 0 }];
    }
  }
  const zipped = zipSync(entries);
  return new Blob([zipped], { type: 'application/zip' });
}
