import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { Clip, Segment } from '../../types';
import { useApp, usePlayhead } from '../../store';
import { fmtTime } from '../../lib/utils';
import { seek } from '../../lib/player';

export default function TranscriptPanel({ clip }: { clip: Clip }) {
  const { project, updateClip, addClip } = useApp();
  const t = usePlayhead((s) => s.t);
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const tr = project?.transcript;

  const segs = useMemo(() => {
    if (!tr) return [] as Segment[];
    const needle = q.trim().toLowerCase();
    return tr.segments.filter((s) => {
      if (needle) return s.text.toLowerCase().includes(needle);
      if (all) return true;
      return s.e > clip.start - 20 && s.s < clip.end + 20;
    });
  }, [tr, q, all, clip.start, clip.end]);

  const active = segs.find((s) => t >= s.s && t < s.e)?.id;
  useEffect(() => {
    if (!active && active !== 0) return;
    const el = listRef.current?.querySelector(`[data-seg="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!tr) {
    return (
      <div className="py-6 text-sm text-mute">
        Proyek ini dianalisis tanpa AI, jadi belum ada transkrip. Buat proyek baru dengan mode AI untuk mendapat teks lengkap.
      </div>
    );
  }

  return (
    <div className="space-y-3 py-4">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
        <input className="field !pl-9" placeholder="Cari kata di transkrip" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari di transkrip" />
      </div>
      {!q && (
        <label className="flex items-center gap-2 text-xs font-bold text-mute">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Tampilkan seluruh video
        </label>
      )}
      <ul ref={listRef} className="scroll-thin max-h-[56vh] space-y-1 overflow-y-auto pr-1">
        {segs.length === 0 && <li className="text-sm text-mute">Tidak ada yang cocok.</li>}
        {segs.map((s) => {
          const inClip = s.e > clip.start && s.s < clip.end;
          return (
            <li
              key={s.id} data-seg={s.id}
              className={`group rounded-2xl px-3 py-2 text-sm ${active === s.id ? 'bg-brand-soft text-brand-ink dark:bg-raised dark:text-ink' : inClip ? 'bg-raised/60' : ''}`}
            >
              <button className="mr-2 text-xs font-bold tabular-nums text-primary hover:underline" onClick={() => seek(s.s)}>{fmtTime(s.s)}</button>
              <span className={inClip ? '' : 'text-mute'}>{s.text}</span>
              <div className="mt-1 hidden gap-1 group-hover:flex group-focus-within:flex">
                <button className="chip !py-0.5 hover:brightness-95" onClick={() => updateClip(clip.id, { start: Math.min(s.s, clip.end - 1) })}>Mulai dari sini</button>
                <button className="chip !py-0.5 hover:brightness-95" onClick={() => updateClip(clip.id, { end: Math.max(s.e, clip.start + 1) })}>Berakhir di sini</button>
                <button className="chip !py-0.5 hover:brightness-95" onClick={() => addClip(s.s, Math.min(project!.duration, s.s + (project!.analysis.targetDur || 45)))}>Klip baru</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
