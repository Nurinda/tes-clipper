import { Moon, Scissors, Settings as Cog, Sun } from 'lucide-react';
import { useApp, useSettings } from '../store';

export default function Header() {
  const { view, go, project, closeProject } = useApp();
  const { theme, set } = useSettings();

  const toggle = () => {
    const next = theme === 'gelap' ? 'terang' : 'gelap';
    set({ theme: next });
  };

  const home = () => { if (project) closeProject(); else go('beranda'); };

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1480px] items-center gap-2 px-4">
        <button onClick={home} className="flex items-center gap-2 rounded-pill pr-2 text-lg font-extrabold tracking-tight text-primary" aria-label="Ke beranda">
          <span className="grid h-8 w-8 place-items-center rounded-2xl bg-brand text-white"><Scissors size={17} strokeWidth={2.6} /></span>
          Clipper
        </button>
        <nav className="ml-3 hidden items-center gap-1 sm:flex">
          <button className={`btn btn-sm ${view !== 'pengaturan' ? 'btn-soft' : 'btn-ghost'}`} onClick={home}>Proyek</button>
          <button className={`btn btn-sm ${view === 'pengaturan' ? 'btn-soft' : 'btn-ghost'}`} onClick={() => go('pengaturan')}>Pengaturan</button>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <button className="icon-btn sm:hidden" onClick={() => go('pengaturan')} aria-label="Pengaturan"><Cog size={18} /></button>
          <button className="icon-btn" onClick={toggle} aria-label={theme === 'gelap' ? 'Pakai tema terang' : 'Pakai tema gelap'}>
            {theme === 'gelap' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <img src="/logo-kumparan.webp" alt="logo kumparan" className="ml-2 h-7 w-auto" width={112} height={28} />
        </div>
      </div>
    </header>
  );
}
