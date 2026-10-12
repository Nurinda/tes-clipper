import type { Clip, Transcript } from '../types';
import { chatJson } from './openai';

const SCHEMA = {
  name: 'teks_klip',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'hook', 'description', 'hashtags'],
    properties: {
      title: { type: 'string' },
      hook: { type: 'string' },
      description: { type: 'string' },
      hashtags: { type: 'array', items: { type: 'string' } },
    },
  },
};

export function clipText(tr: Transcript, clip: Clip): string {
  return tr.segments.filter((s) => s.e > clip.start && s.s < clip.end).map((s) => s.text).join(' ');
}

export async function rewriteMeta(key: string, model: string, tr: Transcript, clip: Clip, lang: string) {
  const text = clipText(tr, clip);
  if (!text.trim()) throw new Error('Tidak ada ucapan di rentang klip ini.');
  const bahasa = lang === 'auto' ? 'bahasa yang sama dengan transkrip' : lang === 'id' ? 'bahasa Indonesia' : `bahasa dengan kode "${lang}"`;
  const sys = `Kamu editor media daring. Tulis ulang judul, teks pembuka, deskripsi, dan tagar untuk satu klip video pendek, dalam ${bahasa}.
Tulis seperti manusia: lugas, wajar, tidak lebay, tanpa emoji, tanpa huruf kapital semua. Judul maksimal 70 karakter dan harus sesuai isi klip, hindari kata klise seperti "wajib tonton" atau "viral". Teks pembuka maksimal 12 kata. Deskripsi 1 sampai 2 kalimat. Tagar 3 sampai 5 tanpa tanda #. Jangan mengarang fakta di luar transkrip. Balas hanya JSON.`;
  const res = await chatJson<{ title: string; hook: string; description: string; hashtags: string[] }>(
    key, model, sys, `Transkrip klip:\n${text}`, SCHEMA,
  );
  return {
    title: res.title.trim(),
    hook: res.hook.trim(),
    description: res.description.trim(),
    hashtags: res.hashtags.map((h) => h.replace(/^#+/, '').replace(/\s+/g, '')).filter(Boolean).slice(0, 6),
  };
}
