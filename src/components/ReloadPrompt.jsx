import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

const ReloadPrompt = () => {
    const {
        offlineReady: [offlineReady, setOfflineReady],
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r) {
            console.log('SW Registered: ' + r);
        },
        onRegisterError(error) {
            console.log('SW registration error', error);
        },
    });

    const close = () => {
        setOfflineReady(false);
        setNeedRefresh(false);
    };

    if (!offlineReady && !needRefresh) return null;

    return (
        <div className="fixed bottom-0 right-0 p-4 m-4 z-[9999] animate-in slide-in-from-bottom duration-300">
            <div className="bg-slate-800 text-white p-4 rounded-lg shadow-2xl border border-slate-700 flex flex-col gap-3 max-w-sm">
                <div className="flex items-start justify-between gap-4">
                    <div className="text-sm">
                        {offlineReady ? (
                            <span>L'application est prête pour une utilisation hors ligne.</span>
                        ) : (
                            <span className="font-semibold text-blue-400">
                                Une nouvelle version est disponible !
                            </span>
                        )}
                    </div>
                    <button onClick={close} className="text-slate-400 hover:text-white">
                        <X size={16} />
                    </button>
                </div>

                {needRefresh && (
                    <button
                        onClick={() => updateServiceWorker(true)}
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-md text-sm font-bold transition-colors"
                    >
                        <RefreshCw size={16} />
                        Mettre à jour maintenant
                    </button>
                )}
            </div>
        </div>
    );
};

export default ReloadPrompt;
