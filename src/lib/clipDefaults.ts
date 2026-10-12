import type { Clip, Aspect, Fit } from '../types';
import { uid } from './utils';

export interface ClipDefaults { aspect: Aspect; fit: Fit }

export function makeClip(
  start: number,
  end: number,
  d: ClipDefaults,
  extra: Partial<Clip> = {},
): Clip {
  return {
    id: uid(),
    title: 'Klip baru',
    description: '',
    hashtags: [],
    hook: '',
    reason: '',
    score: 0,
    scoreAi: null,
    scoreEnergy: 0,
    start,
    end,
    aspect: d.aspect,
    fit: d.fit,
    posX: 0.5,
    posY: 0.5,
    speed: 1,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    normalize: false,
    musicName: null,
    musicVolume: 0.25,
    brightness: 0,
    contrast: 1,
    saturation: 1,
    subs: {
      enabled: false,
      style: 'karaoke',
      font: 'montserrat',
      size: 6.2,
      color: '#FFFFFF',
      hlColor: '#FFD60A',
      position: 'bawah',
      maxWords: 4,
      lines: [],
      genStart: start,
      genEnd: end,
      edited: false,
    },
    overlays: [],
    watermark: { enabled: false, source: 'kumparan-putih', corner: 'ka', size: 18, opacity: 0.9 },
    ...extra,
  };
}
