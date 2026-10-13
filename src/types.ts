export type Aspect = '9:16' | '1:1' | '4:5' | '16:9' | 'asli';
export type Fit = 'crop' | 'blur' | 'fit';
export type SubStyleName = 'karaoke' | 'kotak' | 'minimal' | 'garis';
export type FontKey = 'montserrat' | 'poppins' | 'bebas';
export type SubPosition = 'atas' | 'tengah' | 'bawah';
export type Corner = 'ka' | 'ki' | 'ba' | 'bi';

export interface Word { w: string; s: number; e: number }
export interface Segment { id: number; s: number; e: number; text: string }
export interface Transcript { language?: string; segments: Segment[]; words: Word[] }

export interface SubLine { id: string; s: number; e: number; text: string; words?: Word[] }

export interface SubSettings {
  enabled: boolean;
  style: SubStyleName;
  font: FontKey;
  size: number;        // persen dari lebar video
  color: string;
  hlColor: string;
  position: SubPosition;
  maxWords: number;
  lines: SubLine[];
  genStart: number;
  genEnd: number;
  edited: boolean;
}

export interface TextOverlay {
  id: string;
  text: string;
  s: number;           // detik relatif dari awal klip
  e: number;
  x: number;           // 0..1 (titik tengah)
  y: number;
  size: number;        // persen dari lebar video
  color: string;
  bg: string | null;
}

export interface Watermark {
  enabled: boolean;
  source: 'kumparan' | 'kumparan-putih' | 'custom';
  customDataUrl?: string;
  corner: Corner;
  size: number;        // persen dari lebar video
  opacity: number;     // 0..1
}

export type CoverTemplate = 'bawah' | 'kotak' | 'minimal';
export interface CoverSettings {
  time: number | null;   // detik di video sumber; null = belum dipilih otomatis
  focusX: number;
  focusY: number;
  template: CoverTemplate;
  text: string | null;   // null = otomatis dari teks pembuka / judul
  color: string;
  accent: string;
  logo: boolean;
  textSize: number;      // pengali ukuran huruf
}

export interface Clip {
  id: string;
  title: string;
  description: string;
  hashtags: string[];
  hook: string;
  reason: string;
  score: number;
  scoreAi: number | null;
  scoreEnergy: number;
  start: number;
  end: number;
  aspect: Aspect;
  fit: Fit;
  posX: number;        // 0..1
  posY: number;
  speed: number;
  volume: number;      // 0..2
  fadeIn: number;
  fadeOut: number;
  normalize: boolean;
  musicName: string | null;
  musicVolume: number; // 0..1
  brightness: number;  // -0.5..0.5
  contrast: number;    // 0.5..1.5
  saturation: number;  // 0..2
  subs: SubSettings;
  overlays: TextOverlay[];
  watermark: Watermark;
  cover?: CoverSettings;
}

export interface EnergyData {
  step: number;        // detik per titik
  rms: number[];       // 0..1 dinormalisasi
  silence: number[];   // titik tengah jeda (detik)
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  duration: number;
  size: number;
  transcript: Transcript | null;
  energy: EnergyData | null;
  clips: Clip[];
  analysis: AnalysisOptions;
}

export type ContentStyle = 'podcast' | 'tutorial' | 'gaming' | 'vlog' | 'webinar' | 'wawancara' | 'berita';

export interface AnalysisOptions {
  targetDur: number;
  maxClips: number;
  contentStyle: ContentStyle;
  language: string;    // 'id', 'en', ... atau 'auto'
  useAi: boolean;
}

export const ASPECT_RATIO: Record<Exclude<Aspect, 'asli'>, [number, number]> = {
  '9:16': [9, 16], '1:1': [1, 1], '4:5': [4, 5], '16:9': [16, 9],
};
