export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const uid = () => Math.random().toString(36).slice(2, 10);

export function fmtTime(sec: number, withMs = false): string {
  if (!isFinite(sec)) return '0:00';
  const neg = sec < 0;
  sec = Math.abs(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ss = withMs ? s.toFixed(1).padStart(4, '0') : String(Math.floor(s)).padStart(2, '0');
  const body = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  return neg ? '-' + body : body;
}

export function fmtDur(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} dtk`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s ? `${m} mnt ${s} dtk` : `${m} mnt`;
}

export function fmtBytes(n: number): string {
  if (n > 1e9) return (n / 1e9).toFixed(2) + ' GB';
  if (n > 1e6) return (n / 1e6).toFixed(1) + ' MB';
  return Math.max(1, Math.round(n / 1e3)) + ' KB';
}

export function slug(s: string): string {
  const out = s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 48);
  return out || 'klip';
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function pad(n: number, w = 2) { return String(n).padStart(w, '0'); }

export function hexToAss(hex: string, alpha = 0): string {
  // ASS memakai urutan &HAABBGGRR
  const h = hex.replace('#', '');
  const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6);
  return `&H${alpha.toString(16).toUpperCase().padStart(2, '0')}${b}${g}${r}`.toUpperCase();
}
