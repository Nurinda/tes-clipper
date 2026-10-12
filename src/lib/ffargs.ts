import type { Aspect, Clip } from '../types';
import { ASPECT_RATIO } from '../types';

export interface ExportOptions {
  res: 480 | 720 | 1080;
  quality: 'cepat' | 'seimbang' | 'bagus';
  mode: 'render' | 'cepat';
  srt: boolean;
  thumb: boolean;
  meta: boolean;
}

export const DEFAULT_EXPORT: ExportOptions = { res: 720, quality: 'cepat', mode: 'render', srt: true, thumb: true, meta: true };

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function outputSize(aspect: Aspect, res: number, srcW: number, srcH: number): [number, number] {
  if (aspect === 'asli') {
    const r = srcW / srcH;
    return r >= 1 ? [even(res * r), even(res)] : [even(res), even(res / r)];
  }
  const [aw, ah] = ASPECT_RATIO[aspect];
  if (aw >= ah) return [even((res * aw) / ah), even(res)];
  return [even(res), even((res * ah) / aw)];
}

const QUALITY = {
  cepat: { preset: 'ultrafast', crf: '28' },
  seimbang: { preset: 'veryfast', crf: '24' },
  bagus: { preset: 'fast', crf: '21' },
} as const;

const n = (v: number, d = 3) => String(Number(v.toFixed(d)));

export interface RenderInput {
  clip: Clip;
  input: string;
  output: string;
  W: number;
  H: number;
  opts: ExportOptions;
  assPath: string | null;
  fontsDir: string;
  wmPath: string | null;
  musicPath: string | null;
}

export function buildRenderArgs(r: RenderInput): string[] {
  const { clip, W, H } = r;
  const speed = clip.speed || 1;
  const dur = clip.end - clip.start;
  const outDur = dur / speed;

  const args: string[] = ['-ss', n(clip.start), '-t', n(dur), '-i', r.input];
  let idx = 1;
  let wmIdx = -1;
  let musicIdx = -1;
  if (r.wmPath) { args.push('-i', r.wmPath); wmIdx = idx++; }
  if (r.musicPath) { args.push('-stream_loop', '-1', '-i', r.musicPath); musicIdx = idx++; }

  // ---------- video ----------
  const pre = speed !== 1 ? `setpts=PTS/${n(speed, 4)},` : '';
  const graph: string[] = [];
  let chain = '';
  if (clip.fit === 'crop' || clip.aspect === 'asli') {
    chain =
      `[0:v]${pre}crop=w='min(iw,ih*${W}/${H})':h='min(ih,iw*${H}/${W})'` +
      `:x='(iw-ow)*${n(clip.posX)}':y='(ih-oh)*${n(clip.posY)}',scale=${W}:${H},setsar=1`;
  } else if (clip.fit === 'fit') {
    chain = `[0:v]${pre}scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;
  } else {
    const bw = even(W / 8);
    const bh = even(H / 8);
    graph.push(`[0:v]${pre}split[a][b]`);
    graph.push(
      `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},scale=${bw}:${bh},boxblur=2:1,scale=${W}:${H},setsar=1[bg]`,
    );
    graph.push(`[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg]`);
    chain = `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1`;
  }

  if (clip.brightness !== 0 || clip.contrast !== 1 || clip.saturation !== 1) {
    chain += `,eq=brightness=${n(clip.brightness)}:contrast=${n(clip.contrast)}:saturation=${n(clip.saturation)}`;
  }
  if (clip.fadeIn > 0) chain += `,fade=t=in:st=0:d=${n(clip.fadeIn)}`;
  if (clip.fadeOut > 0) chain += `,fade=t=out:st=${n(Math.max(0, outDur - clip.fadeOut))}:d=${n(clip.fadeOut)}`;
  if (r.assPath) chain += `,ass=${r.assPath}:fontsdir=${r.fontsDir}`;

  if (wmIdx >= 0) {
    graph.push(`${chain}[v0]`);
    const wmW = even((W * clip.watermark.size) / 100);
    const m = Math.round(W * 0.04);
    const pos: Record<string, string> = {
      ka: `W-w-${m}:${m}`, ki: `${m}:${m}`, ba: `W-w-${m}:H-h-${m}`, bi: `${m}:H-h-${m}`,
    };
    graph.push(`[${wmIdx}:v]scale=${wmW}:-1,format=rgba,colorchannelmixer=aa=${n(clip.watermark.opacity, 2)}[wm]`);
    graph.push(`[v0][wm]overlay=${pos[clip.watermark.corner]}[vout]`);
  } else {
    graph.push(`${chain}[vout]`);
  }

  // ---------- audio ----------
  const a: string[] = [];
  if (clip.volume !== 1) a.push(`volume=${n(clip.volume, 2)}`);
  if (clip.normalize) a.push('dynaudnorm=f=150:g=15');
  if (speed !== 1) {
    let s = speed;
    while (s < 0.5) { a.push('atempo=0.5'); s /= 0.5; }
    while (s > 2) { a.push('atempo=2'); s /= 2; }
    a.push(`atempo=${n(s, 4)}`);
  }
  if (clip.fadeIn > 0) a.push(`afade=t=in:st=0:d=${n(clip.fadeIn)}`);
  if (clip.fadeOut > 0) a.push(`afade=t=out:st=${n(Math.max(0, outDur - clip.fadeOut))}:d=${n(clip.fadeOut)}`);

  const q = QUALITY[r.opts.quality];
  const enc = [
    '-c:v', 'libx264', '-preset', q.preset, '-crf', q.crf, '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-y', r.output,
  ];

  if (musicIdx >= 0) {
    graph.push(`[0:a]${a.length ? a.join(',') : 'anull'}[a0]`);
    const mf = [`volume=${n(clip.musicVolume, 2)}`, `atrim=0:${n(outDur)}`, 'asetpts=PTS-STARTPTS'];
    if (clip.fadeOut > 0) mf.push(`afade=t=out:st=${n(Math.max(0, outDur - Math.max(clip.fadeOut, 1)))}:d=${n(Math.max(clip.fadeOut, 1))}`);
    graph.push(`[${musicIdx}:a]${mf.join(',')}[a1]`);
    graph.push(`[a0][a1]amix=inputs=2:duration=first:dropout_transition=0,volume=2[aout]`);
    return [...args, '-filter_complex', graph.join(';'), '-map', '[vout]', '-map', '[aout]', ...enc];
  }

  const out = [...args, '-filter_complex', graph.join(';'), '-map', '[vout]', '-map', '0:a?'];
  if (a.length) out.push('-af', a.join(','));
  return [...out, ...enc];
}

export function buildCopyArgs(clip: Clip, input: string, output: string): string[] {
  return [
    '-ss', n(clip.start), '-i', input, '-t', n(clip.end - clip.start),
    '-map', '0:v:0', '-map', '0:a?', '-c', 'copy',
    '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', '-y', output,
  ];
}
