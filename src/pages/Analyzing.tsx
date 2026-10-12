import { AlertTriangle, Check, Loader2, Minus } from 'lucide-react';
import { useApp } from '../store';
import { Progress } from '../components/ui';

export default function Analyzing() {
  const { steps, analyzeError, cancelAnalysis, pending, ffStatus, go } = useApp();

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-4 py-14">
      <div className="card p-6">
        <h1 className="text-2xl font-extrabold">{analyzeError ? 'Analisis terhenti' : 'Sedang menganalisis videomu'}</h1>
        {pending && <p className="mt-1 truncate text-sm text-mute">{pending.file.name}</p>}

        {analyzeError ? (
          <div className="mt-5 space-y-4">
            <p className="flex gap-2 whitespace-pre-line break-words rounded-2xl bg-hot-soft p-3 text-sm font-semibold text-hot dark:bg-raised">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />{analyzeError}
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => go('pengaturan')}>Buka Pengaturan</button>
              <button className="btn btn-primary" onClick={() => go('beranda')}>Kembali</button>
            </div>
          </div>
        ) : (
          <>
            <ul className="mt-6 space-y-4">
              {steps.map((s) => (
                <li key={s.id} className={s.status === 'skip' ? 'opacity-50' : ''}>
                  <div className="flex items-center gap-2 text-sm font-bold">
                    {s.status === 'done' && <Check size={16} className="text-primary" />}
                    {s.status === 'run' && <Loader2 size={16} className="animate-spin text-primary" />}
                    {s.status === 'wait' && <span className="h-4 w-4 rounded-full border-2 border-line" />}
                    {s.status === 'skip' && <Minus size={16} />}
                    <span className="flex-1">{s.label}</span>
                    {s.status === 'run' && <span className="text-xs tabular-nums text-mute">{Math.round(s.ratio * 100)}%</span>}
                    {s.status === 'skip' && <span className="text-xs text-mute">dilewati</span>}
                  </div>
                  {s.status === 'run' && (
                    <>
                      <Progress value={s.ratio} className="mt-2" />
                      {s.detail && <p className="mt-1 text-xs text-mute">{s.detail}</p>}
                    </>
                  )}
                </li>
              ))}
            </ul>
            {ffStatus && <p className="mt-5 text-xs text-mute">{ffStatus}</p>}
            <p className="mt-5 text-xs text-mute">Biarkan tab ini tetap terbuka. Video berdurasi satu jam biasanya butuh beberapa menit, tergantung kecepatan komputer dan internetmu.</p>
            <div className="mt-5 flex justify-end">
              <button className="btn btn-soft" onClick={cancelAnalysis}>Batalkan</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
