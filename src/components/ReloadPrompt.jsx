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

    // In autoUpdate, needRefresh shouldn't stay true long, but if it does, show button
    if (!offlineReady && !needRefresh) return null;

    return null; // Hide prompt in autoUpdate mode unless you want debugging
};

export default ReloadPrompt;
