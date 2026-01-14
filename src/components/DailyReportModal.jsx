import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, Send, Trash2, RotateCcw, FileText } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../context/AppContext';

const DailyReportModal = ({ onClose }) => {
    const { addLog, currentUser, sites } = useAppContext();
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [photos, setPhotos] = useState([]); // Array of { blob, url }
    const [notes, setNotes] = useState('');
    const [selectedSiteId, setSelectedSiteId] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [step, setStep] = useState('capture'); // 'capture' | 'review'

    // Initialize Camera
    useEffect(() => {
        startCamera();
        return () => {
            stopCamera();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const startCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }, // Use back camera on mobile
                audio: false
            });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (err) {
            console.error("Error accessing camera:", err);
            alert("Impossible d'accéder à la caméra. Vérifiez les permissions.");
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    const takePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;

            // Set canvas dimensions to match video
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            // Draw current frame
            const context = canvas.getContext('2d');
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Get blob
            canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                setPhotos(prev => [...prev, { blob, url }]);
            }, 'image/jpeg', 0.8);
        }
    };

    const deletePhoto = (index) => {
        setPhotos(prev => {
            const newPhotos = [...prev];
            URL.revokeObjectURL(newPhotos[index].url); // Cleanup memory
            newPhotos.splice(index, 1);
            return newPhotos;
        });
    };

    // Helper: Generate an image from the text notes
    const generateReportImage = async (siteName, userName, date, textNotes) => {
        const width = 800;
        const height = 1200;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // Header Blue Bar
        ctx.fillStyle = '#1e3a8a'; // Blue-900
        ctx.fillRect(0, 0, width, 150);

        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 40px Arial';
        ctx.fillText("RAPPORT JOURNALIER", 50, 90);

        // Meta Info Container
        ctx.fillStyle = '#f1f5f9'; // Slate-100
        ctx.fillRect(50, 180, 700, 120);

        // Meta Text
        ctx.fillStyle = '#0f172a'; // Slate-900
        ctx.font = 'bold 24px Arial';
        ctx.fillText(`CHANTIER: ${siteName}`, 80, 230);
        ctx.font = '24px Arial';
        ctx.fillText(`Technicien: ${userName}`, 80, 270);
        ctx.textAlign = 'right';
        ctx.fillText(`Date: ${date}`, 720, 230);
        ctx.textAlign = 'left';

        // Notes Section
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 28px Arial';
        ctx.fillText("ÉVÉNEMENT / NOTES:", 50, 360);

        // Wrap Text Logic
        ctx.font = '24px Arial';
        const maxWidth = 700;
        const lineHeight = 36;
        const x = 50;
        let y = 410;

        if (!textNotes) {
            ctx.fillStyle = '#94a3b8'; // Slate-400
            ctx.fillText("(Aucune note particulière)", x, y);
        } else {
            ctx.fillStyle = '#334155'; // Slate-700
            const words = textNotes.split(' ');
            let line = '';

            for (let n = 0; n < words.length; n++) {
                const testLine = line + words[n] + ' ';
                const metrics = ctx.measureText(testLine);
                const testWidth = metrics.width;
                if (testWidth > maxWidth && n > 0) {
                    ctx.fillText(line, x, y);
                    line = words[n] + ' ';
                    y += lineHeight;
                } else {
                    line = testLine;
                }
            }
            ctx.fillText(line, x, y);
        }

        // Footer
        ctx.fillStyle = '#64748b'; // Slate-500
        ctx.font = 'italic 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText("Généré automatiquement par l'application Gestion Matériel", width / 2, height - 30);

        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error("Impossible de générer l'image du rapport."));
                }
            }, 'image/jpeg', 0.8);
        });
    };

    const handleSend = async () => {
        if (!selectedSiteId) {
            alert("Veuillez sélectionner un chantier.");
            return;
        }
        if (photos.length === 0) return;
        setIsUploading(true);
        setUploadProgress(0);

        try {
            const uploadedUrls = [];
            const timestamp = Date.now();
            let successCount = 0;

            const selectedSite = sites.find(s => String(s.id) === String(selectedSiteId));

            if (!selectedSite || !selectedSite.email) {
                alert("Ce chantier n'a pas d'adresse email configurée. Impossible d'envoyer le rapport.");
                setIsUploading(false);
                return;
            }

            const siteName = selectedSite.name;
            const recipientEmail = selectedSite.email;
            const dateStr = new Date().toLocaleDateString('fr-FR');
            const userName = currentUser?.name || 'Technicien';

            // 1. Generate Document Image from Notes
            const docBlob = await generateReportImage(siteName, userName, dateStr, notes);
            const docFileName = `daily_report_doc_${currentUser?.id || 'anon'}_${timestamp}.jpg`;

            // Upload Document
            const { error: docError } = await supabase.storage
                .from('delivery-notes')
                .upload(docFileName, docBlob);

            if (docError) throw docError;

            const { data: docUrlData } = supabase.storage
                .from('delivery-notes')
                .getPublicUrl(docFileName);

            const docUrl = docUrlData.publicUrl;


            // 2. Upload Photos
            // Reusing 'delivery-notes' bucket to avoid permission issues, 
            // but prefixing appropriately.
            // Ideally we'd use a separate bucket, but this ensures it works NOW.
            for (let i = 0; i < photos.length; i++) {
                const { blob } = photos[i];
                const fileName = `daily_report_${currentUser?.id || 'anon'}_${timestamp}_${i + 1}.jpg`;

                const { data, error } = await supabase.storage
                    .from('delivery-notes')
                    .upload(fileName, blob);

                if (error) throw error;

                const { data: publicUrlData } = supabase.storage
                    .from('delivery-notes')
                    .getPublicUrl(fileName);

                uploadedUrls.push(publicUrlData.publicUrl);
                successCount++;
                setUploadProgress(Math.round((successCount / photos.length) * 100));
            }

            // 3. Prepare Attachments for Edge Function
            const attachments = [];

            // Add Document Image
            attachments.push({
                filename: `Rapport_${dateStr.replace(/\//g, '-')}_${siteName.replace(/\s+/g, '_')}.jpg`,
                path: docUrl
            });

            // Add Photos
            uploadedUrls.forEach((url, i) => {
                attachments.push({
                    filename: `Photo_${i + 1}.jpg`,
                    path: url
                });
            });

            // 4. Send Email via Edge Function
            addLog(`Invoking send-email function for ${recipientEmail}`);

            const { data: funcData, error: funcError } = await supabase.functions.invoke('send-email', {
                body: {
                    recipient: recipientEmail,
                    subject: `Rapport Journalier - ${siteName} - ${dateStr} - ${userName}`,
                    html: `
                        <p>Bonjour,</p>
                        <p>Voici le rapport journalier pour le chantier <strong>${siteName}</strong>.</p>
                        <p><strong>Technicien :</strong> ${userName}</p>
                        <p><strong>Date :</strong> ${dateStr}</p>
                        <p>Vous trouverez le rapport officiel et les photos en pièces jointes.</p>
                        <br/>
                        <p><em>Généré par Antigravity</em></p>
                    `,
                    attachments: attachments
                }
            });

            if (funcError) throw funcError;
            if (funcData && funcData.error) throw new Error(funcData.error);

            alert("Rapport envoyé avec succès ! (Pièces jointes incluses)");
            onClose();

        } catch (error) {
            console.error("Upload error:", error);
            alert(`Erreur détaillée : ${error.message || error}`);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center p-4 bg-slate-900/50 backdrop-blur absolute top-0 w-full z-10 text-white">
                <h2 className="font-bold text-lg">Rapport Journalier</h2>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-white/20 transition-colors">
                    <X size={24} />
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col items-center justify-center bg-black overflow-hidden relative">
                {step === 'capture' ? (
                    <>
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-cover"
                        />
                        <canvas ref={canvasRef} className="hidden" />

                        {!stream && <p className="text-white">Démarrage de la caméra...</p>}

                        {/* Thumbnails Overlay */}
                        {photos.length > 0 && (
                            <div className="absolute bottom-24 left-0 right-0 h-20 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-center gap-3 p-2 overflow-x-auto z-20">
                                {photos.map((photo, index) => (
                                    <div key={index} className="relative flex-shrink-0">
                                        <img
                                            src={photo.url}
                                            alt={`Capture ${index}`}
                                            className="h-14 w-14 object-cover rounded-lg border border-slate-600"
                                        />
                                        <button
                                            onClick={() => deletePhoto(index)}
                                            className="absolute -top-2 -right-2 bg-red-500 text-white p-0.5 rounded-full shadow-md"
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="w-full h-full bg-slate-900 p-6 pt-20 flex flex-col animate-in slide-in-from-right">
                        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                            <FileText className="text-blue-400" />
                            Ajouter une note (Optionnel)
                        </h3>

                        {/* Site Selector */}
                        <div className="mb-6">
                            <label className="block text-sm font-bold text-slate-400 mb-2">Chantier concerné <span className="text-red-500">*</span></label>
                            <select
                                className="w-full bg-slate-800 text-white p-4 rounded-xl border border-slate-700 outline-none focus:border-blue-500"
                                value={selectedSiteId}
                                onChange={(e) => setSelectedSiteId(e.target.value)}
                            >
                                <option value="">-- Sélectionner un chantier --</option>
                                {sites.filter(s => s.status === 'active').map(site => (
                                    <option key={site.id} value={site.id}>{site.name}</option>
                                ))}
                            </select>
                        </div>

                        <textarea
                            className="w-full flex-1 bg-slate-800 text-white p-4 rounded-xl border border-slate-700 outline-none focus:border-blue-500 resize-none mb-4"
                            placeholder="Décrivez un évènement particulier de la journée..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                            <h4 className="text-slate-400 text-sm mb-2 font-bold uppercase">Photos jointes ({photos.length})</h4>
                            <div className="flex gap-2 overflow-x-auto pb-2">
                                {photos.map((photo, index) => (
                                    <img key={index} src={photo.url} className="h-16 w-16 object-cover rounded-lg" alt="" />
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="h-24 bg-slate-950 p-4 flex items-center justify-between gap-8 z-30">
                {step === 'capture' ? (
                    <>
                        <button
                            onClick={() => {
                                if (photos.length > 0) setStep('review');
                            }}
                            disabled={photos.length === 0}
                            className={`flex flex-col items-center gap-1 min-w-[60px] ${photos.length === 0 ? 'text-slate-600' : 'text-blue-400'}`}
                        >
                            <span className="text-xs font-bold">Suivant</span>
                        </button>

                        <button
                            onClick={takePhoto}
                            className="w-16 h-16 rounded-full border-4 border-white bg-slate-800 flex items-center justify-center hover:bg-slate-700 active:scale-95 transition-all shadow-lg shadow-white/10"
                        >
                            <div className="w-12 h-12 rounded-full bg-white"></div>
                        </button>

                        <div className="w-[60px]"></div>
                    </>
                ) : (
                    <>
                        <button
                            onClick={() => setStep('capture')}
                            className="text-slate-400 hover:text-white flex flex-col items-center gap-1 min-w-[60px]"
                        >
                            <RotateCcw size={24} />
                            <span className="text-xs">Retour</span>
                        </button>

                        <button
                            onClick={handleSend}
                            disabled={isUploading}
                            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-full font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                        >
                            {isUploading ? (
                                <>
                                    <RotateCcw className="animate-spin" />
                                    <span>Envoi... {uploadProgress}%</span>
                                </>
                            ) : (
                                <>
                                    <Send size={20} />
                                    <span>Envoyer le rapport</span>
                                </>
                            )}
                        </button>

                        <div className="w-[10px]"></div>
                    </>
                )}
            </div>
        </div>
    );
};

export default DailyReportModal;
