import { useState } from 'react';
import { Eye, EyeOff, Wand2 } from 'lucide-react';
import { toast, useApp, useSettings } from '../store';
import { Field, Section, Seg, Slider, Toggle } from '../components/ui';
import { listModels, pickBestModel } from '../lib/openai';
import { clearAll } from '../lib/storage';
import { LANGS, STYLES } from './Home';
import type { Aspect, ContentStyle, Fit } from '../types';

export default function Settings() {
  const s = useSettings();
  const { go, closeProject } = useApp();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const test = async () => {
    if (!s.apiKey.trim()) { toast('Isi API key dulu.', 'error'); return; }
    setBusy(true);
    try {
      const ids = await listModels(s.apiKey.trim());
      const best = pickBestModel(ids);
      s.set({ models: ids, ...(best ? { model: best } : {}) });
      toast(best ? `Terhubung. Model terbaik di akunmu: ${best}.` : 'Terhubung, tapi tidak ada model GPT yang cocok. Isi nama model secara manual.', 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
    setBusy(false);
  };

  const chatModels = s.models.filter((m) => /^(gpt|o\d|chatgpt)/.test(m));

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <h1 className="text-3xl font-extrabold text-primary">Pengaturan</h1>

      <div className="card mt-6 px-5">
        <Section title="OpenAI">
          <Field label="API key" hint="Disimpan hanya di browser ini dan dikirim langsung ke OpenAI. Jangan isi di komputer yang dipakai bersama.">
            <div className="flex gap-2">
              <input
                className="field" type={show ? 'text' : 'password'} autoComplete="off" spellCheck={false}
                placeholder="sk-…" value={s.apiKey} onChange={(e) => s.set({ apiKey: e.target.value })}
              />
              <button className="icon-btn shrink-0" onClick={() => setShow(!show)} aria-label={show ? 'Sembunyikan key' : 'Tampilkan key'}>
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>
          <button className="btn btn-primary btn-sm" onClick={test} disabled={busy}>
            <Wand2 size={15} /> {busy ? 'Memeriksa…' : 'Tes koneksi dan pilih model terbaik'}
          </button>
          <Field label="Model untuk memilih momen dan menulis judul" hint="Tombol di atas memilihkan model GPT terbaru yang bisa dipakai akunmu. Kamu juga bisa mengetik nama model sendiri.">
            <input className="field" list="model-list" value={s.model} onChange={(e) => s.set({ model: e.target.value })} />
            <datalist id="model-list">{chatModels.map((m) => <option key={m} value={m} />)}</datalist>
          </Field>
          <Field label="Model transkripsi" hint="whisper-1 dipakai karena bisa memberi waktu per kata, yang dibutuhkan subtitle karaoke.">
            <input className="field" value={s.transcribeModel} onChange={(e) => s.set({ transcribeModel: e.target.value })} />
          </Field>
        </Section>

        <Section title="Bawaan untuk proyek baru">
          <Field label="Rasio video">
            <Seg<Aspect> value={s.defaults.aspect} onChange={(v) => s.setDefaults({ aspect: v })} options={(['9:16', '1:1', '4:5', '16:9', 'asli'] as Aspect[]).map((v) => ({ v, label: v === 'asli' ? 'Asli' : v }))} />
          </Field>
          <Field label="Cara mengisi bingkai">
            <Seg<Fit> value={s.defaults.fit} onChange={(v) => s.setDefaults({ fit: v })} options={[{ v: 'blur', label: 'Latar blur' }, { v: 'crop', label: 'Potong' }, { v: 'fit', label: 'Bar hitam' }]} />
          </Field>
          <Slider label="Durasi klip" value={s.defaults.targetDur} min={10} max={180} step={5} onChange={(v) => s.setDefaults({ targetDur: v })} format={(v) => `${v} dtk`} />
          <Slider label="Jumlah klip maksimal" value={s.defaults.maxClips} min={1} max={20} onChange={(v) => s.setDefaults({ maxClips: v })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Jenis tayangan">
              <select className="field" value={s.defaults.contentStyle} onChange={(e) => s.setDefaults({ contentStyle: e.target.value as ContentStyle })}>
                {STYLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Bahasa">
              <select className="field" value={s.defaults.language} onChange={(e) => s.setDefaults({ language: e.target.value })}>
                {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Penyimpanan">
          <Toggle checked={s.saveCopy} onChange={(v) => s.set({ saveCopy: v })} label="Simpan salinan video di browser" hint="Proyek bisa dibuka lagi tanpa memilih file ulang. Memakai ruang penyimpanan browser, jadi matikan kalau videomu sangat besar." />
          <button
            className="btn btn-soft btn-sm"
            onClick={async () => {
              if (!confirm('Hapus semua proyek dan salinan video yang tersimpan di browser ini?')) return;
              await clearAll(); closeProject(); toast('Semua proyek sudah dihapus.', 'ok');
            }}
          >Hapus semua proyek</button>
        </Section>
      </div>

      <div className="mt-6 flex justify-end">
        <button className="btn btn-primary" onClick={() => go('beranda')}>Selesai</button>
      </div>
    </div>
  );
}
