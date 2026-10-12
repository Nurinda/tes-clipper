import { useRef } from 'react';
import { Plus, RefreshCw, Trash2, Type, Upload } from 'lucide-react';
import type { Clip, Corner, FontKey, SubLine, SubPosition, SubStyleName, TextOverlay } from '../../types';
import { toast, useApp, usePlayhead } from '../../store';
import { ColorInput, Field, Section, Seg, Slider, Toggle } from '../ui';
import { FONT_FILES, regenSubs, updateLineText } from '../../lib/subtitles';
import { fmtTime, uid } from '../../lib/utils';
import { seek } from '../../lib/player';

const STYLES: { v: SubStyleName; label: string }[] = [
  { v: 'karaoke', label: 'Karaoke' }, { v: 'kotak', label: 'Kotak' }, { v: 'garis', label: 'Garis tebal' }, { v: 'minimal', label: 'Minimal' },
];

export function SubtitlePanel({ clip }: { clip: Clip }) {
  const { updateClip, project } = useApp();
  const tr = project?.transcript ?? null;
  const subs = clip.subs;
  const set = (p: Partial<typeof subs>) => updateClip(clip.id, { subs: { ...subs, ...p } });

  const regen = () => updateClip(clip.id, { subs: { ...regenSubs(tr, clip), enabled: true } });
  const outOfRange = subs.lines.length > 0 && (clip.start < subs.genStart - 0.05 || clip.end > subs.genEnd + 0.05);

  const changeMax = (v: number) => {
    if (tr && !subs.edited) updateClip(clip.id, { subs: { ...regenSubs(tr, { ...clip, subs: { ...subs, maxWords: v } }), maxWords: v } });
    else set({ maxWords: v });
  };

  const visible = subs.lines.filter((l) => l.e > clip.start && l.s < clip.end);

  const editLine = (l: SubLine, text: string) =>
    set({ lines: subs.lines.map((x) => (x.id === l.id ? updateLineText(x, text) : x)), edited: true });
  const delLine = (l: SubLine) => set({ lines: subs.lines.filter((x) => x.id !== l.id), edited: true });
  const addLine = () => {
    const t = Math.max(clip.start, Math.min(clip.end - 2, usePlayhead.getState().t));
    const line: SubLine = { id: uid(), s: t, e: Math.min(clip.end, t + 2.5), text: 'Teks baru' };
    line.words = [{ w: 'Teks', s: line.s, e: line.s + 1 }, { w: 'baru', s: line.s + 1, e: line.e }];
    set({ lines: [...subs.lines, line].sort((a, b) => a.s - b.s), edited: true, enabled: true });
  };

  return (
    <div>
      <Section title="Subtitle">
        <Toggle
          checked={subs.enabled} label="Tampilkan subtitle"
          onChange={(v) => {
            if (v && !subs.lines.length && tr) regen(); else set({ enabled: v });
          }}
        />
        {!tr && <p className="text-xs text-mute">Proyek ini dianalisis tanpa AI, jadi belum ada transkrip. Kamu tetap bisa menambah baris subtitle sendiri.</p>}
        {outOfRange && !subs.edited && tr && (
          <button className="btn btn-soft btn-sm w-full" onClick={regen}><RefreshCw size={14} /> Rentang klip berubah, buat ulang teks</button>
        )}
        {outOfRange && subs.edited && (
          <p className="rounded-2xl bg-hot-soft px-3 py-2 text-xs font-bold text-hot">Rentang klip sudah melewati teks yang dibuat sebelumnya. Klik “Buat ulang” di bawah (suntingan manual akan hilang).</p>
        )}
      </Section>

      <Section title="Tampilan">
        <Field label="Gaya"><Seg<SubStyleName> value={subs.style} options={STYLES} onChange={(v) => set({ style: v })} /></Field>
        <Field label="Huruf">
          <Seg<FontKey> value={subs.font} onChange={(v) => set({ font: v })} options={(Object.keys(FONT_FILES) as FontKey[]).map((k) => ({ v: k, label: FONT_FILES[k].label }))} />
        </Field>
        <Field label="Posisi"><Seg<SubPosition> value={subs.position} onChange={(v) => set({ position: v })} options={[{ v: 'atas', label: 'Atas' }, { v: 'tengah', label: 'Tengah' }, { v: 'bawah', label: 'Bawah' }]} /></Field>
        <Slider label="Ukuran huruf" value={subs.size} min={3} max={11} step={0.1} onChange={(v) => set({ size: v })} format={(v) => v.toFixed(1)} />
        <div className="grid grid-cols-2 gap-3">
          <ColorInput label="Warna teks" value={subs.color} onChange={(v) => set({ color: v })} swatches={['#FFFFFF', '#FFD60A', '#00E5E3']} />
          {subs.style === 'karaoke' && <ColorInput label="Warna sorotan" value={subs.hlColor} onChange={(v) => set({ hlColor: v })} swatches={['#FFD60A', '#00E5E3', '#FF3B6B']} />}
        </div>
        <Slider
          label="Kata per baris" value={subs.maxWords} min={1} max={8}
          onChange={changeMax}
          hint={subs.edited ? 'Mengubah ini setelah menyunting manual tidak memecah ulang baris.' : undefined}
        />
      </Section>

      <Section
        title={`Teks subtitle (${visible.length})`}
        aside={
          <div className="flex gap-1">
            <button className="icon-btn" aria-label="Tambah baris" onClick={addLine}><Plus size={16} /></button>
            {tr && <button className="icon-btn" aria-label="Buat ulang dari transkrip" onClick={regen}><RefreshCw size={15} /></button>}
          </div>
        }
      >
        {visible.length === 0 && <p className="text-sm text-mute">Belum ada baris. {tr ? 'Klik tombol segarkan untuk membuatnya dari transkrip.' : 'Klik + untuk menambah.'}</p>}
        <ul className="space-y-2">
          {visible.map((l) => (
            <li key={l.id} className="rounded-2xl border border-line p-2">
              <div className="mb-1 flex items-center justify-between">
                <button className="text-xs font-bold tabular-nums text-primary hover:underline" onClick={() => seek(l.s)}>{fmtTime(l.s, true)}</button>
                <button className="icon-btn !h-6 !w-6" aria-label="Hapus baris" onClick={() => delLine(l)}><Trash2 size={13} /></button>
              </div>
              <textarea
                className="field !rounded-xl !py-1.5" rows={2} value={l.text}
                onChange={(e) => editLine(l, e.target.value)}
                aria-label={`Subtitle pada ${fmtTime(l.s)}`}
              />
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

const CORNERS: { v: Corner; label: string }[] = [
  { v: 'ki', label: 'Kiri atas' }, { v: 'ka', label: 'Kanan atas' }, { v: 'bi', label: 'Kiri bawah' }, { v: 'ba', label: 'Kanan bawah' },
];

export function TextPanel({ clip }: { clip: Clip }) {
  const { updateClip } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (p: Partial<Clip>) => updateClip(clip.id, p);
  const dur = clip.end - clip.start;

  const setOv = (id: string, p: Partial<TextOverlay>) => set({ overlays: clip.overlays.map((o) => (o.id === id ? { ...o, ...p } : o)) });
  const addOv = (text: string, s = 0, e = Math.min(3, dur), y = 0.18) =>
    set({ overlays: [...clip.overlays, { id: uid(), text, s, e, x: 0.5, y, size: 7, color: '#FFFFFF', bg: null }] });

  const upload = (f: File | undefined) => {
    if (!f) return;
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      const c = document.createElement('canvas');
      const k = Math.min(1, 600 / img.width);
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      set({ watermark: { ...clip.watermark, enabled: true, source: 'custom', customDataUrl: c.toDataURL('image/png') } });
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Gambar ini tidak bisa dibuka. Coba PNG atau JPG.', 'error'); };
    img.src = url;
  };

  const wm = clip.watermark;
  const setWm = (p: Partial<typeof wm>) => set({ watermark: { ...wm, ...p } });

  return (
    <div>
      <Section
        title="Teks di layar"
        aside={<button className="btn btn-soft btn-sm" onClick={() => addOv('Tulis teks di sini')}><Plus size={14} /> Tambah</button>}
      >
        {clip.hook && !clip.overlays.some((o) => o.text === clip.hook) && (
          <button className="btn btn-soft btn-sm w-full" onClick={() => addOv(clip.hook, 0, Math.min(3, dur), 0.16)}>
            <Type size={14} /> Pakai teks pembuka dari AI
          </button>
        )}
        {clip.overlays.length === 0 && <p className="text-sm text-mute">Belum ada teks. Cocok untuk judul singkat di awal klip.</p>}
        <ul className="space-y-3">
          {clip.overlays.map((o) => (
            <li key={o.id} className="space-y-3 rounded-2xl border border-line p-3">
              <div className="flex items-start gap-2">
                <textarea className="field !rounded-xl" rows={2} value={o.text} aria-label="Isi teks" onChange={(e) => setOv(o.id, { text: e.target.value })} />
                <button className="icon-btn shrink-0" aria-label="Hapus teks" onClick={() => set({ overlays: clip.overlays.filter((x) => x.id !== o.id) })}><Trash2 size={16} /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Slider label="Muncul" value={o.s} min={0} max={dur} step={0.1} onChange={(v) => setOv(o.id, { s: Math.min(v, o.e - 0.2) })} format={(v) => `${v.toFixed(1)} dtk`} />
                <Slider label="Hilang" value={o.e} min={0} max={dur} step={0.1} onChange={(v) => setOv(o.id, { e: Math.max(v, o.s + 0.2) })} format={(v) => `${v.toFixed(1)} dtk`} />
                <Slider label="Mendatar" value={o.x} min={0.1} max={0.9} step={0.01} onChange={(v) => setOv(o.id, { x: v })} format={(v) => `${Math.round(v * 100)}%`} />
                <Slider label="Tegak" value={o.y} min={0.05} max={0.95} step={0.01} onChange={(v) => setOv(o.id, { y: v })} format={(v) => `${Math.round(v * 100)}%`} />
              </div>
              <Slider label="Ukuran" value={o.size} min={3} max={14} step={0.1} onChange={(v) => setOv(o.id, { size: v })} format={(v) => v.toFixed(1)} />
              <div className="grid grid-cols-2 gap-3">
                <ColorInput label="Warna teks" value={o.color} onChange={(v) => setOv(o.id, { color: v })} swatches={['#FFFFFF', '#000000']} />
                <div>
                  <Toggle checked={!!o.bg} onChange={(v) => setOv(o.id, { bg: v ? '#ED1847' : null })} label="Latar kotak" />
                  {o.bg && <div className="mt-2"><ColorInput label="Warna latar" value={o.bg} onChange={(v) => setOv(o.id, { bg: v })} swatches={['#ED1847', '#00B2B1', '#000000']} /></div>}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-mute">Waktu dihitung dari awal klip.</p>
      </Section>

      <Section title="Logo di video">
        <Toggle checked={wm.enabled} onChange={(v) => setWm({ enabled: v })} label="Tampilkan logo" />
        {wm.enabled && (
          <div className="space-y-3">
            <Field label="Logo">
              <Seg<typeof wm.source> value={wm.source} onChange={(v) => setWm({ source: v })} options={[
                { v: 'kumparan-putih', label: 'kumparan putih' }, { v: 'kumparan', label: 'kumparan' }, { v: 'custom', label: 'Unggahan' },
              ]} />
            </Field>
            {wm.source === 'custom' && (
              <>
                <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
                <button className="btn btn-soft btn-sm w-full" onClick={() => fileRef.current?.click()}><Upload size={14} /> {wm.customDataUrl ? 'Ganti gambar' : 'Pilih gambar logo'}</button>
              </>
            )}
            <Field label="Posisi">
              <div className="grid grid-cols-2 gap-1.5">
                {CORNERS.map((c) => (
                  <button key={c.v} className={`btn btn-sm ${wm.corner === c.v ? 'btn-primary' : 'btn-soft'}`} onClick={() => setWm({ corner: c.v })}>{c.label}</button>
                ))}
              </div>
            </Field>
            <Slider label="Ukuran" value={wm.size} min={6} max={40} onChange={(v) => setWm({ size: v })} format={(v) => `${v}%`} />
            <Slider label="Kepekatan" value={wm.opacity} min={0.2} max={1} step={0.05} onChange={(v) => setWm({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
          </div>
        )}
      </Section>
    </div>
  );
}
