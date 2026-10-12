import type { AnalysisOptions, Project, Transcript } from '../types';
import { analyzeChunks, extractAudioChunks } from './audio';
import { cancelFFmpeg } from './ffmpeg';
import { findHighlightsAi, findHighlightsOffline } from './highlight';
import { transcribeChunk } from './openai';
import type { ClipDefaults } from './clipDefaults';
import { uid } from './utils';

export type StepId = 'audio' | 'energy' | 'transcribe' | 'highlight';
export interface StepState { id: StepId; label: string; ratio: number; detail?: string; status: 'wait' | 'run' | 'done' | 'skip' }

export const STEP_LABELS: Record<StepId, string> = {
  audio: 'Mengambil audio dari video',
  energy: 'Membaca naik-turunnya suara',
  transcribe: 'Menyalin ucapan jadi teks',
  highlight: 'Memilih momen penting',
};

interface Args {
  file: File;
  duration: number;
  options: AnalysisOptions;
  apiKey: string;
  model: string;
  transcribeModel: string;
  defaults: ClipDefaults;
  onStep: (id: StepId, ratio: number, detail?: string) => void;
  signal: AbortSignal;
}

function checkAbort(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Dibatalkan', 'AbortError');
}

export async function analyzeVideo(a: Args): Promise<Project> {
  const { file, options, signal } = a;
  const onAbort = () => cancelFFmpeg();
  signal.addEventListener('abort', onAbort);

  try {
    a.onStep('audio', 0);
    const raw = await extractAudioChunks(file, (r) => a.onStep('audio', r));
    checkAbort(signal);
    a.onStep('audio', 1);

    a.onStep('energy', 0);
    const { chunks, energy } = await analyzeChunks(raw, (r) => a.onStep('energy', r));
    checkAbort(signal);
    a.onStep('energy', 1);

    let transcript: Transcript | null = null;
    let clips;

    if (options.useAi) {
      a.onStep('transcribe', 0);
      const results: Awaited<ReturnType<typeof transcribeChunk>>[] = new Array(chunks.length);
      let done = 0;
      let next = 0;
      const worker = async () => {
        while (next < chunks.length) {
          const i = next++;
          checkAbort(signal);
          results[i] = await transcribeChunk(a.apiKey, chunks[i].bytes, chunks[i].offset, a.transcribeModel, options.language, signal);
          done++;
          a.onStep('transcribe', done / chunks.length, `${done} dari ${chunks.length} bagian`);
        }
      };
      await Promise.all([worker(), worker()]);
      checkAbort(signal);

      transcript = {
        language: results.find((r) => r.language)?.language,
        segments: results.flatMap((r) => r.segments).map((s, i) => ({ ...s, id: i })),
        words: results.flatMap((r) => r.words),
      };

      a.onStep('highlight', 0);
      clips = await findHighlightsAi({
        transcript,
        energy,
        duration: a.duration,
        options,
        apiKey: a.apiKey,
        model: a.model,
        defaults: a.defaults,
        signal,
        onStatus: (msg, r) => a.onStep('highlight', r, msg),
      });
      if (!clips.length) throw new Error('Belum ada momen yang cocok jadi klip. Coba ubah durasi target atau pakai video dengan lebih banyak pembicaraan.');
    } else {
      a.onStep('highlight', 0);
      clips = findHighlightsOffline(energy, a.duration, options, a.defaults);
    }
    a.onStep('highlight', 1);

    return {
      id: uid(),
      name: file.name.replace(/\.[^.]+$/, ''),
      createdAt: Date.now(),
      duration: a.duration,
      size: file.size,
      transcript,
      energy,
      clips,
      analysis: options,
    };
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
