import { useEffect, useRef, useState } from 'react';
import { FileVideo, Film, Trash2, UploadCloud, X } from 'lucide-react';
import { useApp, useSettings } from '../store';
import type { AnalysisOptions, ContentStyle, Project } from '../types';
import { deleteProject, listProjects } from '../lib/storage';
import { fmtBytes, fmtDur } from '../lib/utils';
import { Field, Seg, Slider } from '../components/ui';

export const LANGS: [string, string][] = [
  ['id', 'Indonesia'], ['en', 'Inggris'], ['jw', 'Jawa'], ['su', 'Sunda'], ['ms', 'Melayu'], ['ar', 'Arab'], ['zh', 'Mandarin'],
  ['ja', 'Jepang'], ['ko', 'Korea'], ['es', 'Spanyol'], ['fr', 'Prancis'], ['de', 'Jerman'], ['nl', 'Belanda'], ['hi', 'Hindi'],
  ['th', 'Thai'], ['vi', 'Vietnam'], ['auto', 'Deteksi otomatis'],
];

export const STYLES: [ContentStyle, string][] = [
  ['podcast', 'Podcast / obrolan'], ['wawancara', 'Wawancara'], ['berita', 'Berita / liputan'], ['tutorial', 'Tutorial'],
  ['webinar', 'Webinar / presentasi'], ['vlog', 'Vlog'], ['gaming', 'Gaming'],
];

function SetupPanel() {
  const { pending, clearPending, startAnalysis } = useApp();
  const { apiKey, defaults: d } = useSettings();
  const go = useApp((s) => s.go);
  const [opts, setOpts] = useState<AnalysisOptions>({
    targetDur: d.targetDur, maxClips: d.maxClips, contentStyle: d.contentStyle, language: d.language, useAi: !!apiKey,
  });
  if (!pending) return null;
  const set = (p: Partial<AnalysisOptions>) => setOpts((o) => ({ ...o, ...p }));
  const minutes = pending.duration / 60;
  const cost = minutes * 0.006;

  return (
    <div className="card mx-auto max-w-3xl overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line bg-raised/60 px-5 py-3">
        <FileVideo size={20} className="shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{pending.file.name}</p>
          <p className="text-xs text-mute">{fmtDur(pending.duration)} · {pending.w}×{pending.h} · {fmtBytes(pending.file.size)}</p>
        </div>
        <button className="icon-btn" onClick={clearPending} aria-label="Ganti video"><X size={18} /></button>
      </div>

      <div className="space-y-5 p-5">
        <Field label="Cara memilih momen">
          <Seg<'ai' | 'tanpa'> value={opts.useAi ? 'ai' : 'tanpa'} onChange={(v) => set({ useAi: v === 'ai' })} options={[
            { v: 'ai', label: 'Pakai AI (transkrip + penilaian)' }, { v: 'tanpa', label: 'Tanpa AI (dari suara saja)' },
          ]} />
        </Field>
        {opts.useAi && !apiKey && (
          <p className="flex flex-wrap items-center gap-2 rounded-2xl bg-hot-soft px-3 py-2 text-sm font-semibold text-hot dark:bg-raised">
            API key OpenAI belum diisi.
            <button className="btn btn-hot btn-sm" onClick={() => go('pengaturan')}>Isi di Pengaturan</button>
          </p>
        )}
        {!opts.useAi && (
          <p className="rounded-2xl bg-raised px-3 py-2 text-sm text-mute">
            Klip dipilih dari bagian yang suaranya paling hidup. Tidak ada transkrip, jadi subtitle otomatis dan judul dari AI tidak tersedia.
          </p>
        )}

        <div>
          <span className="lbl">Durasi tiap klip</span>
          <div className="flex flex-wrap items-center gap-2">
            <Seg<number> value={opts.targetDur} onChange={(v) => set({ targetDur: v })} options={[15, 30, 45, 60, 90].map((v) => ({ v, label: `${v} dtk` }))} />
            <input
              type="number" min={8} max={300} className="field !w-24" value={opts.targetDur} aria-label="Durasi kustom dalam detik"
              onChange={(e) => set({ targetDur: Math.max(8, Math.min(300, Number(e.target.value) || 45)) })}
            />
          </div>
        </div>

        <Slider label="Jumlah klip maksimal" value={opts.maxClips} min={1} max={20} onChange={(v) => set({ maxClips: v })} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Jenis tayangan">
            <select className="field" value={opts.contentStyle} onChange={(e) => set({ contentStyle: e.target.value as ContentStyle })}>
              {STYLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Bahasa yang diucapkan">
            <select className="field" value={opts.language} onChange={(e) => set({ language: e.target.value })}>
              {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        </div>

        {opts.useAi && (
          <p className="text-xs text-mute">
            Perkiraan biaya transkripsi sekitar US${cost.toFixed(2)} untuk {fmtDur(pending.duration)} audio, belum termasuk biaya model untuk memilih momen. Dibebankan ke akun OpenAI-mu.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={clearPending}>Ganti video</button>
          <button className="btn btn-primary" disabled={opts.useAi && !apiKey} onClick={() => startAnalysis(opts)}>Mulai analisis</button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { pickFile, pending, openProject } = useApp();
  const [over, setOver] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const refresh = () => listProjects().then(setProjects);
  useEffect(() => { refresh(); }, []);

  const onFile = (f?: File | null) => {
    if (!f) return;
    if (!f.type.startsWith('video/') && !/\.(mkv|mov|mp4|webm|avi|m4v)$/i.test(f.name)) return;
    pickFile(f);
  };

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:py-14">
      {!pending ? (
        <>
          <div className="mx-auto max-w-3xl">
            <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-primary sm:text-5xl">
              Dari video panjang jadi klip yang siap tayang.
            </h1>
            <p className="mt-4 max-w-xl text-lg text-mute">
              Taruh videonya, biarkan bagian yang paling menarik dipilih otomatis, lalu rapikan sendiri sebelum diunduh.
            </p>
          </div>

          <div
            className={`mx-auto mt-8 max-w-3xl rounded-[2.5rem] border-2 border-dashed px-6 py-14 text-center transition-colors ${over ? 'border-brand bg-brand-soft dark:bg-raised' : 'border-brand/50 bg-surface'}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files?.[0]); }}
          >
            <div className="relative mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-brand text-white">
              <UploadCloud size={30} />
              <span className="absolute -right-0.5 -top-0.5 h-4 w-4 rounded-full bg-hot ring-4 ring-surface" />
            </div>
            <p className="text-xl font-extrabold">Tarik video ke sini</p>
            <p className="mt-1 text-sm text-mute">MP4, MOV, WebM, atau MKV. Tidak ada batas ukuran dari kami.</p>
            <input ref={input} type="file" accept="video/*,.mkv" className="sr-only" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
            <button className="btn btn-primary mt-5 !px-6 !py-2.5" onClick={() => input.current?.click()}>Pilih dari komputer</button>
            <p className="mt-5 text-xs text-mute">Videomu diproses di perangkat ini dan tidak diunggah ke server mana pun. Hanya audio yang dikirim ke OpenAI untuk dijadikan teks.</p>
          </div>

          <ol className="mx-auto mt-10 grid max-w-3xl gap-4 text-sm sm:grid-cols-3">
            {[
              ['Pilih video', 'Rekaman podcast, wawancara, siaran langsung, atau liputan.'],
              ['Biarkan dipilihkan', 'Ucapan disalin jadi teks, lalu momen yang paling kuat ditandai lengkap dengan judul.'],
              ['Rapikan lalu unduh', 'Atur bingkai, subtitle, teks, dan logo. Ekspor satu per satu atau semuanya sekaligus.'],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-raised text-xs font-extrabold text-primary">{i + 1}</span>
                <span><b className="block">{t}</b><span className="text-mute">{d}</span></span>
              </li>
            ))}
          </ol>

          {projects.length > 0 && (
            <section className="mx-auto mt-14 max-w-3xl">
              <h2 className="mb-3 text-lg font-extrabold">Proyek sebelumnya</h2>
              <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
                {projects.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <Film size={18} className="shrink-0 text-primary" />
                    <button className="min-w-0 flex-1 text-left" onClick={() => openProject(p)}>
                      <span className="block truncate font-bold">{p.name}</span>
                      <span className="block text-xs text-mute">{new Date(p.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} · {fmtDur(p.duration)} · {p.clips.length} klip</span>
                    </button>
                    <button className="btn btn-soft btn-sm" onClick={() => openProject(p)}>Buka</button>
                    <button
                      className="icon-btn hover:!text-hot" aria-label={`Hapus ${p.name}`}
                      onClick={async () => { if (confirm(`Hapus proyek “${p.name}”?`)) { await deleteProject(p.id); refresh(); } }}
                    ><Trash2 size={16} /></button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <SetupPanel />
      )}
    </div>
  );
}
