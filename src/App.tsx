import { useEffect } from 'react';
import Header from './components/Header';
import { Toasts } from './components/ui';
import Home from './pages/Home';
import Analyzing from './pages/Analyzing';
import ProjectPage from './pages/Project';
import Settings from './pages/Settings';
import { useApp, useSettings } from './store';
import { onFfmpegStatus } from './lib/ffmpeg';
import { saveProject } from './lib/storage';

export default function App() {
  const view = useApp((s) => s.view);
  const theme = useSettings((s) => s.theme);

  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'gelap'); }, [theme]);
  useEffect(() => { onFfmpegStatus((m) => useApp.getState().setFfStatus(m)); return () => onFfmpegStatus(null); }, []);

  // simpan proyek otomatis setiap ada perubahan
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const unsub = useApp.subscribe((s, prev) => {
      if (s.project && s.project !== prev.project) {
        clearTimeout(timer);
        const p = s.project;
        timer = setTimeout(() => saveProject(p), 800);
      }
    });
    return () => { unsub(); clearTimeout(timer); };
  }, []);

  return (
    <>
      <Header />
      {view === 'beranda' && <Home />}
      {view === 'analisis' && <Analyzing />}
      {view === 'proyek' && <ProjectPage />}
      {view === 'pengaturan' && <Settings />}
      <Toasts />
    </>
  );
}
