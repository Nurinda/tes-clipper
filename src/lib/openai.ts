import type { Segment, Word } from '../types';
import { sleep } from './utils';

const BASE = 'https://api.openai.com/v1';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

function friendly(status: number, msg: string): string {
  if (status === 401) return 'API key ditolak OpenAI. Cek lagi key-nya di Pengaturan.';
  if (status === 403) return 'Akun OpenAI kamu belum punya akses ke model ini. Coba pilih model lain di Pengaturan.';
  if (status === 404) return 'Model tidak ditemukan di akunmu. Pilih model lain di Pengaturan.';
  if (status === 429) return 'Kuota atau batas permintaan OpenAI habis. Cek saldo di platform.openai.com lalu coba lagi.';
  if (status >= 500) return 'Server OpenAI lagi bermasalah. Coba lagi beberapa saat.';
  return msg || `Permintaan ke OpenAI gagal (kode ${status}).`;
}

async function request(path: string, key: string, init: RequestInit, signal?: AbortSignal, tries = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(BASE + path, {
        ...init,
        signal,
        headers: { Authorization: `Bearer ${key}`, ...(init.headers || {}) },
      });
      if (res.ok) return res;
      let msg = '';
      try { msg = (await res.json())?.error?.message || ''; } catch { /* bukan JSON */ }
      const retry = res.status === 429 || res.status >= 500;
      // 429 karena kuota habis tidak akan membaik kalau diulang
      const quota = /quota|billing/i.test(msg);
      if (retry && !quota && i < tries - 1) { await sleep(1500 * (i + 1)); continue; }
      throw new ApiError(friendly(res.status, msg), res.status);
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      if (e instanceof ApiError) throw e;
      lastErr = e;
      if (i < tries - 1) { await sleep(1200 * (i + 1)); continue; }
    }
  }
  throw new Error('Tidak bisa terhubung ke OpenAI. Periksa koneksi internetmu. ' + ((lastErr as Error)?.message || ''));
}

export async function listModels(key: string): Promise<string[]> {
  const res = await request('/models', key, { method: 'GET' }, undefined, 1);
  const json = await res.json();
  return (json.data as { id: string }[]).map((m) => m.id).sort();
}

const SKIP = /(mini|nano|luna|codex|audio|realtime|image|transcribe|tts|search|embedding|moderation|whisper|dall|sora|instruct|preview|chat-latest|deep-research|computer|cyber|daybreak|oss|davinci|babbage)/i;
const TIER: [RegExp, number][] = [[/astra/i, 5], [/pro/i, 4], [/sol/i, 4], [/terra/i, 2]];

/** Pilih model chat paling baru dan paling besar dari daftar yang tersedia di akun. */
export function pickBestModel(ids: string[]): string | null {
  const scored = ids
    .filter((id) => /^gpt-\d/.test(id) && !SKIP.test(id.replace(/(astra|sol|terra|pro)/gi, '')))
    .filter((id) => !/-\d{4}-\d{2}-\d{2}$/.test(id)) // lewati snapshot bertanggal
    .map((id) => {
      const m = id.match(/^gpt-(\d+)(?:\.(\d+))?/);
      const ver = m ? Number(m[1]) * 100 + Number(m[2] || 0) : 0;
      const tier = TIER.find(([re]) => re.test(id))?.[1] ?? 3;
      return { id, score: ver * 10 + tier };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.id ?? null;
}

export interface WhisperResult { language: string; segments: Segment[]; words: Word[] }

export async function transcribeChunk(
  key: string,
  bytes: Uint8Array,
  offset: number,
  model: string,
  language: string,
  signal?: AbortSignal,
): Promise<WhisperResult> {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'audio/mpeg' }), 'audio.mp3');
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('timestamp_granularities[]', 'segment');
  if (language && language !== 'auto') form.append('language', language);
  const res = await request('/audio/transcriptions', key, { method: 'POST', body: form }, signal);
  const j = await res.json();
  const segments: Segment[] = (j.segments || []).map((s: { start: number; end: number; text: string }) => ({
    id: 0, s: s.start + offset, e: s.end + offset, text: String(s.text).trim(),
  })).filter((s: Segment) => s.text);
  const words: Word[] = (j.words || []).map((w: { word: string; start: number; end: number }) => ({
    w: String(w.word).trim(), s: w.start + offset, e: w.end + offset,
  })).filter((w: Word) => w.w);
  return { language: j.language || language, segments, words };
}

export interface JsonSchema { name: string; schema: Record<string, unknown> }

export async function chatJson<T>(
  key: string,
  model: string,
  system: string,
  user: string,
  schema: JsonSchema,
  signal?: AbortSignal,
): Promise<T> {
  const base = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  const tryBody = async (response_format: unknown) => {
    const res = await request(
      '/chat/completions', key,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...base, response_format }) },
      signal,
    );
    const j = await res.json();
    const text: string = j.choices?.[0]?.message?.content || '';
    const clean = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    return JSON.parse(clean) as T;
  };
  try {
    return await tryBody({ type: 'json_schema', json_schema: { name: schema.name, strict: true, schema: schema.schema } });
  } catch (e) {
    if (e instanceof ApiError && e.status === 400) {
      return await tryBody({ type: 'json_object' });
    }
    throw e;
  }
}
