import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, AudioLines, Copy, FileVideo, Film, Frame, Info, Pause, Play, Plus, Redo2, Scissors, SkipBack, SkipForward,
  Subtitles, Trash2, Type, Undo2, Wand2, Download, ScrollText,
} from 'lucide-react';
import { useApp, usePlayhead, useSettings } from '../store';
import type { Clip } from '../types';
import Preview from '../components/Preview';
import Timeline, { type Zoom } from '../components/Timeline';
import { InfoPanel, FramePanel, AudioPanel } from '../components/panels/Edit';
import { SubtitlePanel, TextPanel } from '../components/panels/Text';
import TranscriptPanel from '../components/panels/Transcript';
import ExportPanel from '../components/panels/Export';
import { Seg } from '../components/ui';
import { fmtDur, fmtTime } from '../lib/utils';
import { seek, togglePlay } from '../lib/player';
import { meanEnergy } from '../lib/audio';

type Tab = 'info' | 'bingkai' | 'subtitle' | 'teks' | 'audio' | 'transkrip' | 'ekspor';
const TABS: { id: Tab; label: string; icon: typeof Info }[] = [
  { id: 'info', label: 'Info', icon: Info },
  { id: 'bingkai', label: 'Bingkai', icon: Frame },
  { id: 'subtitle', label: 'Subtitle', icon: Subtitles },
  { id: 'teks', label: 'Teks', icon: Type },
  { id: 'audio', label: 'Audio', icon: AudioLines },
  { id: 'transkrip', label: 'Transkrip', icon: ScrollText },
  { id: 'ekspor', label: 'Ekspor', icon: Download },
];

function scoreTone(s: number) {
  if (s >= 80) return 'bg-hot text-white';
  if (s >= 60) return 'bg-primary text-primary-ink';
  return 'bg-raised text-mute';
}

function trimSilence(clip: Clip, energy: NonNullable<ReturnType<typeof useApp.getState>['project']>['energy']): Partial<Clip> | null {
  if (!energy) return null;
  const st = energy.step;
  let i0 = Math.floor(clip.start / st);
  let i1 = Math.floor(clip.end / st);
  while (i0 < i1 && (energy.rms[i0] ?? 0) < 0.14) i0++;
  while (i1 > i0 && (energy.rms[i1] ?? 0) < 0.14) i1--;
  const start = Math.max(clip.start, i0 * st - 0.15);
  const end = Math.min(clip.end, (i1 + 1) * st + 0.2);
  if (end - start < 1) return null;
  return { start, end };
}

export default function ProjectPage() {
  const {
    project, selectedId, select, needFile, attachFile, removeClip, duplicateClip, splitClip, addClip, updateClip,
    undo, redo, past, future, renameProject, closeProject,
  } = useApp();
  const defaults = useSettings((s) => s.defaults);
  const playing = usePlayhead((s) => s.playing);
  const t = usePlayhead((s) => s.t);
  const [tab, setTab] = useState<Tab>('info');
  const [zoom, setZoom] = useState<Zoom>(30);
  const pickRef = useRef<HTMLInputElement>(null);
  const clip = project?.clips.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable="true"]') && !(el.getAttribute('type') === 'range')) return;
      if (el.getAttribute('role') === 'slider') return;
      const st = useApp.getState();
      const c = st.project?.clips.find((x) => x.id === st.selectedId);
      const pt = usePlayhead.getState().t;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? st.redo() : st.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); st.redo(); return; }
      if (!c || mod) return;
      switch (e.key.toLowerCase()) {
        case ' ': e.preventDefault(); togglePlay(); break;
        case 'i': st.updateClip(c.id, { start: Math.min(pt, c.end - 1) }); break;
        case 'o': st.updateClip(c.id, { end: Math.max(pt, c.start + 1) }); break;
        case 's': st.splitClip(c.id, pt); break;
        case 'arrowleft': e.preventDefault(); seek(pt - (e.shiftKey ? 5 : 1)); break;
        case 'arrowright': e.preventDefault(); seek(pt + (e.shiftKey ? 5 : 1)); break;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!project) return null;

  const addAtPlayhead = () => addClip(t, t + (project.analysis.targetDur || defaults.targetDur));

  return (
    <div className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className="icon-btn" onClick={closeProject} aria-label="Kembali"><ArrowLeft size={18} /></button>
        <input
          className="min-w-0 flex-1 rounded-xl bg-transparent px-2 py-1 text-lg font-extrabold hover:bg-raised focus:bg-raised focus:outline-none sm:max-w-md"
          value={project.name} onChange={(e) => renameProject(e.target.value)} aria-label="Nama proyek"
        />
        <span className="hidden text-sm text-mute sm:inline">{fmtDur(project.duration)} · {project.clips.length} klip</span>
        <div className="ml-auto flex items-center gap-1">
          <button className="icon-btn" onClick={undo} disabled={!past.length} aria-label="Urungkan (Ctrl+Z)" title="Urungkan (Ctrl+Z)"><Undo2 size={17} /></button>
          <button className="icon-btn" onClick={redo} disabled={!future.length} aria-label="Ulangi (Ctrl+Y)" title="Ulangi (Ctrl+Y)"><Redo2 size={17} /></button>
        </div>
      </div>

      {needFile && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-3xl border border-brand bg-brand-soft px-4 py-3 text-sm text-brand-ink dark:bg-raised dark:text-ink">
          <FileVideo size={20} className="shrink-0" />
          <p className="min-w-0 flex-1 font-semibold">Videonya belum dimuat. Pilih file yang sama dengan proyek ini supaya bisa diputar dan diekspor.</p>
          <input ref={pickRef} type="file" accept="video/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) attachFile(f); e.target.value = ''; }} />
          <button className="btn btn-primary btn-sm" onClick={() => pickRef.current?.click()}>Pilih video</button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[270px_minmax(0,1fr)_380px]">
        {/* ---------- daftar klip ---------- */}
        <aside className="order-2 lg:order-1">
          <div className="card p-3 lg:sticky lg:top-[72px]">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-sm font-extrabold">Klip ({project.clips.length})</h2>
              <button className="btn btn-soft btn-sm" onClick={addAtPlayhead}><Plus size={14} /> Dari playhead</button>
            </div>
            <ul className="scroll-thin max-h-[62vh] space-y-1.5 overflow-y-auto pr-1">
              {project.clips.length === 0 && <li className="px-2 py-6 text-center text-sm text-mute">Belum ada klip. Geser playhead ke bagian yang kamu mau, lalu klik “Dari playhead”.</li>}
              {project.clips.map((c, i) => (
                <li key={c.id}>
                  <div
                    className={`group flex w-full items-start gap-2.5 rounded-2xl border p-2.5 text-left transition-colors ${
                      c.id === selectedId ? 'border-brand bg-brand-soft dark:bg-raised' : 'border-transparent hover:bg-raised'
                    }`}
                  >
                    <button className="flex min-w-0 flex-1 items-start gap-2.5 text-left" onClick={() => select(c.id)} aria-current={c.id === selectedId}>
                      <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-extrabold ${scoreTone(c.score)}`} title="Skor potensi">{c.score}</span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 text-sm font-bold leading-snug">{c.title || `Klip ${i + 1}`}</span>
                        <span className="mt-0.5 block text-xs tabular-nums text-mute">{fmtTime(c.start)} – {fmtTime(c.end)} · {fmtDur(c.end - c.start)}</span>
                      </span>
                    </button>
                    <span className="flex shrink-0 flex-col">
                      <button className="icon-btn !h-7 !w-7" onClick={() => duplicateClip(c.id)} aria-label={`Gandakan ${c.title}`}><Copy size={14} /></button>
                      <button className="icon-btn !h-7 !w-7 hover:!text-hot" onClick={() => removeClip(c.id)} aria-label={`Hapus ${c.title}`}><Trash2 size={14} /></button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {project.clips.length > 0 && (
              <button className="btn btn-primary mt-3 w-full" onClick={() => { setTab('ekspor'); if (!selectedId) select(project.clips[0].id); }}>
                <Download size={16} /> Ekspor klip
              </button>
            )}
          </div>
        </aside>

        {/* ---------- pratinjau & timeline ---------- */}
        <main className="order-1 min-w-0 space-y-3 lg:order-2">
          {clip ? (
            <>
              <div className="card p-3 sm:p-4">
                <Preview clip={clip} />
              </div>

              <div className="card flex flex-wrap items-center gap-1.5 p-2">
                <button className="btn btn-primary !h-10 !w-10 !p-0" onClick={togglePlay} aria-label={playing ? 'Jeda (spasi)' : 'Putar (spasi)'}>
                  {playing ? <Pause size={18} /> : <Play size={18} className="translate-x-px" />}
                </button>
                <button className="icon-btn" onClick={() => seek(t - 1)} aria-label="Mundur 1 detik"><SkipBack size={17} /></button>
                <button className="icon-btn" onClick={() => seek(t + 1)} aria-label="Maju 1 detik"><SkipForward size={17} /></button>
                <span className="mx-1 text-sm font-bold tabular-nums">
                  {fmtTime(Math.max(0, t - clip.start), true)} <span className="text-mute">/ {fmtTime(clip.end - clip.start, true)}</span>
                </span>
                <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
                <button className="btn btn-soft btn-sm" onClick={() => updateClip(clip.id, { start: Math.min(t, clip.end - 1) })} title="Mulai dari playhead (I)">Mulai di sini</button>
                <button className="btn btn-soft btn-sm" onClick={() => updateClip(clip.id, { end: Math.max(t, clip.start + 1) })} title="Selesai di playhead (O)">Selesai di sini</button>
                <button className="btn btn-soft btn-sm" onClick={() => splitClip(clip.id, t)} title="Bagi di playhead (S)"><Scissors size={14} /> Bagi</button>
                <button
                  className="btn btn-soft btn-sm" disabled={!project.energy}
                  onClick={() => { const p = trimSilence(clip, project.energy); if (p) updateClip(clip.id, p); }}
                  title="Buang jeda di awal dan akhir klip"
                ><Wand2 size={14} /> Rapikan jeda</button>
                <div className="ml-auto">
                  <Seg<Zoom> label="Zoom timeline" value={zoom} onChange={setZoom} options={[{ v: 10, label: 'Dekat' }, { v: 30, label: 'Sedang' }, { v: 90, label: 'Jauh' }, { v: 0, label: 'Semua' }]} />
                </div>
              </div>

              <Timeline clip={clip} project={project} zoom={zoom} />
              <p className="px-1 text-xs text-mute">
                Pintasan: <kbd className="font-bold">Spasi</kbd> putar, <kbd className="font-bold">I</kbd> / <kbd className="font-bold">O</kbd> mulai / selesai, <kbd className="font-bold">S</kbd> bagi, <kbd className="font-bold">←</kbd> <kbd className="font-bold">→</kbd> geser 1 detik, <kbd className="font-bold">Ctrl+Z</kbd> urungkan.
              </p>
            </>
          ) : (
            <div className="card grid min-h-[360px] place-items-center p-8 text-center">
              <div>
                <Film size={36} className="mx-auto mb-3 text-mute" />
                <p className="font-bold">Pilih klip di daftar untuk mulai mengedit.</p>
              </div>
            </div>
          )}
        </main>

        {/* ---------- panel kanan ---------- */}
        <aside className="order-3">
          <div className="card lg:sticky lg:top-[72px]">
            <div role="tablist" aria-label="Pengaturan klip" className="scroll-thin flex gap-1 overflow-x-auto border-b border-line p-2">
              {TABS.map((x) => (
                <button
                  key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}
                  className={`btn btn-sm shrink-0 ${tab === x.id ? 'btn-primary' : 'btn-ghost'}`}
                >
                  <x.icon size={14} /> {x.label}
                </button>
              ))}
            </div>
            <div className="scroll-thin max-h-[calc(100vh-190px)] overflow-y-auto px-4 lg:min-h-[400px]">
              {clip ? (
                <>
                  {tab === 'info' && <InfoPanel clip={clip} />}
                  {tab === 'bingkai' && <FramePanel clip={clip} />}
                  {tab === 'subtitle' && <SubtitlePanel clip={clip} />}
                  {tab === 'teks' && <TextPanel clip={clip} />}
                  {tab === 'audio' && <AudioPanel clip={clip} />}
                  {tab === 'transkrip' && <TranscriptPanel clip={clip} />}
                  {tab === 'ekspor' && <ExportPanel clip={clip} />}
                </>
              ) : (
                <p className="py-8 text-center text-sm text-mute">Belum ada klip yang dipilih.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
