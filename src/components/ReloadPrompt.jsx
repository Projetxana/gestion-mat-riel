// Simplified ReloadPrompt for autoUpdate strategy
import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// With autoUpdate, this component just handles offline ready messages or silent background updates
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

    // Show toast if update available or offline ready
    if (!offlineReady && !needRefresh) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 p-4 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom duration-300">
            <div className="text-white text-sm">
                {offlineReady ? (
                    <span>App ready to work offline</span>
                ) : (
                    <span>New content available, click on reload button to update.</span>
                )}
            </div>
            {needRefresh && (
                <button
                    className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                    onClick={() => updateServiceWorker(true)}
                >
                    Reload
                </button>
            )}
            <button
                className="text-slate-400 hover:text-white"
                onClick={close}
            >
                ✕
            </button>
        </div>
    );
};

export default ReloadPrompt;
