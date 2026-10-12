import type { Clip, FontKey, SubLine, SubSettings, Transcript, Word, TextOverlay } from '../types';
import { clamp, hexToAss, pad, uid } from './utils';

/** Bagi teks jadi kata-kata dengan waktu yang dibagi rata. */
export function distributeWords(text: string, s: number, e: number): Word[] {
  const parts = text.split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  const step = (e - s) / parts.length;
  return parts.map((w, i) => ({ w, s: s + i * step, e: s + (i + 1) * step }));
}

/** Susun baris subtitle dari kata-kata transkrip di rentang [start, end]. */
export function buildSubLines(tr: Transcript | null, start: number, end: number, maxWords: number): SubLine[] {
  if (!tr) return [];
  let words = tr.words.filter((w) => w.e > start && w.s < end);
  if (!words.length) {
    // tidak ada timestamp per kata: bagi rata dari segmen
    words = tr.segments
      .filter((s) => s.e > start && s.s < end)
      .flatMap((s) => distributeWords(s.text, s.s, s.e));
  }
  const lines: SubLine[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    lines.push({
      id: uid(),
      s: cur[0].s,
      e: cur[cur.length - 1].e,
      text: cur.map((w) => w.w).join(' '),
      words: cur,
    });
    cur = [];
  };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (prev && w.s - prev.e > 0.7) flush();
    cur.push(w);
    const endsSentence = /[.!?…]$/.test(w.w);
    if (cur.length >= maxWords || endsSentence) flush();
  }
  flush();
  // tahan tiap baris tampil sampai baris berikutnya muncul (maks 0,35 dtk), supaya tidak berkedip
  for (let i = 0; i < lines.length - 1; i++) {
    const gap = lines[i + 1].s - lines[i].e;
    if (gap > 0 && gap < 0.35) lines[i].e = lines[i + 1].s;
  }
  return lines;
}

export function regenSubs(tr: Transcript | null, clip: Clip): SubSettings {
  return {
    ...clip.subs,
    lines: buildSubLines(tr, clip.start, clip.end, clip.subs.maxWords),
    genStart: clip.start,
    genEnd: clip.end,
    edited: false,
  };
}

export function updateLineText(line: SubLine, text: string): SubLine {
  return { ...line, text, words: distributeWords(text, line.s, line.e) };
}

function srtTime(t: number): string {
  t = Math.max(0, t);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.round((t - Math.floor(t)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms === 1000 ? 999 : ms, 3)}`;
}

/** Baris subtitle yang jatuh di dalam klip, dengan waktu relatif terhadap awal klip dan sudah memperhitungkan kecepatan. */
export function clipLines(clip: Clip): SubLine[] {
  const speed = clip.speed || 1;
  const total = (clip.end - clip.start) / speed;
  const out: SubLine[] = [];
  for (const l of clip.subs.lines) {
    if (l.e <= clip.start || l.s >= clip.end) continue;
    const s = clamp((l.s - clip.start) / speed, 0, total);
    const e = clamp((l.e - clip.start) / speed, 0, total);
    if (e - s < 0.05) continue;
    out.push({
      ...l,
      s, e,
      words: l.words?.filter((w) => w.e > clip.start && w.s < clip.end).map((w) => ({
        w: w.w,
        s: clamp((w.s - clip.start) / speed, 0, total),
        e: clamp((w.e - clip.start) / speed, 0, total),
      })),
    });
  }
  return out;
}

export function toSrt(clip: Clip): string {
  return clipLines(clip)
    .map((l, i) => `${i + 1}\n${srtTime(l.s)} --> ${srtTime(l.e)}\n${l.text}\n`)
    .join('\n');
}

function assTime(t: number): string {
  t = Math.max(0, t);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const cs = Math.min(99, Math.round((t - Math.floor(t)) * 100));
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs)}`;
}

const esc = (s: string) => s.replace(/\\/g, '/').replace(/[{}]/g, '').replace(/\r?\n/g, '\\N');

export const FONT_FILES: Record<FontKey, { file: string; family: string; bold: boolean; label: string; css: string }> = {
  montserrat: { file: 'Montserrat_800ExtraBold.ttf', family: 'Montserrat ExtraBold', bold: false, label: 'Montserrat', css: "'ClipMontserrat', 'Nunito Variable', sans-serif" },
  poppins: { file: 'Poppins_700Bold.ttf', family: 'Poppins', bold: true, label: 'Poppins', css: "'ClipPoppins', 'Nunito Variable', sans-serif" },
  bebas: { file: 'BebasNeue_400Regular.ttf', family: 'Bebas Neue', bold: false, label: 'Bebas Neue', css: "'ClipBebas', Impact, sans-serif" },
};

export function hasAssContent(clip: Clip): boolean {
  return (clip.subs.enabled && clipLines(clip).length > 0) || clip.overlays.some((o) => o.text.trim());
}

/** Bangun file ASS untuk subtitle dan teks overlay. */
export function toAss(clip: Clip, W: number, H: number): string {
  const font = FONT_FILES[clip.subs.font];
  const sub = clip.subs;
  const fs = Math.round((W * sub.size) / 100);
  const bold = font.bold ? -1 : 0;
  const align = sub.position === 'atas' ? 8 : sub.position === 'tengah' ? 5 : 2;
  const marginV = sub.position === 'tengah' ? 0 : Math.round(H * (sub.position === 'atas' ? 0.1 : 0.13));
  const marginLR = Math.round(W * 0.06);
  const white = hexToAss(sub.color);
  const hl = hexToAss(sub.hlColor);

  const styleLine = (name: string, o: { primary: string; secondary: string; outline: string; back: string; border: number; outlineW: number; shadow: number }) =>
    `Style: ${name},${font.family},${fs},${o.primary},${o.secondary},${o.outline},${o.back},${bold},0,0,0,100,100,0,0,${o.border},${o.outlineW},${o.shadow},${align},${marginLR},${marginLR},${marginV},1`;

  const styles: string[] = [];
  const black = '&H00000000';
  switch (sub.style) {
    case 'karaoke':
      styles.push(styleLine('Sub', { primary: hl, secondary: white, outline: black, back: '&H80000000', border: 1, outlineW: Math.max(2, fs * 0.12), shadow: 0 }));
      break;
    case 'kotak':
      styles.push(styleLine('Sub', { primary: white, secondary: white, outline: '&H20000000', back: '&H20000000', border: 3, outlineW: Math.round(fs * 0.28), shadow: 0 }));
      break;
    case 'garis':
      styles.push(styleLine('Sub', { primary: white, secondary: white, outline: black, back: '&H80000000', border: 1, outlineW: Math.max(3, fs * 0.2), shadow: 0 }));
      break;
    default:
      styles.push(styleLine('Sub', { primary: white, secondary: white, outline: '&H66000000', back: '&H80000000', border: 1, outlineW: Math.max(1, fs * 0.04), shadow: Math.max(1, Math.round(fs * 0.05)) }));
  }
  // gaya dasar untuk teks overlay (warna & ukuran diatur per baris lewat tag)
  styles.push(`Style: Ov,${font.family},${fs},&H00FFFFFF,&H00FFFFFF,${black},&H80000000,${bold},0,0,0,100,100,0,0,1,${Math.max(2, fs * 0.1)},0,5,${marginLR},${marginLR},0,1`);

  styles.push(`Style: OvBox,${font.family},${fs},&H00FFFFFF,&H00FFFFFF,${black},&H80000000,${bold},0,0,0,100,100,0,0,3,${Math.round(fs * 0.3)},0,5,${marginLR},${marginLR},0,1`);

  const events: string[] = [];
  const dur = (clip.end - clip.start) / (clip.speed || 1);

  if (sub.enabled) {
    for (const l of clipLines(clip)) {
      let text: string;
      if (sub.style === 'karaoke' && l.words?.length) {
        const ws = l.words;
        text = ws
          .map((w, i) => {
            const next = ws[i + 1];
            const endT = next ? next.s : l.e;
            const cs = Math.max(1, Math.round((endT - w.s) * 100));
            return `{\\k${cs}}${esc(w.w)}`;
          })
          .join(' ');
        // jeda sebelum kata pertama
        const lead = Math.round((ws[0].s - l.s) * 100);
        if (lead > 0) text = `{\\k${lead}}` + text;
      } else {
        text = esc(l.text);
      }
      events.push(`Dialogue: 0,${assTime(l.s)},${assTime(l.e)},Sub,,0,0,0,,${text}`);
    }
  }

  for (const o of clip.overlays) {
    if (!o.text.trim()) continue;
    const s = clamp(o.s / (clip.speed || 1), 0, dur);
    const e = clamp(o.e / (clip.speed || 1), 0, dur);
    if (e - s < 0.05) continue;
    events.push(`Dialogue: 1,${assTime(s)},${assTime(e)},${o.bg ? 'OvBox' : 'Ov'},,0,0,0,,${overlayTags(o, W, H)}${esc(o.text)}`);
  }

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    ...styles,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    '',
  ].join('\n');
}

function overlayTags(o: TextOverlay, W: number, H: number): string {
  const fs = Math.round((W * o.size) / 100);
  const x = Math.round(o.x * W);
  const y = Math.round(o.y * H);
  const base = `\\an5\\pos(${x},${y})\\fs${fs}\\c${hexToAss(o.color)}\\fad(150,150)`;
  if (o.bg) {
    return `{${base}\\bord${Math.round(fs * 0.3)}\\3c${hexToAss(o.bg)}\\4c${hexToAss(o.bg)}\\shad0}`;
  }
  return `{${base}}`;
}
