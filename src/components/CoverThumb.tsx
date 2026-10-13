import { useEffect, useState } from 'react';
import type { Clip } from '../types';
import { ASPECT_RATIO } from '../types';
import { useApp } from '../store';
import { coverDataUrl, coverOf, coverText } from '../lib/cover';

/** Gambar sampul kecil untuk daftar klip. */
export default function CoverThumb({ clip, width = 48 }: { clip: Clip; width?: number }) {
  const { file, video, coverBusy } = useApp();
  const [url, setUrl] = useState<string | null>(null);
  const aspect = clip.aspect === 'asli' ? video.w / video.h : ASPECT_RATIO[clip.aspect][0] / ASPECT_RATIO[clip.aspect][1];
  const cv = coverOf(clip);
  const waiting = cv.time === null && !!coverBusy;
  const key = JSON.stringify(cv) + coverText(clip) + clip.aspect;

  useEffect(() => {
    if (!file || waiting) { setUrl(null); return; }
    let off = false;
    const h = setTimeout(() => {
      coverDataUrl(file, clip, width, aspect).then((u) => { if (!off) setUrl(u); }).catch(() => undefined);
    }, 250);
    return () => { off = true; clearTimeout(h); };
    // eslint-disable-next-line
  }, [file, waiting, key, aspect, width]);

  const h = Math.min(72, Math.round(width / aspect));
  const w = Math.round(h * aspect);
  return url
    ? <img src={url} alt="" className="rounded-xl object-cover" style={{ width: w, height: h }} />
    : <span className="block animate-pulse rounded-xl bg-raised" style={{ width: Math.round(Math.min(72, width / aspect) * aspect), height: h }} />;
}
