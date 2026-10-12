// Menyalin mesin ffmpeg (WASM) dari node_modules ke public/ffmpeg.
// Dijalankan otomatis sebelum `npm run dev` dan `npm run build`.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm');
const dest = join(root, 'public', 'ffmpeg');

if (!existsSync(src)) {
  console.error('Folder @ffmpeg/core belum ada. Jalankan `npm install` dulu.');
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
for (const f of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  copyFileSync(join(src, f), join(dest, f));
}
console.log('✓ Mesin ffmpeg disalin ke public/ffmpeg');
