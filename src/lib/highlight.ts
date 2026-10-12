import type { AnalysisOptions, Clip, ContentStyle, EnergyData, Segment, Transcript } from '../types';
import { chatJson } from './openai';
import { meanEnergy, nearestSilence } from './audio';
import { makeClip, type ClipDefaults } from './clipDefaults';
import { buildSubLines } from './subtitles';
import { clamp, fmtTime } from './utils';

interface Candidate {
  start_id: number;
  end_id: number;
  score: number;
  title: string;
  hook: string;
  description: string;
  hashtags: string[];
  reason: string;
}

const STYLE_HINT: Record<ContentStyle, string> = {
  podcast: 'podcast atau obrolan panjang. Cari opini tajam, cerita pribadi, pengakuan, debat, dan kalimat yang gampang dikutip.',
  tutorial: 'tutorial atau penjelasan. Cari tips yang bisa langsung dipraktikkan, kesalahan umum, dan momen "oh, ternyata begitu".',
  gaming: 'siaran gim. Cari momen aksi, kemenangan tipis, reaksi spontan, dan kejadian lucu.',
  vlog: 'vlog. Cari momen lucu, mengharukan, kejutan, dan cerita yang punya awal dan akhir.',
  webinar: 'webinar atau presentasi. Cari kesimpulan penting, data mengejutkan, dan jawaban yang paling berguna bagi penonton.',
  wawancara: 'wawancara. Cari jawaban yang jujur atau mengejutkan, pernyataan penting, dan pertanyaan yang memancing jawaban kuat.',
  berita: 'liputan atau program berita. Cari pernyataan kunci, fakta baru, kutipan narasumber, dan penjelasan yang mudah dipahami.',
};

const LANG_NAME: Record<string, string> = {
  id: 'bahasa Indonesia', en: 'bahasa Inggris', jw: 'bahasa Jawa', su: 'bahasa Sunda', ms: 'bahasa Melayu',
  ar: 'bahasa Arab', zh: 'bahasa Mandarin', ja: 'bahasa Jepang', ko: 'bahasa Korea', es: 'bahasa Spanyol',
  fr: 'bahasa Prancis', de: 'bahasa Jerman', nl: 'bahasa Belanda', hi: 'bahasa Hindi', th: 'bahasa Thai', vi: 'bahasa Vietnam',
};

const SCHEMA = {
  name: 'kandidat_klip',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['candidates'],
    properties: {
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['start_id', 'end_id', 'score', 'title', 'hook', 'description', 'hashtags', 'reason'],
          properties: {
            start_id: { type: 'integer' },
            end_id: { type: 'integer' },
            score: { type: 'integer' },
            title: { type: 'string' },
            hook: { type: 'string' },
            description: { type: 'string' },
            hashtags: { type: 'array', items: { type: 'string' } },
            reason: { type: 'string' },
          },
        },
      },
    },
  },
};

export function systemPrompt(opts: AnalysisOptions, lang: string): string {
  const out = lang && lang !== 'auto' ? LANG_NAME[lang] || lang : 'bahasa yang sama dengan transkrip';
  return `Kamu editor video media daring yang biasa memilih potongan terbaik dari tayangan panjang untuk dijadikan video pendek (Shorts, Reels, TikTok).

Jenis tayangan: ${STYLE_HINT[opts.contentStyle]}

Cara memilih klip:
- Klip harus utuh: punya pembuka yang langsung menarik dan penutup yang terasa selesai. Jangan mulai atau berhenti di tengah kalimat atau di tengah cerita.
- Tiga detik pertama harus bisa membuat orang berhenti menggulir: pertanyaan, pernyataan berani, fakta mengejutkan, atau konflik.
- Utamakan emosi, informasi baru, kutipan kuat, humor, dan momen puncak. Hindari basa-basi, sapaan, iklan, dan bagian yang butuh konteks panjang.
- Durasi tiap klip sekitar ${opts.targetDur} detik (boleh antara ${Math.round(opts.targetDur * 0.6)} dan ${Math.round(opts.targetDur * 1.4)} detik).
- Klip tidak boleh saling tumpang tindih.
- "score" adalah nilai 0 sampai 100 untuk potensi ditonton sampai habis dan dibagikan. Jujur dalam menilai; jangan beri semua klip nilai tinggi.

Cara menulis (dalam ${out}):
- Tulis seperti redaktur manusia, bukan seperti mesin. Kalimat lugas, wajar, tidak lebay.
- "title": maksimal 70 karakter, menggambarkan isi klip dengan jelas. Boleh memancing penasaran, tapi jangan menjanjikan sesuatu yang tidak ada di klip. Hindari kata klise seperti "wajib tonton", "viral", "bikin kaget", dan jangan memakai huruf kapital semua.
- "hook": satu kalimat pendek (maksimal 12 kata) untuk teks di layar pada 3 detik pertama.
- "description": 1 sampai 2 kalimat ringkas untuk keterangan unggahan, tanpa emoji.
- "hashtags": 3 sampai 5 tagar yang relevan, tanpa tanda #.
- "reason": satu kalimat singkat kenapa bagian ini layak jadi klip.
- Jangan mengarang fakta yang tidak ada di transkrip.

Transkrip berbentuk baris "#nomor [menit:detik] teks". Isi "start_id" dan "end_id" dengan nomor baris pertama dan terakhir dari klip (keduanya ikut dipakai). Balas hanya dengan JSON sesuai skema.`;
}

function segLine(s: Segment): string {
  return `#${s.id} [${fmtTime(s.s)}] ${s.text}`;
}

function windows(segs: Segment[], size = 1200, overlap = 90): Segment[][] {
  if (!segs.length) return [];
  const total = segs[segs.length - 1].e;
  if (total <= size * 1.15) return [segs];
  const out: Segment[][] = [];
  for (let a = 0; a < total; a += size - overlap) {
    const part = segs.filter((s) => s.e > a && s.s < a + size);
    if (part.length) out.push(part);
    if (a + size >= total) break;
  }
  return out;
}

interface FindArgs {
  transcript: Transcript;
  energy: EnergyData | null;
  duration: number;
  options: AnalysisOptions;
  apiKey: string;
  model: string;
  defaults: ClipDefaults;
  onStatus: (msg: string, ratio: number) => void;
  signal?: AbortSignal;
}

export async function findHighlightsAi(a: FindArgs): Promise<Clip[]> {
  const { transcript, energy, options, defaults } = a;
  const segs = transcript.segments.map((s, i) => ({ ...s, id: i }));
  transcript.segments = segs;
  if (!segs.length) throw new Error('Transkripnya kosong, jadi belum ada yang bisa dipilih. Pastikan videonya ada suara pembicara.');

  const wins = windows(segs);
  const perWin = clamp(Math.ceil((options.maxClips * 1.7) / wins.length) + 1, 3, 14);
  const sys = systemPrompt(options, options.language === 'auto' ? transcript.language || 'auto' : options.language);
  const all: Candidate[] = [];

  for (let i = 0; i < wins.length; i++) {
    a.onStatus(wins.length > 1 ? `Memilih momen penting (bagian ${i + 1} dari ${wins.length})` : 'Memilih momen penting', i / wins.length);
    const user = `Pilih sampai ${perWin} klip terbaik dari transkrip di bawah. Urutkan dari yang paling kuat.\n\n${wins[i].map(segLine).join('\n')}`;
    const res = await chatJson<{ candidates: Candidate[] }>(a.apiKey, a.model, sys, user, SCHEMA, a.signal);
    all.push(...(res.candidates || []));
  }
  a.onStatus('Merapikan hasil', 0.95);

  const minD = Math.max(6, options.targetDur * 0.5);
  const maxD = options.targetDur * 1.5;
  const made: Clip[] = [];

  for (const c of all) {
    const i0 = clamp(Math.round(c.start_id), 0, segs.length - 1);
    let i1 = clamp(Math.round(c.end_id), 0, segs.length - 1);
    if (i1 < i0) continue;
    let start = segs[i0].s;
    let end = segs[i1].e;
    // terlalu pendek: sambung ke kalimat berikutnya
    while (end - start < minD && i1 < segs.length - 1) { i1++; end = segs[i1].e; }
    // terlalu panjang: potong di batas kalimat terakhir yang masih muat
    while (end - start > maxD && i1 > i0) { i1--; end = segs[i1].e; }
    if (end - start < 3) continue;
    // beri napas sedikit di awal dan akhir, tapi jangan masuk ke kalimat lain
    const prevEnd = segs[i0 - 1]?.e ?? 0;
    const nextStart = segs[i1 + 1]?.s ?? a.duration;
    start = Math.max(prevEnd + 0.05, start - 0.2, 0);
    const cap = Math.max(end, nextStart - 0.02);
    end = Math.min(end + 0.3, cap, a.duration);

    const energyScore = meanEnergy(energy, start, end);
    const ai = clamp(Math.round(c.score), 0, 100);
    const final = Math.round(ai * 0.82 + energyScore * 100 * 0.18);
    const tags = (c.hashtags || []).map((t) => t.replace(/^#+/, '').replace(/\s+/g, '')).filter(Boolean).slice(0, 6);
    made.push(
      makeClip(start, end, defaults, {
        title: c.title?.trim() || 'Klip tanpa judul',
        hook: c.hook?.trim() || '',
        description: c.description?.trim() || '',
        hashtags: tags,
        reason: c.reason?.trim() || '',
        score: final,
        scoreAi: ai,
        scoreEnergy: Math.round(energyScore * 100),
      }),
    );
  }

  return pickTop(made, options.maxClips).map((c) => withSubs(c, transcript));
}

export function withSubs(c: Clip, tr: Transcript | null): Clip {
  if (!tr) return c;
  const lines = buildSubLines(tr, c.start, c.end, c.subs.maxWords);
  return { ...c, subs: { ...c.subs, enabled: lines.length > 0, lines, genStart: c.start, genEnd: c.end } };
}

function overlapRatio(a: Clip, b: Clip): number {
  const o = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  if (o <= 0) return 0;
  return o / Math.min(a.end - a.start, b.end - b.start);
}

function pickTop(list: Clip[], max: number, thr = 0.25): Clip[] {
  const sorted = [...list].sort((x, y) => y.score - x.score);
  const out: Clip[] = [];
  for (const c of sorted) {
    if (out.some((k) => overlapRatio(k, c) > thr)) continue;
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

/** Tanpa AI: pilih jendela dengan suara paling hidup, lalu potong di jeda terdekat. */
export function findHighlightsOffline(
  energy: EnergyData,
  duration: number,
  options: AnalysisOptions,
  defaults: ClipDefaults,
): Clip[] {
  const len = options.targetDur;
  if (duration <= len + 2) {
    return [makeClip(0, duration, defaults, { title: 'Seluruh video', score: 50, scoreEnergy: Math.round(meanEnergy(energy, 0, duration) * 100) })];
  }
  const hop = 2;
  const cands: Clip[] = [];
  for (let t = 0; t + len <= duration; t += hop) {
    const sc = meanEnergy(energy, t, t + len);
    cands.push(makeClip(t, t + len, defaults, { score: Math.round(sc * 100), scoreEnergy: Math.round(sc * 100) }));
  }
  const top = pickTop(cands, options.maxClips, 0.001);
  return top
    .map((c, i) => {
      const s = nearestSilence(energy, c.start, 4) ?? c.start;
      const e = nearestSilence(energy, c.end, 4) ?? c.end;
      const start = Math.max(0, Math.min(s, e - 3));
      const end = Math.min(duration, Math.max(e, start + 3));
      return { ...c, start, end, title: `Momen ${i + 1}`, reason: 'Dipilih dari bagian dengan suara paling hidup.' };
    })
    .sort((a, b) => b.score - a.score);
}
