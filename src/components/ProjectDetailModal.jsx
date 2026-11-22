import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// A separate accessible modal layered over the existing Suivi projets window.
// Closing this window returns to the same project overview, never to the homepage.
export default function ProjectDetailModal({ title, siteName, onClose, children }) {
    const dialogRef = useRef(null);
    const closeButtonRef = useRef(null);
    const restoreFocusRef = useRef(null);

    useEffect(() => {
        restoreFocusRef.current = document.activeElement;
        closeButtonRef.current?.focus();
        const handleKeyDown = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopImmediatePropagation();
                onClose();
            }
            if (event.key !== 'Tab') return;
            const controls = Array.from(dialogRef.current?.querySelectorAll(
                'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
            ) || []).filter(element => element.getClientRects().length);
            if (!controls.length) return;
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault(); last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault(); first.focus();
            }
        };
        document.addEventListener('keydown', handleKeyDown, true);
        return () => {
            document.removeEventListener('keydown', handleKeyDown, true);
            restoreFocusRef.current?.focus?.();
        };
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/95 sm:p-4"
             onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}>
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="project-detail-title"
                 className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-slate-900 text-slate-100 shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:max-w-5xl sm:rounded-2xl sm:border sm:border-slate-700">
                <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-700 px-4 py-3 sm:px-6">
                    <div className="min-w-0">
                        <h2 id="project-detail-title" className="break-words text-lg font-bold">{title}</h2>
                        <p className="mt-1 truncate text-xs text-slate-400">{siteName}</p>
                    </div>
                    <button ref={closeButtonRef} type="button" onClick={onClose}
                            aria-label="Fermer le détail et revenir à la synthèse du chantier"
                            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-slate-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
                        <X size={23}/>
                    </button>
                </header>
                <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
                    {children}
                </main>
            </div>
        </div>
    );
}
