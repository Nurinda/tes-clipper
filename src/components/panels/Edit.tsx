import { useEffect, useRef, useState } from 'react';
import { Copy, Music, Sparkles, Trash2, Upload } from 'lucide-react';
import type { Aspect, Clip, Fit } from '../../types';
import { toast, useApp, useSettings } from '../../store';
import { Field, Section, Seg, Slider, Toggle } from '../ui';
import { fmtTime } from '../../lib/utils';
import { rewriteMeta } from '../../lib/rewrite';
import { musicFiles } from '../../lib/exporter';

export function TimeInput({ label, value, onChange, max }: { label: string; value: number; onChange: (v: number) => void; max: number }) {
  const [txt, setTxt] = useState(fmtTime(value, true));
  useEffect(() => setTxt(fmtTime(value, true)), [value]);
  const commit = () => {
    const parts = txt.trim().split(':').map(Number);
    if (parts.some((n) => isNaN(n))) { setTxt(fmtTime(value, true)); return; }
    const sec = parts.reduce((acc, n) => acc * 60 + n, 0);
    onChange(Math.min(max, Math.max(0, sec)));
  };
  return (
    <Field label={label}>
      <input
        className="field tabular-nums" value={txt} inputMode="decimal"
        onChange={(e) => setTxt(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
    </Field>
  );
}

export function InfoPanel({ clip }: { clip: Clip }) {
  const { updateClip, project } = useApp();
  const { apiKey, model, defaults } = useSettings();
  const [busy, setBusy] = useState(false);
  const [tags, setTags] = useState(clip.hashtags.map((h) => '#' + h).join(' '));
  useEffect(() => setTags(clip.hashtags.map((h) => '#' + h).join(' ')), [clip.id, clip.hashtags.join(',')]);

  const rewrite = async () => {
    if (!project?.transcript) return;
    setBusy(true);
    try {
      const r = await rewriteMeta(apiKey, model, project.transcript, clip, project.analysis.language || defaults.language);
      updateClip(clip.id, r);
      toast('Judul dan deskripsi sudah diperbarui.', 'ok');
    } catch (e) { toast((e as Error).message, 'error'); }
    setBusy(false);
  };

  const copy = async () => {
    const text = [clip.title, '', clip.description, '', clip.hashtags.map((h) => '#' + h).join(' ')].join('\n').trim();
    try { await navigator.clipboard.writeText(text); toast('Teks sudah disalin.', 'ok'); } catch { toast('Browser menolak menyalin. Salin manual saja.', 'error'); }
  };

  const canAi = !!apiKey && !!project?.transcript;

  return (
    <div>
      <Section title="Waktu klip">
        <div className="grid grid-cols-2 gap-3">
          <TimeInput label="Mulai" value={clip.start} max={clip.end - 1} onChange={(v) => updateClip(clip.id, { start: v })} />
          <TimeInput label="Selesai" value={clip.end} max={project?.duration ?? clip.end} onChange={(v) => updateClip(clip.id, { end: Math.max(v, clip.start + 1) })} />
        </div>
        <p className="text-xs text-mute">Ketik dalam format menit:detik, misalnya 12:34.5. Durasi klip {fmtTime(clip.end - clip.start, true)}.</p>
      </Section>

      <Section
        title="Judul dan deskripsi"
        aside={
          <div className="flex gap-1">
            <button className="icon-btn" onClick={copy} aria-label="Salin judul, deskripsi, dan tagar"><Copy size={16} /></button>
          </div>
        }
      >
        <Field label="Judul"><input className="field" value={clip.title} maxLength={120} onChange={(e) => updateClip(clip.id, { title: e.target.value })} /></Field>
        <Field label="Teks pembuka di layar" hint="Muncul di 3 detik pertama kalau kamu tambahkan lewat tab Teks.">
          <input className="field" value={clip.hook} maxLength={120} onChange={(e) => updateClip(clip.id, { hook: e.target.value })} />
        </Field>
        <Field label="Deskripsi"><textarea className="field min-h-[84px] resize-y" value={clip.description} onChange={(e) => updateClip(clip.id, { description: e.target.value })} /></Field>
        <Field label="Tagar">
          <input
            className="field" value={tags} placeholder="#kumparan #berita"
            onChange={(e) => setTags(e.target.value)}
            onBlur={() => updateClip(clip.id, { hashtags: tags.split(/[\s,]+/).map((t) => t.replace(/^#+/, '')).filter(Boolean) })}
          />
        </Field>
        <button className="btn btn-soft btn-sm w-full" disabled={!canAi || busy} onClick={rewrite}>
          <Sparkles size={15} /> {busy ? 'Menulis ulang…' : 'Tulis ulang dengan AI'}
        </button>
        {!canAi && <p className="text-xs text-mute">Butuh API key OpenAI dan proyek yang dianalisis dengan transkrip.</p>}
      </Section>

      <Section title="Kenapa klip ini dipilih">
        <div className="flex flex-wrap gap-2">
          <span className="chip">Skor {clip.score}</span>
          {clip.scoreAi !== null && <span className="chip">Penilaian AI {clip.scoreAi}</span>}
          <span className="chip">Energi suara {clip.scoreEnergy}</span>
        </div>
        <p className="text-sm text-mute">{clip.reason || 'Klip ini kamu buat sendiri.'}</p>
      </Section>
    </div>
  );
}

const ASPECTS: { v: Aspect; label: string; sub: string }[] = [
  { v: '9:16', label: '9:16', sub: 'Shorts, Reels' },
  { v: '1:1', label: '1:1', sub: 'Kotak' },
  { v: '4:5', label: '4:5', sub: 'Feed' },
  { v: '16:9', label: '16:9', sub: 'Lebar' },
  { v: 'asli', label: 'Asli', sub: 'Tanpa ubah' },
];

const LOOKS: { name: string; b: number; c: number; s: number }[] = [
  { name: 'Normal', b: 0, c: 1, s: 1 },
  { name: 'Cerah', b: 0.06, c: 1.08, s: 1.2 },
  { name: 'Hangat', b: 0.03, c: 1.05, s: 1.15 },
  { name: 'Sinematik', b: -0.04, c: 1.2, s: 0.9 },
  { name: 'Pudar', b: 0.05, c: 0.88, s: 0.75 },
  { name: 'Hitam putih', b: 0, c: 1.1, s: 0 },
];

export function FramePanel({ clip }: { clip: Clip }) {
  const { updateClip } = useApp();
  const set = (p: Partial<Clip>) => updateClip(clip.id, p);
  return (
    <div>
      <Section title="Rasio video">
        <div className="grid grid-cols-5 gap-1.5">
          {ASPECTS.map((a) => (
            <button
              key={a.v} onClick={() => set({ aspect: a.v })} aria-pressed={clip.aspect === a.v}
              className={`rounded-2xl border px-1 py-2 text-center transition-colors ${clip.aspect === a.v ? 'border-brand bg-brand-soft text-brand-ink dark:bg-raised dark:text-ink' : 'border-line hover:bg-raised'}`}
            >
              <span className="block text-sm font-extrabold">{a.label}</span>
              <span className="block text-[10px] leading-tight text-mute">{a.sub}</span>
            </button>
          ))}
        </div>
        {clip.aspect !== 'asli' && (
          <>
            <Field label="Cara mengisi bingkai">
              <Seg<Fit> value={clip.fit} onChange={(v) => set({ fit: v })} options={[
                { v: 'blur', label: 'Latar blur' }, { v: 'crop', label: 'Potong' }, { v: 'fit', label: 'Bar hitam' },
              ]} />
            </Field>
            {clip.fit === 'crop' && (
              <>
                <Slider label="Posisi mendatar" value={clip.posX} min={0} max={1} step={0.01} onChange={(v) => set({ posX: v })} format={(v) => `${Math.round(v * 100)}%`} hint="Atau geser langsung di pratinjau." />
                <Slider label="Posisi tegak" value={clip.posY} min={0} max={1} step={0.01} onChange={(v) => set({ posY: v })} format={(v) => `${Math.round(v * 100)}%`} />
              </>
            )}
          </>
        )}
      </Section>

      <Section title="Kecepatan">
        <Seg<number> value={clip.speed} onChange={(v) => set({ speed: v })} options={[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => ({ v, label: `${v}x` }))} />
        <p className="text-xs text-mute">Subtitle dan teks ikut menyesuaikan.</p>
      </Section>

      <Section title="Warna">
        <div className="flex flex-wrap gap-1.5">
          {LOOKS.map((l) => (
            <button
              key={l.name} className="chip hover:brightness-95"
              onClick={() => set({ brightness: l.b, contrast: l.c, saturation: l.s })}
            >{l.name}</button>
          ))}
        </div>
        <Slider label="Kecerahan" value={clip.brightness} min={-0.3} max={0.3} step={0.01} onChange={(v) => set({ brightness: v })} format={(v) => v.toFixed(2)} />
        <Slider label="Kontras" value={clip.contrast} min={0.6} max={1.5} step={0.01} onChange={(v) => set({ contrast: v })} format={(v) => v.toFixed(2)} />
        <Slider label="Saturasi" value={clip.saturation} min={0} max={2} step={0.01} onChange={(v) => set({ saturation: v })} format={(v) => v.toFixed(2)} />
      </Section>
    </div>
  );
}

export function AudioPanel({ clip }: { clip: Clip }) {
  const { updateClip } = useApp();
  const set = (p: Partial<Clip>) => updateClip(clip.id, p);
  const input = useRef<HTMLInputElement>(null);
  const missing = clip.musicName && !musicFiles.has(clip.id);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 60e6) { toast('File musik terlalu besar. Pakai yang di bawah 60 MB.', 'error'); return; }
    musicFiles.set(clip.id, f);
    set({ musicName: f.name });
  };

  return (
    <div>
      <Section title="Suara video">
        <Slider label="Volume" value={clip.volume} min={0} max={2} step={0.05} onChange={(v) => set({ volume: v })} format={(v) => `${Math.round(v * 100)}%`} hint="Di atas 100% hanya terdengar pada hasil ekspor, bukan di pratinjau." />
        <Toggle checked={clip.normalize} onChange={(v) => set({ normalize: v })} label="Ratakan volume suara" hint="Membantu kalau pembicara kadang pelan, kadang keras." />
      </Section>
      <Section title="Fade">
        <Slider label="Masuk perlahan (suara dan gambar)" value={clip.fadeIn} min={0} max={3} step={0.1} onChange={(v) => set({ fadeIn: v })} format={(v) => `${v.toFixed(1)} dtk`} />
        <Slider label="Keluar perlahan" value={clip.fadeOut} min={0} max={3} step={0.1} onChange={(v) => set({ fadeOut: v })} format={(v) => `${v.toFixed(1)} dtk`} />
      </Section>
      <Section title="Musik latar">
        {clip.musicName ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-2xl bg-raised px-3 py-2 text-sm font-bold">
              <Music size={16} className="shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate">{clip.musicName}</span>
              <button className="icon-btn !h-7 !w-7" aria-label="Hapus musik" onClick={() => { musicFiles.delete(clip.id); set({ musicName: null }); }}><Trash2 size={15} /></button>
            </div>
            {missing && <p className="text-xs font-bold text-hot">File musiknya belum dimuat ulang sejak halaman dibuka. Pilih lagi supaya ikut terekspor.</p>}
            <Slider label="Volume musik" value={clip.musicVolume} min={0} max={1} step={0.01} onChange={(v) => set({ musicVolume: v })} format={(v) => `${Math.round(v * 100)}%`} />
          </div>
        ) : null}
        <input ref={input} type="file" accept="audio/*" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        <button className="btn btn-soft btn-sm w-full" onClick={() => input.current?.click()}><Upload size={15} /> {clip.musicName ? 'Ganti musik' : 'Tambah musik'}</button>
        <p className="text-xs text-mute">Musik diulang otomatis sampai klip selesai. Pastikan kamu punya hak memakainya.</p>
      </Section>
    </div>
  );
}
