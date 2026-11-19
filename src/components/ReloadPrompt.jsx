import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export default function ReloadPrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  const [newVersion, setNewVersion] = React.useState(false);

  React.useEffect(() => {
    // La version native est distribuée par TestFlight/App Store, pas par Vercel.
    if (!['http:', 'https:'].includes(window.location.protocol)) return;
    let alive = true;
    const check = async () => {
      try {
        const response = await fetch('/release.json', { cache: 'no-store' });
        if (!response.ok) return;
        const latest = await response.json();
        if (alive && latest.id && latest.id !== __BUILDTRACK_RELEASE__) setNewVersion(true);
      } catch (_) { /* Hors ligne : ne pas interrompre la saisie d'heures. */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    check();
    const timer = setInterval(check, 180000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!needRefresh && !newVersion) return null;
  return (
    <div role="status" className="fixed bottom-20 left-3 right-3 z-[9999] mx-auto max-w-md rounded-xl bg-slate-800 border border-blue-500 p-4 text-white shadow-2xl">
      <p className="text-sm font-semibold mb-2">Une nouvelle version de BuildTrack est disponible.</p>
      <p className="text-xs text-slate-300 mb-3">Enregistrez vos heures avant d'actualiser.</p>
      <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 font-semibold" onClick={() => {
        if (needRefresh) updateServiceWorker(true);
        else window.location.reload();
      }}>Actualiser BuildTrack</button>
    </div>
  );
}
