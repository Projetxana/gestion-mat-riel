import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, Send, Trash2, Plus, Image as ImageIcon, RotateCcw } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../context/AppContext';

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

    // Camera State
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [cameraSectionId, setCameraSectionId] = useState(null);
    const [stream, setStream] = useState(null);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);

    // --- CAMERA LOGIC ---
    useEffect(() => {
        if (isCameraOpen) {
            startCamera();
        } else {
            stopCamera();
        }
        return () => stopCamera();
    }, [isCameraOpen]);

    const startCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: false
            });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (err) {
            console.error("Camera Error:", err);
            alert("Impossible d'accéder à la caméra. Vérifiez les permissions.");
            setIsCameraOpen(false);
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    const takePhoto = () => {
        if (videoRef.current && canvasRef.current && cameraSectionId) {
            const video = videoRef.current;
            const canvas = canvasRef.current;

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0);

            canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                addPhotoToSection(cameraSectionId, { blob, previewUrl: url });
            }, 'image/jpeg', 0.8);
        }
    };

    const openCamera = (sectionId) => {
        setCameraSectionId(sectionId);
        setIsCameraOpen(true);
    };

    const closeCamera = () => {
        setIsCameraOpen(false);
        setCameraSectionId(null);
    };


    // --- SECTIONS LOGIC ---
    const addSection = () => {
        setSections(prev => [
            ...prev,
            { id: Date.now(), level: 'Rez-de-chaussée', customLevel: '', roomDetail: '', photos: [] }
        ]);
    };

    const removeSection = (sectionId) => {
        if (sections.length === 1) return;
        setSections(prev => prev.filter(s => s.id !== sectionId));
    };

    const updateSection = (sectionId, field, value) => {
        setSections(prev => prev.map(s => s.id === sectionId ? { ...s, [field]: value } : s));
    };

    const addPhotoToSection = (sectionId, photoObj) => {
        setSections(prev => prev.map(s =>
            s.id === sectionId ? { ...s, photos: [...s.photos, photoObj] } : s
        ));
    };

    const addFilesToSection = (sectionId, fileList) => {
        if (!fileList || fileList.length === 0) return;
        const newPhotos = Array.from(fileList).map(file => ({
            blob: file, // Treating File as Blob
            previewUrl: URL.createObjectURL(file)
        }));
        setSections(prev => prev.map(s =>
            s.id === sectionId ? { ...s, photos: [...s.photos, ...newPhotos] } : s
        ));
    };

    const removePhotoFromSection = (sectionId, photoIndex) => {
        setSections(prev => prev.map(s => {
            if (s.id !== sectionId) return s;
            const updatedPhotos = [...s.photos];
            URL.revokeObjectURL(updatedPhotos[photoIndex].previewUrl); // Cleanup
            updatedPhotos.splice(photoIndex, 1);
            return { ...s, photos: updatedPhotos };
        }));
    };

    // Cleanup URLs on unmount
    useEffect(() => {
        return () => {
            sections.forEach(s => s.photos.forEach(p => URL.revokeObjectURL(p.previewUrl)));
        };
    }, []);

    // --- REPORT GENERATION ---
    const generateReportImage = async (siteName, userName, date, textNotes) => {
        const width = 800;
        let height = 600 + (sections.length * 40);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

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
        ctx.fillText("Généré par Antigravity", width / 2, height - 20);

        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Erreur génération image"));
            }, 'image/jpeg', 0.8);
        });
    };

    const handleSend = async () => {
        if (!selectedSiteId) {
            alert("Veuillez sélectionner un chantier.");
            return;
        }

        const totalPhotos = sections.reduce((acc, s) => acc + s.photos.length, 0);
        if (totalPhotos === 0) {
            alert("Veuillez ajouter au moins une photo.");
            return;
        }

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

            // 1. Doc Image
            const docBlob = await generateReportImage(siteName, userName, dateStr, notes);
            const docFileName = `Rapport_${dateStr.replace(/\//g, '-')}_${siteName.replace(/\s+/g, '_')}.jpg`;

            const { error: docError } = await supabase.storage
                .from('delivery-notes')
                .upload(docFileName, docBlob);
            if (docError) throw docError;

            const { data: docUrlData } = supabase.storage
                .from('delivery-notes')
                .getPublicUrl(docFileName);

            const attachments = [
                { filename: docFileName, path: docUrlData.publicUrl }
            ];

            // 2. Photos
            let processedCount = 0;
            for (const section of sections) {
                const levelName = (section.level === 'Autre' ? (section.customLevel || 'Autre') : section.level)
                    .replace(/\s+/g, '_')
                    .replace(/[^a-zA-Z0-9_]/g, '');

                for (let i = 0; i < section.photos.length; i++) {
                    const { blob } = section.photos[i];
                    const fileName = `${levelName}_${i + 1}_${timestamp}_${processedCount}.jpg`;

                    const { error } = await supabase.storage
                        .from('delivery-notes')
                        .upload(fileName, blob);
                    if (error) throw error;

                    const { data: publicData } = supabase.storage
                        .from('delivery-notes')
                        .getPublicUrl(fileName);

                    attachments.push({
                        filename: `${levelName}_Photo_${i + 1}.jpg`,
                        path: publicData.publicUrl
                    });

                    processedCount++;
                    setUploadProgress(Math.round((processedCount / totalPhotos) * 100));
                }
            }

            // 3. Email
            addLog(`Envoi rapport multi-zone à ${recipientEmail}`);
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

            alert("Rapport envoyé !");
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

            {/* CAMERA OVERLAY */}
            {isCameraOpen && (
                <div className="absolute inset-0 z-50 bg-black flex flex-col">
                    <div className="flex-1 relative">
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                        <canvas ref={canvasRef} className="hidden" />
                        {/* Live Thumbnails Overlay */}
                        <div className="absolute bottom-4 left-4 right-4 h-20 flex gap-2 overflow-x-auto">
                            {sections.find(s => s.id === cameraSectionId)?.photos.slice(-5).map((p, idx) => (
                                <img key={idx} src={p.previewUrl} className="h-full rounded border-2 border-white" alt="" />
                            ))}
                        </div>
                    </div>
                    <div className="h-32 bg-slate-900 flex items-center justify-around p-4">
                        <button onClick={closeCamera} className="bg-slate-800 text-white p-4 rounded-full">
                            <RotateCcw size={24} />
                        </button>
                        <button onClick={takePhoto} className="w-20 h-20 rounded-full border-4 border-white bg-slate-800 flex items-center justify-center active:scale-95 transition-transform">
                            <div className="w-16 h-16 rounded-full bg-white"></div>
                        </button>
                        <div className="w-14"></div> {/* Spacer */}
                    </div>
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

                            {/* Photos Grid */}
                            <div className="grid grid-cols-3 gap-2">
                                {section.photos.map((photo, pIndex) => (
                                    <div key={pIndex} className="relative aspect-square rounded-lg overflow-hidden border border-slate-700">
                                        <img src={photo.previewUrl} className="w-full h-full object-cover" alt="" />
                                        <button
                                            onClick={() => removePhotoFromSection(section.id, pIndex)}
                                            className="absolute top-0 right-0 bg-red-500 text-white p-1 rounded-bl shadow-md"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}

                                {/* Add Button Group */}
                                <div className="aspect-square bg-slate-800 rounded-lg flex flex-col gap-1 overflow-hidden">
                                    {/* Camera Button */}
                                    <button
                                        onClick={() => openCamera(section.id)}
                                        className="flex-1 w-full flex flex-col items-center justify-center hover:bg-slate-700 transition-colors bg-slate-800/50"
                                    >
                                        <Camera className="text-blue-400 mb-1" size={20} />
                                        <span className="text-[9px] text-blue-400 font-bold uppercase">Caméra</span>
                                    </button>
                                    <div className="h-[1px] bg-slate-700 w-full"></div>
                                    {/* Gallery Button */}
                                    <label className="flex-1 w-full flex flex-col items-center justify-center cursor-pointer hover:bg-slate-700 transition-colors bg-slate-800/50">
                                        <ImageIcon className="text-slate-400 mb-1" size={20} />
                                        <span className="text-[9px] text-slate-400 font-bold uppercase">Galerie</span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className="hidden"
                                            onChange={(e) => addFilesToSection(section.id, e.target.files)}
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                <button onClick={addSection} className="w-full py-4 border-2 border-dashed border-slate-700 rounded-xl flex items-center justify-center gap-2 text-slate-400 hover:text-white">
                    <Plus size={20} /><span className="font-bold">Ajouter un niveau</span>
                </button>
                <div className="h-24"></div>
            </div>

            <div className="absolute bottom-0 w-full bg-slate-900 border-t border-slate-800 p-4 z-20">
                <button
                    onClick={handleSend}
                    disabled={isUploading}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white text-lg font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2"
                >
                    {isUploading ? <span>Envoi... {uploadProgress}%</span> : <> <Send size={24} /> <span>Envoyer</span> </>}
                </button>
            </div>
        </div>
    );
};

export default DailyReportModal;
