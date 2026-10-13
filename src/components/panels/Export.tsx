import { useState } from 'react';
import { AlertTriangle, Check, Download, FileArchive, Loader2, X } from 'lucide-react';
import type { Clip } from '../../types';
import { toast, useApp } from '../../store';
import { Field, Progress, Seg, Toggle } from '../ui';
import { DEFAULT_EXPORT, outputSize, type ExportOptions } from '../../lib/ffargs';
import { downloadBlob, fmtBytes } from '../../lib/utils';

export default function ExportPanel({ clip }: { clip: Clip }) {
  const { project, file, video, jobs, exporting, runExport, cancelExport, downloadAll, clearJobs } = useApp();
  const [o, setO] = useState<ExportOptions>(DEFAULT_EXPORT);
  const set = (p: Partial<ExportOptions>) => setO((x) => ({ ...x, ...p }));
  const [W, H] = outputSize(clip.aspect, o.res, video.w, video.h);
  const done = jobs.filter((j) => j.status === 'selesai');
  const dur = clip.end - clip.start;

  const run = (ids: string[]) => {
    if (!file) { toast('Pilih file videonya dulu.', 'error'); return; }
    runExport(ids, o);
  };

  const slowHint = o.mode === 'render' && dur > 90;

  return (
    <div className="space-y-4 py-4">
      <div className="space-y-3">
        <Field label="Cara ekspor">
          <Seg<ExportOptions['mode']> value={o.mode} onChange={(v) => set({ mode: v })} options={[
            { v: 'render', label: 'Render lengkap', title: 'Semua suntingan ikut dipasang' },
            { v: 'cepat', label: 'Potong cepat', title: 'Tanpa render ulang' },
          ]} />
        </Field>
        {o.mode === 'cepat' ? (
          <p className="rounded-2xl bg-raised px-3 py-2 text-xs text-mute">
            Hanya memotong, tanpa mengubah rasio, subtitle, teks, atau warna. Selesai dalam hitungan detik, tapi titik mulainya bisa bergeser ke keyframe terdekat.
          </p>
        ) : (
          <>
            <Field label="Resolusi">
              <Seg<480 | 720 | 1080> value={o.res} onChange={(v) => set({ res: v })} options={[
                { v: 480, label: '480p' }, { v: 720, label: '720p' }, { v: 1080, label: '1080p' },
              ]} />
            </Field>
            <Field label="Kualitas" hint={`Hasil ${W}×${H}. Makin bagus makin lama diproses.`}>
              <Seg<ExportOptions['quality']> value={o.quality} onChange={(v) => set({ quality: v })} options={[
                { v: 'cepat', label: 'Cepat' }, { v: 'seimbang', label: 'Seimbang' }, { v: 'bagus', label: 'Bagus' },
              ]} />
            </Field>
          </>
        )}
        <div className="space-y-2">
          <Toggle checked={o.srt} onChange={(v) => set({ srt: v })} label="Sertakan berkas subtitle (.srt)" />
          <Toggle checked={o.thumb} onChange={(v) => set({ thumb: v })} label="Sertakan sampul bergaya kumparan (.jpg)" />
          <Toggle checked={o.meta} onChange={(v) => set({ meta: v })} label="Sertakan judul dan deskripsi (.txt)" />
        </div>
      </div>

      {slowHint && (
        <p className="flex gap-2 rounded-2xl bg-hot-soft px-3 py-2 text-xs font-semibold text-hot dark:bg-raised">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          Render dilakukan di browser, jadi klip yang panjang bisa makan waktu beberapa menit. Pakai kualitas Cepat dan 720p untuk hasil paling cepat.
        </p>
      )}

      <div className="grid gap-2">
        <button className="btn btn-primary" disabled={exporting || !project} onClick={() => run([clip.id])}>
          <Download size={16} /> Ekspor klip ini
        </button>
        <button className="btn btn-soft" disabled={exporting || !project} onClick={() => run(project!.clips.map((c) => c.id))}>
          Ekspor semua klip ({project?.clips.length ?? 0})
        </button>
        {exporting && <button className="btn btn-ghost" onClick={cancelExport}><X size={15} /> Batalkan</button>}
      </div>

      {jobs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold">Hasil ekspor</h3>
            <button className="text-xs font-bold text-mute hover:text-ink" onClick={clearJobs} disabled={exporting}>Bersihkan</button>
          </div>
          <ul className="space-y-2">
            {jobs.map((j) => (
              <li key={j.id} className="rounded-2xl border border-line p-3">
                <div className="flex items-center gap-2">
                  {j.status === 'jalan' && <Loader2 size={15} className="animate-spin text-primary" />}
                  {j.status === 'selesai' && <Check size={15} className="text-primary" />}
                  {(j.status === 'gagal' || j.status === 'batal') && <AlertTriangle size={15} className="text-hot" />}
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{j.title}</span>
                  <span className="text-xs font-bold text-mute">
                    {j.status === 'antri' ? 'Menunggu' : j.status === 'jalan' ? `${Math.round(j.progress * 100)}%` : j.status === 'batal' ? 'Dibatalkan' : j.status === 'gagal' ? 'Gagal' : 'Selesai'}
                  </span>
                </div>
                {j.status === 'jalan' && <Progress value={j.progress} className="mt-2" />}
                {j.error && <p className="mt-2 whitespace-pre-line break-words text-xs text-hot">{j.error}</p>}
                {j.result && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {j.result.files.map((f) => (
                      <button key={f.name} className="chip hover:brightness-95" onClick={() => downloadBlob(f.blob, f.name)}>
                        <Download size={12} /> {f.name.split('.').pop()?.toUpperCase()} · {fmtBytes(f.blob.size)}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {done.length > 1 && (
            <button className="btn btn-primary w-full" onClick={downloadAll}><FileArchive size={16} /> Unduh semuanya (ZIP)</button>
          )}
        </div>
      )}
    </div>
  );
}
