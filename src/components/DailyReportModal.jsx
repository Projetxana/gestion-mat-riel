import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, Send, Trash2, Plus, Image as ImageIcon, ZoomIn, ZoomOut, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../context/AppContext';
import { prepareReportPhoto, getPhotoExtension, humanFileSize, photoResolutionWarning } from '../utils/dailyReportMedia';

const LEVELS = [
    "Sous-sol 1", "Sous-sol 2", "Rez-de-chaussée",
    "2e étage", "3e étage", "4e étage", "5e étage", "6e étage", "7e étage", "8e étage", "9e étage", "10e étage",
    "Appenti", "Salle à déchets", "Salle de pompe", "Autre"
];

const DailyReportModal = ({ onClose }) => {
    const { addLog, currentUser, sites } = useAppContext();

    // Global State
    const [selectedSiteId, setSelectedSiteId] = useState('');
    const [notes, setNotes] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    // Sections State: Array of { id, level, customLevel, roomDetail, photos: [{blob, previewUrl}] }
    const [sections, setSections] = useState([
        { id: Date.now(), level: 'Rez-de-chaussée', customLevel: '', roomDetail: '', photos: [] }
    ]);

    // A real full-resolution still comes from the native camera's file picker.
    // Preview is a separate, mandatory step before an email can be sent.
    const [photoPreview, setPhotoPreview] = useState(null);
    const [photoZoom, setPhotoZoom] = useState(1);
    const [showSendReview, setShowSendReview] = useState(false);
    const [photoError, setPhotoError] = useState('');
    const [preparingPhotos, setPreparingPhotos] = useState(false);
    const photosRef = useRef([]);
    const currentPreviewPhoto = photoPreview
        ? sections.find(section => section.id === photoPreview.sectionId)?.photos[photoPreview.index]
        : null;
    const showPhoto = (sectionId, index) => {
        setPhotoZoom(1);
        setPhotoPreview({ sectionId, index });
    };

    // --- SECTIONS LOGIC ---
    const addSection = () => {
        setSections(prev => [
            ...prev,
            { id: Date.now(), level: 'Rez-de-chaussée', customLevel: '', roomDetail: '', photos: [] }
        ]);
    };

    const removeSection = (sectionId) => {
        if (sections.length === 1 || isUploading) return;
        const deleted = sections.find(section => section.id === sectionId);
        deleted?.photos.forEach(photo => URL.revokeObjectURL(photo.previewUrl));
        if (photoPreview?.sectionId === sectionId) setPhotoPreview(null);
        setSections(prev => prev.filter(section => section.id !== sectionId));
    };

    const updateSection = (sectionId, field, value) => {
        setSections(prev => prev.map(s => s.id === sectionId ? { ...s, [field]: value } : s));
    };

    const addFilesToSection = async (sectionId, fileList, previewImmediately = false) => {
        const files = Array.from(fileList || []);
        if (!files.length || isUploading) return;
        setPhotoError('');
        setPreparingPhotos(true);
        try {
            const received = await Promise.allSettled(files.map(prepareReportPhoto));
            const photos = received.filter(result => result.status === 'fulfilled')
                .map(result => result.value);
            const errors = received.filter(result => result.status === 'rejected')
                .map(result => result.reason?.message || 'Image illisible.');
            if (photos.length) {
                const firstNewIndex = sections.find(section => section.id === sectionId)?.photos.length || 0;
                setSections(prev => prev.map(section =>
                    section.id === sectionId
                        ? { ...section, photos: [...section.photos, ...photos] }
                        : section
                ));
                // Present the real captured still immediately to inspect focus
                // and retake before the user returns to the report.
                if (previewImmediately) showPhoto(sectionId, firstNewIndex);
            }
            if (errors.length) setPhotoError(errors.join(' '));
        } finally {
            setPreparingPhotos(false);
        }
    };

    const replacePreviewPhoto = async (file) => {
        if (!file || !photoPreview || isUploading) return;
        setPhotoError('');
        setPreparingPhotos(true);
        try {
            const replacement = await prepareReportPhoto(file);
            const target = sections.find(section => section.id === photoPreview.sectionId);
            const previous = target?.photos[photoPreview.index];
            if (!previous) {
                URL.revokeObjectURL(replacement.previewUrl);
                return;
            }
            setSections(prev => prev.map(section => {
                if (section.id !== photoPreview.sectionId) return section;
                const photos = [...section.photos];
                photos[photoPreview.index] = replacement;
                return { ...section, photos };
            }));
            URL.revokeObjectURL(previous.previewUrl);
            setPhotoZoom(1);
        } catch (error) {
            setPhotoError(error.message || 'Impossible de reprendre la photo.');
        } finally {
            setPreparingPhotos(false);
        }
    };

    const removePhotoFromSection = (sectionId, photoIndex) => {
        if (isUploading) return;
        const photo = sections.find(section => section.id === sectionId)?.photos[photoIndex];
        if (photo) URL.revokeObjectURL(photo.previewUrl);
        setSections(prev => prev.map(section => {
            if (section.id !== sectionId) return section;
            return { ...section, photos: section.photos.filter((_, i) => i !== photoIndex) };
        }));
        if (photoPreview?.sectionId === sectionId) setPhotoPreview(null);
    };

    // Revoke ALL temporary previews on unmount, including images taken later.
    useEffect(() => {
        photosRef.current = sections.flatMap(section => section.photos);
    }, [sections]);
    useEffect(() => () => {
        photosRef.current.forEach(photo => URL.revokeObjectURL(photo.previewUrl));
    }, []);

    const validateReport = () => {
        if (!selectedSiteId) {
            setPhotoError('Veuillez sélectionner un chantier.');
            return false;
        }
        const selectedSite = sites.find(site => String(site.id) === String(selectedSiteId));
        if (!selectedSite?.email) {
            setPhotoError('Ce chantier ne possède pas de destinataire courriel configuré.');
            return false;
        }
        if (!sections.some(section => section.photos.length)) {
            setPhotoError('Veuillez ajouter au moins une photo.');
            return false;
        }
        if (preparingPhotos) {
            setPhotoError('Les photos sont encore en préparation.');
            return false;
        }
        setPhotoError('');
        return true;
    };

    const openSendReview = () => {
        if (!validateReport()) return;
        setPhotoPreview(null);
        setShowSendReview(true);
    };

    // --- REPORT GENERATION ---
    const generateReportImage = async (siteName, userName, date, textNotes) => {
        // A 1600px report cover avoids the pixelation of the old 800px JPEG.
        // The photographed documents are emailed independently at full resolution.
        const width = 800;
        const height = Math.max(720, 590 + sections.length * 36 +
            Math.ceil((textNotes || '').length / 34) * 36);
        const pixelScale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = width * pixelScale;
        canvas.height = height * pixelScale;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Impossible de préparer le rapport.');
        ctx.scale(pixelScale, pixelScale);

        // Background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // Header
        ctx.fillStyle = '#1e3a8a';
        ctx.fillRect(0, 0, width, 150);

        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 40px Arial';
        ctx.fillText("RAPPORT JOURNALIER", 50, 90);

        // Meta Info
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(50, 180, 700, 120);

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 24px Arial';
        ctx.fillText(`CHANTIER: ${siteName}`, 80, 230);
        ctx.font = '24px Arial';
        ctx.fillText(`Technicien: ${userName}`, 80, 270);
        ctx.textAlign = 'right';
        ctx.fillText(`Date: ${date}`, 720, 230);
        ctx.textAlign = 'left';

        // Sections Summary
        let y = 350;
        ctx.font = 'bold 24px Arial';
        ctx.fillText("ZONES INSPECTÉES :", 50, y);
        y += 40;
        ctx.font = '20px Arial';
        ctx.fillStyle = '#334155';

        sections.forEach(s => {
            const levelName = s.level === 'Autre' ? (s.customLevel || 'Autre') : s.level;
            const roomSuffix = s.roomDetail ? ` - ${s.roomDetail}` : '';
            const count = s.photos.length;
            ctx.fillText(`• ${levelName}${roomSuffix} (${count} photos)`, 70, y);
            y += 30;
        });

        // Notes
        y += 40;
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 28px Arial';
        ctx.fillText("ÉVÉNEMENT / NOTES:", 50, y);
        y += 40;

        ctx.font = '24px Arial';
        const maxWidth = 700;
        const lineHeight = 36;
        const x = 50;

        if (!textNotes) {
            ctx.fillStyle = '#94a3b8';
            ctx.fillText("(Aucune note particulière)", x, y);
        } else {
            ctx.fillStyle = '#334155';
            const words = textNotes.split(' ');
            let line = '';
            for (let n = 0; n < words.length; n++) {
                const testLine = line + words[n] + ' ';
                if (ctx.measureText(testLine).width > maxWidth && n > 0) {
                    ctx.fillText(line, x, y);
                    line = words[n] + ' ';
                    y += lineHeight;
                } else {
                    line = testLine;
                }
            }
            ctx.fillText(line, x, y);
        }

        ctx.fillStyle = '#64748b';
        ctx.font = 'italic 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText("Généré par BuildTrack", width / 2, height - 20);

        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Erreur génération image"));
            }, 'image/jpeg', 0.96);
        });
    };

    const handleSend = async () => {
        // Sending is possible only after viewing the confirmation screen.
        if (!showSendReview || isUploading || !validateReport()) return;

        const totalPhotos = sections.reduce((sum, section) => sum + section.photos.length, 0);
        if (totalPhotos === 0) return;
        setIsUploading(true);
        setUploadProgress(0);

        try {
            const selectedSite = sites.find(s => String(s.id) === String(selectedSiteId));
            if (!selectedSite?.email) throw new Error("Chantier sans email configuré.");

            const siteName = selectedSite.name;
            const recipientEmail = selectedSite.email;
            const dateStr = new Date().toLocaleDateString('fr-FR');
            const userName = currentUser?.name || 'Technicien';
            const timestamp = Date.now();
            const safeSite = siteName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 65);
            const uniquePrefix = `reports/${selectedSite.id}/${timestamp}_${crypto.randomUUID()}`;

            // The cover is rendered at 1600px. Photos are uploaded separately
            // at exactly the original resolution reviewed by the employee.
            const docBlob = await generateReportImage(siteName, userName, dateStr, notes);
            const docFileName = `Rapport_${dateStr.replace(/\//g, '-')}_${safeSite}.jpg`;
            const docStoragePath = `${uniquePrefix}/${docFileName}`;

            const { error: docError } = await supabase.storage
                .from('delivery-notes')
                .upload(docStoragePath, docBlob, {
                    contentType: 'image/jpeg',
                    upsert: false
                });
            if (docError) throw docError;

            const { data: docUrlData } = supabase.storage
                .from('delivery-notes')
                .getPublicUrl(docStoragePath);

            const attachments = [
                { filename: docFileName, path: docUrlData.publicUrl }
            ];

            let processedCount = 0;
            for (const section of sections) {
                const levelName = (section.level === 'Autre'
                    ? (section.customLevel || 'Autre')
                    : section.level)
                    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 50) || 'Zone';

                for (let i = 0; i < section.photos.length; i++) {
                    const photo = section.photos[i];
                    const extension = getPhotoExtension(photo.mimeType || photo.blob.type);
                    const fileName = `${levelName}_Photo_${i + 1}.${extension}`;
                    const photoStoragePath = `${uniquePrefix}/photo_${processedCount}_${fileName}`;

                    const { error } = await supabase.storage
                        .from('delivery-notes')
                        .upload(photoStoragePath, photo.blob, {
                            contentType: photo.mimeType || 'image/jpeg',
                            upsert: false
                        });
                    if (error) throw error;

                    const { data: publicData } = supabase.storage
                        .from('delivery-notes')
                        .getPublicUrl(photoStoragePath);

                    attachments.push({
                        filename: fileName,
                        path: publicData.publicUrl
                    });

                    processedCount++;
                    setUploadProgress(Math.round((processedCount / totalPhotos) * 100));
                }
            }

            // 3. Email

            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    recipient: recipientEmail,
                    subject: `Rapport Journalier - ${siteName} - ${dateStr}`,
                    html: `
                        <h2>Rapport Journalier du ${dateStr}</h2>
                        <p><strong>Chantier :</strong> ${siteName}</p>
                        <p><strong>Technicien :</strong> ${userName}</p>
                        <hr/>
                        <h3>Résumé des zones :</h3>
                        <ul>${sections.map(s => {
                        const roomInfo = s.roomDetail ? ` <em>(${s.roomDetail})</em>` : '';
                        return `<li><strong>${s.level === 'Autre' ? s.customLevel : s.level}</strong>${roomInfo} : ${s.photos.length} photos</li>`
                    }).join('')}</ul>
                        <p><em>(Rapport et photos en pièces jointes)</em></p>
                    `,
                    attachments: attachments
                })
            });

            const responseText = await response.text();
            let funcData = {};
            try { funcData = JSON.parse(responseText); } catch (e) { }

            if (!response.ok || (funcData && !funcData.success)) {
                throw new Error(funcData.error || responseText);
            }

            addLog(`[EMAIL CONFIRMED] Rapport journalier envoyé par ${userName}`);

            setShowSendReview(false);
            alert("Rapport et photos haute définition envoyés !");
            onClose();

        } catch (error) {
            console.error("Erreur:", error);
            alert(`Erreur: ${error.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">

            {/* FULL-SIZE PHOTO PREVIEW, BEFORE SENDING OR AFTER RETAKING */}
            {photoPreview && currentPreviewPhoto && (
                <div className="absolute inset-0 z-[90] flex flex-col bg-slate-950 text-white"
                    role="dialog" aria-modal="true" aria-label="Aperçu de la photo"
                    style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
                    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-700 bg-slate-900 p-3">
                        <div>
                            <h3 className="text-sm font-bold">Vérifier la netteté de la photo</h3>
                            <p className="text-xs text-slate-300">
                                {currentPreviewPhoto.width} × {currentPreviewPhoto.height} px · {humanFileSize(currentPreviewPhoto.blob.size)}
                            </p>
                        </div>
                        <button type="button" onClick={() => setPhotoPreview(null)}
                            className="min-h-11 min-w-11 rounded-lg border border-slate-600 inline-flex items-center justify-center"
                            aria-label="Fermer l’aperçu"><X size={20} /></button>
                    </div>
                    <div className="flex items-center justify-center gap-3 bg-slate-900/90 py-2">
                        <button type="button" onClick={() => setPhotoZoom(z => Math.max(1, z - 0.5))}
                            disabled={photoZoom <= 1} aria-label="Réduire le zoom"
                            className="min-w-11 min-h-11 rounded-lg border border-slate-600 disabled:opacity-40 flex items-center justify-center">
                            <ZoomOut size={19} />
                        </button>
                        <span className="text-sm tabular-nums" aria-live="polite">{Math.round(photoZoom * 100)} %</span>
                        <button type="button" onClick={() => setPhotoZoom(z => Math.min(3, z + 0.5))}
                            disabled={photoZoom >= 3} aria-label="Agrandir pour vérifier les détails"
                            className="min-w-11 min-h-11 rounded-lg border border-slate-600 disabled:opacity-40 flex items-center justify-center">
                            <ZoomIn size={19} />
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto bg-black p-2">
                        <img src={currentPreviewPhoto.previewUrl} alt="Photo complète du rapport à vérifier avant envoi"
                            className="block mx-auto object-contain"
                            style={{
                                width: photoZoom > 1 ? `${Math.round(photoZoom * 100)}%` : 'auto',
                                maxWidth: photoZoom > 1 ? 'none' : '100%',
                                maxHeight: photoZoom > 1 ? 'none' : '100%',
                            }} />
                    </div>
                    {photoResolutionWarning(currentPreviewPhoto.width, currentPreviewPhoto.height) && (
                        <p role="alert" className="flex gap-2 items-center px-3 py-2 text-xs text-amber-200">
                            <AlertTriangle size={16} />
                            {photoResolutionWarning(currentPreviewPhoto.width, currentPreviewPhoto.height)}
                        </p>
                    )}
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-700 p-3 bg-slate-900">
                        <label className="min-h-11 flex items-center justify-center rounded-lg border border-blue-600 px-3 text-sm text-blue-100 cursor-pointer">
                            <Camera size={17} className="mr-2" /> Reprendre
                            <input type="file" accept="image/*" capture="environment" className="sr-only"
                                disabled={preparingPhotos || isUploading}
                                onChange={e => {
                                    const file = e.target.files?.[0];
                                    e.target.value = '';
                                    void replacePreviewPhoto(file);
                                }} />
                        </label>
                        <button type="button"
                            onClick={() => removePhotoFromSection(photoPreview.sectionId, photoPreview.index)}
                            disabled={isUploading}
                            className="min-h-11 rounded-lg border border-red-700 px-3 text-sm text-red-200">
                            Supprimer
                        </button>
                        <button type="button" onClick={() => setPhotoPreview(null)}
                            className="min-h-11 rounded-lg bg-blue-600 px-4 font-semibold text-sm">
                            Photo vérifiée
                        </button>
                    </div>
                </div>
            )}

            {/* EXPLICIT PRE-SEND REVIEW, NO EMAIL BEFORE CONFIRMATION */}
            {showSendReview && (
                <div className="absolute inset-0 z-[70] flex flex-col bg-slate-950 text-white"
                    role="dialog" aria-modal="true" aria-label="Vérification du rapport avant envoi"
                    style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
                    <header className="flex shrink-0 justify-between items-center gap-3 border-b border-slate-700 p-4 bg-slate-900">
                        <div>
                            <h3 className="font-bold text-lg">Vérifier avant d’envoyer</h3>
                            <p className="text-xs text-slate-300">Touchez chaque image pour contrôler sa netteté et ses détails.</p>
                        </div>
                        <button type="button" onClick={() => setShowSendReview(false)} disabled={isUploading}
                            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg border border-slate-600"
                            aria-label="Retour au rapport"><X size={20} /></button>
                    </header>
                    <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
                        <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm space-y-1">
                            <p><strong>Chantier :</strong> {sites.find(site => String(site.id) === String(selectedSiteId))?.name}</p>
                            <p className="break-words"><strong>Destinataire :</strong> {sites.find(site => String(site.id) === String(selectedSiteId))?.email}</p>
                            <p><strong>Photos :</strong> {sections.reduce((sum, section) => sum + section.photos.length, 0)}</p>
                            <p className="text-xs text-slate-400">Les images en pièces jointes conservent leur résolution. Vérifiez leur lisibilité avant confirmation.</p>
                        </div>
                        {sections.map(section => section.photos.length > 0 && (
                            <div key={section.id} className="space-y-2">
                                <h4 className="text-sm font-semibold">{section.level === 'Autre' ? section.customLevel || 'Autre' : section.level}
                                    {section.roomDetail ? ' · ' + section.roomDetail : ''}</h4>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {section.photos.map((photo, index) => (
                                        <button type="button" key={photo.previewUrl}
                                            onClick={() => showPhoto(section.id, index)}
                                            className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-left min-h-11">
                                            <img src={photo.previewUrl} alt={`Photo ${index + 1}, ouvrir en grand`}
                                                className="w-full h-36 object-contain bg-black rounded" />
                                            <p className="text-xs mt-2">Photo {index + 1} · {photo.width} × {photo.height} px</p>
                                            {photoResolutionWarning(photo.width, photo.height) && (
                                                <p className="text-xs text-amber-200">Résolution faible — vérifier</p>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {photoError && <p role="alert" className="text-sm text-red-200">{photoError}</p>}
                    </div>
                    <footer className="shrink-0 grid grid-cols-2 gap-2 border-t border-slate-700 bg-slate-900 p-3">
                        <button type="button" onClick={() => setShowSendReview(false)}
                            disabled={isUploading} className="min-h-12 rounded-xl border border-slate-600 text-sm font-semibold">
                            Modifier
                        </button>
                        <button type="button" onClick={handleSend} disabled={isUploading || preparingPhotos}
                            className="min-h-12 rounded-xl bg-blue-600 text-white text-sm font-bold flex gap-2 items-center justify-center disabled:opacity-50">
                            <Send size={18} /> {isUploading ? `Envoi… ${uploadProgress}%` : 'Confirmer l’envoi'}
                        </button>
                    </footer>
                </div>
            )}

            {/* MAIN MODAL UI */}
            <div className="flex justify-between items-center p-4 bg-slate-900 border-b border-slate-800 text-white z-10">
                <h2 className="font-bold text-lg">Rapport Journalier</h2>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-800">
                    <X size={24} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-950 p-4 space-y-6">

                {/* Global Info */}
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-400 mb-2">Chantier <span className="text-red-500">*</span></label>
                        <select
                            className="w-full bg-slate-800 text-white p-3 rounded-lg border border-slate-700 outline-none"
                            value={selectedSiteId}
                            onChange={(e) => setSelectedSiteId(e.target.value)}
                        >
                            <option value="">-- Choisir un chantier --</option>
                            {sites.filter(s => s.status === 'active').map(site => (
                                <option key={site.id} value={site.id}>{site.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-400 mb-2">Note Générale</label>
                        <textarea
                            className="w-full bg-slate-800 text-white p-3 rounded-lg border border-slate-700 outline-none resize-none"
                            rows={2}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>
                </div>

                {/* Sections List */}
                {sections.map((section, index) => (
                    <div key={section.id} className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
                        <div className="bg-slate-800 p-3 flex justify-between items-center border-b border-slate-700">
                            <h3 className="font-bold text-white text-sm"><span className="bg-blue-600 px-2 py-0.5 rounded text-xs mr-2">ZONE {index + 1}</span></h3>
                            {sections.length > 1 && (
                                <button onClick={() => removeSection(section.id)} className="text-red-400 p-1"><Trash2 size={16} /></button>
                            )}
                        </div>

                        <div className="p-4 space-y-4">
                            {/* Level Select */}
                            <select
                                className="w-full bg-slate-950 text-white p-3 rounded-lg border border-slate-700 outline-none"
                                value={section.level}
                                onChange={(e) => updateSection(section.id, 'level', e.target.value)}
                            >
                                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>

                            {/* Room Detail Input */}
                            <input
                                type="text"
                                placeholder="Appart / Pièce (Optionnel)"
                                className="w-full bg-slate-950 text-white p-3 rounded-lg border border-slate-700 outline-none focus:border-blue-500 transition-colors"
                                value={section.roomDetail}
                                onChange={(e) => updateSection(section.id, 'roomDetail', e.target.value)}
                            />

                            {/* Custom Level Input */}
                            {section.level === 'Autre' && (
                                <input
                                    type="text"
                                    placeholder="Précisez le niveau..."
                                    className="w-full bg-slate-950 text-white p-3 rounded-lg border border-slate-700 outline-none mt-2 focus:border-blue-500 transition-colors"
                                    value={section.customLevel}
                                    onChange={(e) => updateSection(section.id, 'customLevel', e.target.value)}
                                />
                            )}

                            {/* Native camera stills retain full-resolution pixels. */}
                            <div className="grid grid-cols-3 gap-2">
                                {section.photos.map((photo, pIndex) => (
                                    <div key={photo.previewUrl} className="relative aspect-square rounded-lg overflow-hidden border border-slate-700 bg-black">
                                        <button type="button"
                                            onClick={() => showPhoto(section.id, pIndex)}
                                            className="w-full h-full focus-visible:outline-2 focus-visible:outline-blue-400"
                                            aria-label={`Agrandir la photo ${pIndex + 1}, ${photo.width} par ${photo.height} pixels`}>
                                            <img src={photo.previewUrl} className="w-full h-full object-contain"
                                                alt={`Photo ${pIndex + 1} du rapport`} />
                                        </button>
                                        <button type="button"
                                            onClick={() => removePhotoFromSection(section.id, pIndex)}
                                            disabled={isUploading}
                                            aria-label={`Supprimer la photo ${pIndex + 1}`}
                                            className="absolute top-0 right-0 min-w-10 min-h-10 inline-flex items-center justify-center bg-red-700 text-white rounded-bl shadow-md">
                                            <X size={18} />
                                        </button>
                                    </div>
                                ))}

                                <div className="aspect-square bg-slate-800 rounded-lg flex flex-col gap-1 overflow-hidden">
                                    {/* The native camera picker takes a true still image, not a video frame. */}
                                    <label className="flex-1 w-full flex flex-col items-center justify-center cursor-pointer hover:bg-slate-700 bg-slate-800/50">
                                        <Camera className="text-blue-300 mb-1" size={21} />
                                        <span className="text-[10px] text-blue-200 font-bold uppercase">Prendre photo</span>
                                        <input type="file" accept="image/*" capture="environment" className="sr-only"
                                            disabled={isUploading || preparingPhotos}
                                            onChange={e => {
                                                // FileList is live: copy before clearing the input so
                                                // iPhone Safari does not discard the newly taken photo.
                                                const files = Array.from(e.target.files || []);
                                                e.target.value = '';
                                                void addFilesToSection(section.id, files, true);
                                            }} />
                                    </label>
                                    <div className="h-px bg-slate-700 w-full"></div>
                                    <label className="flex-1 w-full flex flex-col items-center justify-center cursor-pointer hover:bg-slate-700 bg-slate-800/50">
                                        <ImageIcon className="text-slate-300 mb-1" size={20} />
                                        <span className="text-[10px] text-slate-300 font-bold uppercase">Galerie</span>
                                        <input type="file" accept="image/*" multiple className="sr-only"
                                            disabled={isUploading || preparingPhotos}
                                            onChange={e => {
                                                // FileList is live: copy before clearing the input so
                                                // iPhone Safari does not discard the newly taken photo.
                                                const files = Array.from(e.target.files || []);
                                                e.target.value = '';
                                                void addFilesToSection(section.id, files);
                                            }} />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {photoError && <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-100">
                    <AlertTriangle size={18} className="shrink-0" /> {photoError}
                </p>}
                {preparingPhotos && <p role="status" className="text-sm text-blue-200">Préparation des photos en haute définition…</p>}
                <button type="button" onClick={addSection} disabled={isUploading || preparingPhotos}
                    className="w-full min-h-11 py-4 border-2 border-dashed border-slate-700 rounded-xl flex items-center justify-center gap-2 text-slate-400 hover:text-white disabled:opacity-50">
                    <Plus size={20} /><span className="font-bold">Ajouter un niveau</span>
                </button>
                <div className="h-24"></div>
            </div>

            <div className="absolute bottom-0 w-full bg-slate-900 border-t border-slate-800 p-4 z-20">
                <button
                    onClick={openSendReview}
                    disabled={isUploading || preparingPhotos}
                    className="w-full min-h-12 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-base font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2"
                >
                    <CheckCircle2 size={22} />
                    <span>Vérifier les photos et envoyer</span>
                </button>
            </div>
        </div>
    );
};

export default DailyReportModal;
