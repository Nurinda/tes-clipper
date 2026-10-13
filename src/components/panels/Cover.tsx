import { useEffect, useRef, useState } from 'react';
import { Download, ImageIcon, Locate, Sparkles, Wand2 } from 'lucide-react';
import type { Clip, CoverSettings, CoverTemplate } from '../../types';
import { toast, useApp, usePlayhead, useSettings } from '../../store';
import { ColorInput, Field, Section, Seg, Slider, Toggle } from '../ui';
import { coverOf, coverText, drawCover, ensureFonts, getFrame, getLogo, pickCandidates, renderCoverBlob, type Candidate } from '../../lib/cover';
import { outputSize } from '../../lib/ffargs';
import { rewriteCoverText } from '../../lib/rewrite';
import { downloadBlob, fmtTime, slug } from '../../lib/utils';

export default function CoverPanel({ clip }: { clip: Clip }) {
  const { file, project, video, updateClip } = useApp();
  const { apiKey, model, defaults } = useSettings();
  const cv = coverOf(clip);
  const set = (p: Partial<CoverSettings>) => updateClip(clip.id, { cover: { ...cv, ...p } });
  const canvas = useRef<HTMLCanvasElement>(null);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const [W, H] = outputSize(clip.aspect, 1080, video.w, video.h);
  const pw = H >= W ? 230 : 320;
  const ph = Math.round((pw * H) / W);
  const key = JSON.stringify(cv) + coverText(clip) + clip.aspect;

  useEffect(() => { setCands([]); }, [clip.id]);

  useEffect(() => {
    if (!file || !canvas.current) return;
    let off = false;
    (async () => {
      const t = cv.time ?? clip.start + (clip.end - clip.start) * 0.25;
      const [fr, logo] = await Promise.all([getFrame(file, t, 960), getLogo(), ensureFonts()]);
      if (off || !canvas.current) return;
      const c = canvas.current;
      c.width = pw * 2; c.height = ph * 2;
      drawCover(c.getContext('2d')!, fr, clip, c.width, c.height, logo);
    })().catch(() => undefined);
    return () => { off = true; };
    // eslint-disable-next-line
  }, [file, key, pw, ph]);

  const find = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const c = await pickCandidates(file, clip, 12);
      setCands(c.slice(0, 6));
      if (c[0]) set({ time: c[0].t, focusX: c[0].fx ?? cv.focusX, focusY: c[0].fy ?? cv.focusY });
    } catch (e) { toast((e as Error).message, 'error'); }
    setBusy(false);
  };

  const aiText = async () => {
    if (!project?.transcript) return;
    setAiBusy(true);
    try { set({ text: await rewriteCoverText(apiKey, model, project.transcript, clip, project.analysis.language || defaults.language) }); }
    catch (e) { toast((e as Error).message, 'error'); }
    setAiBusy(false);
  };

  const download = async (type: 'image/jpeg' | 'image/png') => {
    if (!file) { toast('Pilih file videonya dulu.', 'error'); return; }
    try {
      const b = await renderCoverBlob(file, clip, W, H, type);
      downloadBlob(b, `${slug(clip.title)}-sampul.${type === 'image/png' ? 'png' : 'jpg'}`);
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  if (!file) return <p className="py-8 text-center text-sm text-mute">Pilih file videonya dulu untuk membuat sampul.</p>;

  return (
    <div>
      <Section title="Pratinjau sampul">
        <div className="flex justify-center">
          <canvas ref={canvas} style={{ width: pw, height: ph }} className="rounded-2xl bg-raised shadow ring-1 ring-line" aria-label="Pratinjau sampul" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-primary btn-sm" onClick={() => download('image/jpeg')}><Download size={14} /> Unduh JPG</button>
          <button className="btn btn-soft btn-sm" onClick={() => download('image/png')}><Download size={14} /> Unduh PNG</button>
        </div>
        <p className="text-xs text-mute">Ukuran {W}×{H}. Sampul ini ikut masuk ke hasil ekspor kalau opsi sampul dinyalakan.</p>
      </Section>

      <Section title="Pilih frame" aside={cv.time !== null ? <span className="text-xs font-bold tabular-nums text-mute">{fmtTime(cv.time, true)}</span> : undefined}>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-soft btn-sm" disabled={busy} onClick={find}><Wand2 size={14} /> {busy ? 'Mencari…' : 'Cari frame terbaik'}</button>
          <button className="btn btn-soft btn-sm" onClick={() => set({ time: Math.min(clip.end, Math.max(clip.start, usePlayhead.getState().t)) })}><Locate size={14} /> Pakai playhead</button>
        </div>
        {cands.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {cands.map((c) => (
              <li key={c.t}>
                <button
                  onClick={() => set({ time: c.t, focusX: c.fx ?? cv.focusX, focusY: c.fy ?? cv.focusY })}
                  className={`block w-full overflow-hidden rounded-xl ring-2 ${cv.time !== null && Math.abs(cv.time - c.t) < 0.01 ? 'ring-brand' : 'ring-transparent hover:ring-line'}`}
                  aria-label={`Frame pada ${fmtTime(c.t, true)}`}
                >
                  <img src={c.thumb} alt="" className="aspect-video w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Slider label="Geser bingkai mendatar" value={cv.focusX} min={0} max={1} step={0.01} onChange={(v) => set({ focusX: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Geser bingkai tegak" value={cv.focusY} min={0} max={1} step={0.01} onChange={(v) => set({ focusY: v })} format={(v) => `${Math.round(v * 100)}%`} />
      </Section>

      <Section title="Teks dan gaya">
        <Field label="Template">
          <Seg<CoverTemplate> value={cv.template} onChange={(v) => set({ template: v })} options={[
            { v: 'bawah', label: 'Judul bawah' }, { v: 'kotak', label: 'Kotak teal' }, { v: 'minimal', label: 'Tanpa teks' },
          ]} />
        </Field>
        {cv.template !== 'minimal' && (
          <>
            <Field label="Teks sampul" hint="Singkat lebih kuat. Kosongkan lalu klik “Otomatis” untuk memakai teks pembuka atau judul klip.">
              <textarea className="field min-h-[72px] resize-y" value={cv.text ?? coverText(clip)} onChange={(e) => set({ text: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn btn-soft btn-sm" disabled={cv.text === null} onClick={() => set({ text: null })}>Otomatis</button>
              <button className="btn btn-soft btn-sm" disabled={!apiKey || !project?.transcript || aiBusy} onClick={aiText}><Sparkles size={14} /> {aiBusy ? 'Menulis…' : 'Tulis dengan AI'}</button>
            </div>
            <Slider label="Ukuran huruf" value={cv.textSize} min={0.6} max={1.4} step={0.02} onChange={(v) => set({ textSize: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <div className="grid grid-cols-2 gap-3">
              <ColorInput label="Warna teks" value={cv.color} onChange={(v) => set({ color: v })} swatches={['#FFFFFF', '#000000']} />
              <ColorInput label="Warna sorotan" value={cv.accent} onChange={(v) => set({ accent: v })} swatches={['#FFD60A', '#00E5E3', '#ED1847']} />
            </div>
          </>
        )}
        <Toggle checked={cv.logo} onChange={(v) => set({ logo: v })} label="Tampilkan logo kumparan" />
      </Section>
    </div>
  );
}

export { ImageIcon };
