import { type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useToasts } from '../store';

export function Slider(p: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; format?: (v: number) => string; hint?: string;
}) {
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between">
        <span className="lbl !mb-0">{p.label}</span>
        <span className="text-xs font-bold tabular-nums text-ink">{p.format ? p.format(p.value) : p.value}</span>
      </div>
      <input
        type="range" min={p.min} max={p.max} step={p.step ?? 1} value={p.value}
        onChange={(e) => p.onChange(Number(e.target.value))}
        aria-label={p.label}
      />
      {p.hint && <p className="mt-0.5 text-xs text-mute">{p.hint}</p>}
    </div>
  );
}

export function Toggle(p: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-3 ${p.disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <span className="relative mt-0.5 inline-flex h-5 w-9 shrink-0">
        <input
          type="checkbox" className="peer sr-only" checked={p.checked} disabled={p.disabled}
          onChange={(e) => p.onChange(e.target.checked)}
        />
        <span className="absolute inset-0 rounded-pill bg-line transition-colors peer-checked:bg-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
      <span>
        <span className="block text-sm font-bold">{p.label}</span>
        {p.hint && <span className="block text-xs text-mute">{p.hint}</span>}
      </span>
    </label>
  );
}

export function Seg<T extends string | number>(p: {
  value: T; options: { v: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label?: string;
}) {
  return (
    <div role="group" aria-label={p.label} className="seg">
      {p.options.map((o) => (
        <button key={String(o.v)} type="button" aria-pressed={o.v === p.value} title={o.title} onClick={() => p.onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field(p: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="lbl">{p.label}</span>
      {p.children}
      {p.hint && <span className="mt-1 block text-xs text-mute">{p.hint}</span>}
    </label>
  );
}

export function Section(p: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-line py-4 last:border-0">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold">{p.title}</h3>
        {p.aside}
      </div>
      {p.children}
    </section>
  );
}

export function ColorInput(p: { label: string; value: string; onChange: (v: string) => void; swatches?: string[] }) {
  return (
    <div>
      <span className="lbl">{p.label}</span>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={p.label} value={p.value} onChange={(e) => p.onChange(e.target.value)} className="!w-12 shrink-0" />
        <div className="flex flex-wrap gap-1">
          {(p.swatches ?? ['#FFFFFF', '#FFD60A', '#00B2B1', '#ED1847', '#000000']).map((c) => (
            <button
              key={c} type="button" aria-label={`Warna ${c}`} onClick={() => p.onChange(c)}
              className="h-6 w-6 rounded-full border border-line"
              style={{ background: c, outline: p.value.toLowerCase() === c.toLowerCase() ? '2px solid #00B2B1' : undefined, outlineOffset: 1 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function Toasts() {
  const { items, drop } = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-16 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg ${
            t.kind === 'error' ? 'bg-hot text-white' : t.kind === 'ok' ? 'bg-primary text-primary-ink' : 'bg-ink text-bg'
          }`}
        >
          <span className="flex-1 whitespace-pre-line">{t.text}</span>
          <button onClick={() => drop(t.id)} aria-label="Tutup" className="opacity-80 hover:opacity-100"><X size={16} /></button>
        </div>
      ))}
    </div>
  );
}

export function Progress({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`h-2 overflow-hidden rounded-pill bg-raised ${className}`} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-pill bg-brand transition-[width] duration-300" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}
