import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Camera, Send, Trash2, ZoomIn, ZoomOut, CheckCircle2, Image as ImageIcon, AlertTriangle, LoaderCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../context/AppContext';
import { prepareReportPhoto, getPhotoExtension, humanFileSize, photoResolutionWarning } from '../utils/dailyReportMedia';

// Home screen "Caméra": delivery-note images go to Atoom.
// Keep this separate from DailyReportModal ("Rapport journalier").
const DELIVERY_RECIPIENT = 'materiaux@cd.atoomerp.com';

const DeliveryNoteModal = ({ onClose }) => {
    const { addLog, currentUser } = useAppContext();
    const [photos, setPhotos] = useState([]);
    const [previewIndex, setPreviewIndex] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [isPreparing, setIsPreparing] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const photosRef = useRef([]);

    const previewPhoto = previewIndex == null ? null : photos[previewIndex];
    const busy = isPreparing || isUploading;

    useEffect(() => { photosRef.current = photos; }, [photos]);
    useEffect(() => () => {
        photosRef.current.forEach(photo => URL.revokeObjectURL(photo.previewUrl));
    }, []);

    useEffect(() => {
        if (previewIndex === null && !reviewOpen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKeyDown = event => {
            if (event.key !== 'Escape' || isUploading) return;
            if (previewIndex !== null) setPreviewIndex(null);
            else setReviewOpen(false);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [previewIndex, reviewOpen, isUploading]);

    const openPreview = index => {
        setError('');
        setZoom(1);
        setPreviewIndex(index);
    };

    const addPhotos = async (files, showImmediately) => {
        const selected = Array.from(files || []);
        if (!selected.length || busy) return;
        setError('');
        setIsPreparing(true);
        try {
            const results = await Promise.allSettled(selected.map(prepareReportPhoto));
            const additions = results.filter(r => r.status === 'fulfilled').map(r => r.value);
            const failures = results.filter(r => r.status === 'rejected')
                .map(r => r.reason?.message || 'Impossible de lire la photo.');
            if (additions.length) {
                const firstNewIndex = photos.length;
                setPhotos(current => [...current, ...additions]);
                // The still photograph opens immediately at full size,
                // not as a small thumbnail under a live video.
                if (showImmediately) openPreview(firstNewIndex);
            }
            if (failures.length) setError(failures.join(' '));
        } finally {
            setIsPreparing(false);
        }
    };

    const retakePhoto = async file => {
        if (!file || previewIndex === null || busy) return;
        setIsPreparing(true);
        setError('');
        try {
            const replacement = await prepareReportPhoto(file);
            const existing = photos[previewIndex];
            if (!existing) {
                URL.revokeObjectURL(replacement.previewUrl);
                throw new Error('La photo à remplacer est introuvable.');
            }
            setPhotos(prev => prev.map((photo, i) => i === previewIndex ? replacement : photo));
            URL.revokeObjectURL(existing.previewUrl);
            setZoom(1);
        } catch (err) {
            setError(err?.message || 'Impossible de reprendre la photo.');
        } finally {
            setIsPreparing(false);
        }
    };

    const deletePhoto = index => {
        if (busy) return;
        const photo = photos[index];
        if (!photo) return;
        URL.revokeObjectURL(photo.previewUrl);
        setPhotos(prev => prev.filter((_, i) => i !== index));
        if (previewIndex !== null) setPreviewIndex(null);
        setReviewOpen(false);
    };

    const openReview = () => {
        if (busy || !photos.length) {
            setError('Prenez au moins une photo avant de continuer.');
            return;
        }
        setError('');
        setReviewOpen(true);
    };

    const handleSend = async () => {
        // The former "Envoyer" control sent camera video frames immediately.
        // Sending is now possible only after showing the review and confirmation.
        if (!reviewOpen || previewIndex !== null || busy || !photos.length) return;
        setIsUploading(true);
        setUploadProgress(0);
        setError('');
        try {
            const attachments = [];
            const timestamp = Date.now();
            const uploadId = typeof crypto?.randomUUID === 'function'
                ? crypto.randomUUID() : String(timestamp);
            const userName = currentUser?.name || 'Utilisateur';

            for (let i = 0; i < photos.length; i++) {
                const photo = photos[i];
                const mime = photo.mimeType || photo.blob.type || 'image/jpeg';
                const ext = getPhotoExtension(mime);
                const filename = `delivery_${timestamp}_${uploadId}_${i + 1}.${ext}`;
                const { error: uploadError } = await supabase.storage
                    .from('delivery-notes')
                    .upload(filename, photo.blob, { contentType: mime, upsert: false });
                if (uploadError) throw uploadError;
                const { data } = supabase.storage.from('delivery-notes').getPublicUrl(filename);
                attachments.push({ filename, path: data.publicUrl });
                setUploadProgress(Math.round(((i + 1) / photos.length) * 100));
            }

            const date = new Date().toLocaleDateString('fr-FR');
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    recipient: DELIVERY_RECIPIENT,
                    subject: `Bon de Livraison - ${userName} - ${date}`,
                    html: `
                        <h2>Nouveau Bon de Livraison</h2>
                        <p><strong>Envoyé par :</strong> ${userName}</p>
                        <p><strong>Date :</strong> ${date}</p>
                        <p><strong>Nombre de photos :</strong> ${photos.length}</p>
                        <p>Photos originales haute définition en pièces jointes.</p>
                    `,
                    attachments
                })
            });
            const result = await response.json();
            if (!response.ok || !result.success)
                throw new Error(result.error || 'Envoi du bon de livraison impossible.');
            addLog(`[EMAIL CONFIRMED] Bon de livraison envoyé par ${userName}`);
            setReviewOpen(false);
            setMessage('Bon de livraison envoyé.');
            alert('Bon de livraison envoyé avec succès !');
            onClose();
        } catch (err) {
            setError(err?.message || 'Erreur lors de l’envoi.');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950 text-white"
            style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <header className="shrink-0 flex justify-between items-center gap-2 p-4 border-b border-slate-700">
                <div>
                    <h2 className="font-bold text-lg">Scanner bon de livraison</h2>
                    <p className="text-xs text-slate-300">Photos haute définition · aperçu avant envoi</p>
                </div>
                <button type="button" onClick={onClose} disabled={isUploading}
                    className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg border border-slate-600"
                    aria-label="Fermer"><X size={20} /></button>
            </header>
            <main className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
                <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
                    <p className="text-sm">Prenez une photo nette du bon de livraison. Elle s'ouvrira immédiatement en grand pour vérifier les détails.</p>
                    <label className="min-h-14 flex items-center justify-center gap-2 rounded-xl bg-blue-600 text-white text-base font-semibold cursor-pointer">
                        <Camera size={22} /> Prendre une photo
                        <input type="file" accept="image/*" capture="environment"
                            className="sr-only" disabled={busy} onChange={event => {
                                const files = Array.from(event.target.files || []);
                                event.target.value = '';
                                void addPhotos(files, true);
                            }} />
                    </label>
                    <label className="min-h-12 flex items-center justify-center gap-2 rounded-xl border border-slate-600 text-sm font-medium cursor-pointer">
                        <ImageIcon size={19} /> Choisir dans la galerie
                        <input type="file" accept="image/*" multiple className="sr-only"
                            disabled={busy} onChange={event => {
                                const files = Array.from(event.target.files || []);
                                event.target.value = '';
                                void addPhotos(files, true);
                            }} />
                    </label>
                </div>

                {isPreparing && <p role="status" className="text-sm text-blue-200 flex items-center gap-2">
                    <LoaderCircle className="animate-spin" size={18} /> Préparation de la photo…
                </p>}
                {error && <p role="alert" className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-100">
                    <AlertTriangle className="inline mr-2" size={17} />{error}
                </p>}
                {message && <p role="status" className="text-sm text-emerald-200">{message}</p>}
                {photos.length > 0 && <>
                    <h3 className="font-semibold text-base">{photos.length} photo(s) à vérifier</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {photos.map((photo, index) => (
                            <div key={photo.previewUrl} className="rounded-lg border border-slate-700 bg-slate-900 p-2 space-y-2">
                                <button type="button" onClick={() => openPreview(index)}
                                    aria-label={`Agrandir la photo ${index + 1}`}
                                    className="w-full rounded-lg border border-blue-600/60 p-1 text-left">
                                    <img src={photo.previewUrl} alt={`Bon de livraison ${index + 1}`}
                                        className="h-40 w-full rounded object-contain bg-black"/>
                                    <span className="mt-2 flex items-center justify-center gap-2 text-sm font-semibold text-blue-200 min-h-10">
                                        <ZoomIn size={18}/> Voir en grand
                                    </span>
                                </button>
                                <p className="text-xs text-slate-300">{photo.width} × {photo.height} px · {humanFileSize(photo.blob.size)}</p>
                                <button type="button" onClick={() => deletePhoto(index)} disabled={busy}
                                    className="min-h-10 text-xs text-red-300 flex items-center gap-2">
                                    <Trash2 size={16}/> Supprimer
                                </button>
                            </div>
                        ))}
                    </div>
                </>}
            </main>
            <footer className="shrink-0 border-t border-slate-700 bg-slate-900 p-3">
                <button type="button" onClick={openReview} disabled={!photos.length || busy}
                    className="min-h-14 w-full rounded-xl bg-blue-600 font-bold flex items-center justify-center gap-2 disabled:opacity-40">
                    <CheckCircle2 size={21}/> Vérifier les photos et envoyer
                </button>
            </footer>

            {reviewOpen && createPortal(
                <div className="fixed inset-0 z-[500] flex flex-col bg-slate-950 text-white"
                    role="dialog" aria-modal="true" aria-label="Vérification avant envoi"
                    style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
                    <header className="shrink-0 flex justify-between items-center p-4 border-b border-slate-700">
                        <div>
                            <h2 className="font-bold text-lg">Vérifier avant l'envoi</h2>
                            <p className="text-xs text-slate-300">{photos.length} photo(s) · destinataire : {DELIVERY_RECIPIENT}</p>
                        </div>
                        <button type="button" onClick={() => setReviewOpen(false)}
                            disabled={busy} className="min-w-11 min-h-11 border border-slate-600 rounded-lg"
                            aria-label="Modifier les photos"><X className="mx-auto" size={20}/></button>
                    </header>
                    <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
                        <p className="text-sm text-slate-200">Touchez une photo pour vérifier sa netteté en grand format avant de confirmer.</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {photos.map((photo, index) => (
                                <button type="button" key={photo.previewUrl} onClick={() => openPreview(index)}
                                    className="rounded-xl border border-blue-600 p-2 text-left">
                                    <img src={photo.previewUrl} alt={`Photo ${index + 1}`}
                                        className="h-44 w-full object-contain bg-black rounded-lg"/>
                                    <span className="block text-xs text-blue-200 mt-2">Agrandir la photo {index + 1} · {photo.width} × {photo.height} px</span>
                                </button>
                            ))}
                        </div>
                        {error && <p role="alert" className="text-sm text-red-200">{error}</p>}
                    </div>
                    <footer className="shrink-0 grid grid-cols-2 gap-3 border-t border-slate-700 p-3 bg-slate-900">
                        <button type="button" onClick={() => setReviewOpen(false)} disabled={busy}
                            className="min-h-12 rounded-xl border border-slate-600 font-semibold">Modifier</button>
                        <button type="button" onClick={handleSend} disabled={busy || !photos.length}
                            className="min-h-12 rounded-xl bg-blue-600 font-bold disabled:opacity-40">
                            {isUploading ? `Envoi… ${uploadProgress}%` : 'Confirmer l’envoi'}
                        </button>
                    </footer>
                </div>,
                document.body
            )}

            {previewPhoto && createPortal(
                <div className="fixed inset-0 z-[9999] flex flex-col bg-black text-white"
                    role="dialog" aria-modal="true" aria-label="Aperçu grand format du bon de livraison"
                    style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
                    <header className="shrink-0 flex justify-between items-center gap-2 p-3 border-b border-slate-700 bg-slate-900">
                        <div>
                            <h2 className="font-semibold text-sm">Photo {previewIndex + 1} — vérifier en grand</h2>
                            <p className="text-xs text-slate-300">{previewPhoto.width} × {previewPhoto.height} px · {humanFileSize(previewPhoto.blob.size)}</p>
                        </div>
                        <button type="button" onClick={() => setPreviewIndex(null)}
                            className="min-h-11 min-w-11 border border-slate-600 rounded-lg flex items-center justify-center"
                            aria-label="Fermer l’aperçu"><X size={20}/></button>
                    </header>
                    <nav className="shrink-0 flex items-center justify-center gap-3 py-2 bg-slate-900">
                        <button type="button" onClick={() => setZoom(z => Math.max(1, z - 0.5))}
                            disabled={zoom <= 1} aria-label="Réduire le zoom"
                            className="min-h-11 min-w-11 border border-slate-600 rounded-lg flex items-center justify-center disabled:opacity-40"><ZoomOut size={20}/></button>
                        <span className="text-sm tabular-nums min-w-14 text-center">{Math.round(zoom * 100)} %</span>
                        <button type="button" onClick={() => setZoom(z => Math.min(4, z + 0.5))}
                            disabled={zoom >= 4} aria-label="Agrandir le zoom"
                            className="min-h-11 min-w-11 border border-slate-600 rounded-lg flex items-center justify-center disabled:opacity-40"><ZoomIn size={20}/></button>
                    </nav>
                    <div className="min-h-0 flex-1 overflow-auto bg-black p-2">
                        <img src={previewPhoto.previewUrl}
                            alt="Photographie originale en grand format pour vérifier le texte du bon"
                            className="block mx-auto object-contain"
                            style={{
                                width: zoom === 1 ? 'auto' : `${Math.round(zoom * 100)}%`,
                                maxWidth: zoom === 1 ? '100%' : 'none',
                                maxHeight: zoom === 1 ? '100%' : 'none'
                            }}/>
                    </div>
                    {photoResolutionWarning(previewPhoto.width, previewPhoto.height) && (
                        <p role="alert" className="text-xs text-amber-200 p-2 flex items-center gap-2">
                            <AlertTriangle size={16}/>{photoResolutionWarning(previewPhoto.width, previewPhoto.height)}
                        </p>
                    )}
                    <footer className="shrink-0 flex flex-wrap items-center justify-between gap-2 p-3 border-t border-slate-700 bg-slate-900">
                        <label className="min-h-11 rounded-lg px-3 border border-blue-600 flex items-center justify-center cursor-pointer text-sm">
                            <Camera size={17} className="mr-2"/> Reprendre
                            <input type="file" accept="image/*" capture="environment"
                                disabled={busy} className="sr-only" onChange={event => {
                                    const file = event.target.files?.[0];
                                    event.target.value = '';
                                    void retakePhoto(file);
                                }}/>
                        </label>
                        <button type="button" onClick={() => deletePhoto(previewIndex)}
                            disabled={busy} className="min-h-11 px-3 border border-red-700 text-red-200 rounded-lg text-sm">Supprimer</button>
                        <button type="button" onClick={() => setPreviewIndex(null)}
                            className="min-h-11 px-4 rounded-lg bg-blue-600 font-bold text-sm">Conserver la photo</button>
                    </footer>
                </div>,
                document.body
            )}
        </div>
    );
};

export default DeliveryNoteModal;
