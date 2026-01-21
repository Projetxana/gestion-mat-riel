import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, Send, Trash2, Plus, Image as ImageIcon } from 'lucide-react';
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

    // Sections State: Array of { id, level, customLevel, photos: [{file, previewUrl}] }
    const [sections, setSections] = useState([
        { id: Date.now(), level: 'Rez-de-chaussée', customLevel: '', photos: [] }
    ]);

    // Helpers to manage sections
    const addSection = () => {
        setSections(prev => [
            ...prev,
            { id: Date.now(), level: 'Rez-de-chaussée', customLevel: '', photos: [] }
        ]);
    };

    const removeSection = (sectionId) => {
        if (sections.length === 1) return; // Prevent deleting last section
        setSections(prev => prev.filter(s => s.id !== sectionId));
    };

    const updateSection = (sectionId, field, value) => {
        setSections(prev => prev.map(s => s.id === sectionId ? { ...s, [field]: value } : s));
    };

    const addPhotosToSection = (sectionId, fileList) => {
        if (!fileList || fileList.length === 0) return;

        const newPhotos = Array.from(fileList).map(file => ({
            file,
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
            URL.revokeObjectURL(updatedPhotos[photoIndex].previewUrl);
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
        // Calculate dynamic height based on content
        let height = 600;

        // 1. Estimate Height (Roughly)
        // Header (150) + Meta (120) + Notes (min 100) + Footer (50)
        // + Sections List
        height += (sections.length * 40);

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

        // Zones Summary
        let y = 350;
        ctx.font = 'bold 24px Arial';
        ctx.fillText("ZONES INSPECTÉES :", 50, y);
        y += 40;
        ctx.font = '20px Arial';
        ctx.fillStyle = '#334155';

        sections.forEach(s => {
            const levelName = s.level === 'Autre' ? (s.customLevel || 'Autre') : s.level;
            const count = s.photos.length;
            ctx.fillText(`• ${levelName} (${count} photos)`, 70, y);
            y += 30;
        });

        // Notes Section
        y += 40;
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 28px Arial';
        ctx.fillText("ÉVÉNEMENT / NOTES:", 50, y);
        y += 40;

        // Wrap Text Logic
        ctx.font = '24px Arial';
        const maxWidth = 700;
        const lineHeight = 36;
        const x = 50;

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
        ctx.font = 'italic 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText("Généré automatiquement par l'application Gestion Matériel", width / 2, height - 20);

        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Impossible de générer l'image du rapport."));
            }, 'image/jpeg', 0.8);
        });
    };

    const handleSend = async () => {
        if (!selectedSiteId) {
            alert("Veuillez sélectionner un chantier.");
            return;
        }

        // Count total photos
        const totalPhotos = sections.reduce((acc, s) => acc + s.photos.length, 0);
        if (totalPhotos === 0) {
            alert("Veuillez ajouter au moins une photo.");
            return;
        }

        setIsUploading(true);
        setUploadProgress(0);

        try {
            const selectedSite = sites.find(s => String(s.id) === String(selectedSiteId));
            if (!selectedSite?.email) throw new Error("Ce chantier n'a pas d'email configuré.");

            const siteName = selectedSite.name;
            const recipientEmail = selectedSite.email;
            const dateStr = new Date().toLocaleDateString('fr-FR');
            const userName = currentUser?.name || 'Technicien';
            const timestamp = Date.now();

            // 1. Generate Report Document
            const docBlob = await generateReportImage(siteName, userName, dateStr, notes);
            const docFileName = `Rapport_${dateStr.replace(/\//g, '-')}_${siteName.replace(/\s+/g, '_')}.jpg`;

            // Upload Document
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

            // 2. Upload Photos (Iterate Sections)
            let processedCount = 0;

            for (const section of sections) {
                const levelName = (section.level === 'Autre' ? (section.customLevel || 'Autre') : section.level)
                    .replace(/\s+/g, '_')
                    .replace(/[^a-zA-Z0-9_]/g, ''); // Sanitize

                for (let i = 0; i < section.photos.length; i++) {
                    const { file } = section.photos[i];
                    // Name format: Level_Index.jpg (e.g., RDC_1.jpg)
                    const fileName = `${levelName}_${i + 1}_${timestamp}_${processedCount}.jpg`;

                    const { error } = await supabase.storage
                        .from('delivery-notes')
                        .upload(fileName, file);

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

            // 3. Send Email
            addLog(`Sending Multi-Level Report to ${recipientEmail}`);

            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
            const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`;

            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    recipient: recipientEmail,
                    subject: `Rapport Journalier - ${siteName} - ${dateStr}`,
                    html: `
                        <h2>Rapport Journalier du ${dateStr}</h2>
                        <p><strong>Chantier :</strong> ${siteName}</p>
                        <p><strong>Technicien :</strong> ${userName}</p>
                        <hr/>
                        <h3>Résumé des zones :</h3>
                        <ul>
                            ${sections.map(s => `<li><strong>${s.level === 'Autre' ? s.customLevel : s.level}</strong> : ${s.photos.length} photos</li>`).join('')}
                        </ul>
                        <p><em>(Voir rapport officiel et photos en pièces jointes)</em></p>
                    `,
                    attachments: attachments
                })
            });

            const responseText = await response.text();
            let funcData;
            try { funcData = JSON.parse(responseText); } catch (e) { funcData = {}; }

            if (!response.ok || (funcData && !funcData.success)) {
                throw new Error(funcData.error || `Erreur serveur: ${responseText}`);
            }

            alert("Rapport envoyé avec succès !");
            onClose();

        } catch (error) {
            console.error("Report Error:", error);
            alert(`Erreur: ${error.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center p-4 bg-slate-900 border-b border-slate-800 text-white z-10">
                <h2 className="font-bold text-lg">Rapport Journalier</h2>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-800 transition-colors">
                    <X size={24} />
                </button>
            </div>

            {/* Content Scrollable */}
            <div className="flex-1 overflow-y-auto bg-slate-950 p-4 space-y-6">

                {/* 1. Global Info */}
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-400 mb-2">Chantier <span className="text-red-500">*</span></label>
                        <select
                            className="w-full bg-slate-800 text-white p-3 rounded-lg border border-slate-700 focus:border-blue-500 outline-none"
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
                        <label className="block text-sm font-bold text-slate-400 mb-2">Note Générale / Évènement</label>
                        <textarea
                            className="w-full bg-slate-800 text-white p-3 rounded-lg border border-slate-700 focus:border-blue-500 outline-none resize-none"
                            placeholder="RAS, Inspection terminée..."
                            rows={2}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>
                </div>

                {/* 2. Sections List */}
                {sections.map((section, index) => (
                    <div key={section.id} className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
                        {/* Section Header */}
                        <div className="bg-slate-800 p-3 flex justify-between items-center border-b border-slate-700">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                <span className="bg-blue-600 text-xs px-2 py-1 rounded-full">Zone {index + 1}</span>
                            </h3>
                            {sections.length > 1 && (
                                <button onClick={() => removeSection(section.id)} className="text-red-400 p-1 hover:bg-red-500/10 rounded">
                                    <Trash2 size={18} />
                                </button>
                            )}
                        </div>

                        <div className="p-4 space-y-4">
                            {/* Level Selector */}
                            <div>
                                <label className="block text-xs uppercase text-slate-500 font-bold mb-1">Niveau / Emplacement</label>
                                <select
                                    className="w-full bg-slate-950 text-white p-3 rounded-lg border border-slate-700 outline-none focus:border-blue-500"
                                    value={section.level}
                                    onChange={(e) => updateSection(section.id, 'level', e.target.value)}
                                >
                                    {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                            </div>

                            {/* Custom Level Input */}
                            {section.level === 'Autre' && (
                                <div className="animate-in fade-in">
                                    <input
                                        type="text"
                                        placeholder="Précisez l'emplacement (ex: Toiture)"
                                        className="w-full bg-slate-950 text-white p-3 rounded-lg border border-slate-700 focus:border-blue-500 outline-none"
                                        value={section.customLevel}
                                        onChange={(e) => updateSection(section.id, 'customLevel', e.target.value)}
                                    />
                                </div>
                            )}

                            {/* Photos Grid */}
                            <div>
                                <div className="flex justify-between items-end mb-2">
                                    <span className="text-xs uppercase text-slate-500 font-bold">Photos ({section.photos.length})</span>
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                    {section.photos.map((photo, pIndex) => (
                                        <div key={pIndex} className="relative aspect-square rounded-lg overflow-hidden border border-slate-700 group">
                                            <img src={photo.previewUrl} className="w-full h-full object-cover" alt="" />
                                            <button
                                                onClick={() => removePhotoFromSection(section.id, pIndex)}
                                                className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full shadow-lg opacity-80 hover:opacity-100"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}

                                    {/* Add Photo Button (Native Input) */}
                                    <label className="aspect-square bg-slate-800 border-2 border-dashed border-slate-700 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-slate-700 hover:border-blue-500 transition-colors">
                                        <Camera className="text-slate-400 mb-1" size={24} />
                                        <span className="text-[10px] text-slate-400 font-bold">AJOUTER</span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            capture="environment" // Native camera trigger
                                            className="hidden"
                                            onChange={(e) => addPhotosToSection(section.id, e.target.files)}
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {/* Add Section Button */}
                <button
                    onClick={addSection}
                    className="w-full py-4 border-2 border-dashed border-slate-700 rounded-xl flex items-center justify-center gap-2 text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-900 transition-all"
                >
                    <Plus size={20} />
                    <span className="font-bold">Ajouter un autre niveau</span>
                </button>

                {/* Spacer for bottom bar */}
                <div className="h-24"></div>
            </div>

            {/* Bottom Action Bar */}
            <div className="absolute bottom-0 w-full bg-slate-900 border-t border-slate-800 p-4 z-20">
                <button
                    onClick={handleSend}
                    disabled={isUploading}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-lg font-bold py-4 rounded-xl shadow-lg shadow-blue-900/20 flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
                >
                    {isUploading ? (
                        <>
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                            <span>Envoi en cours ({uploadProgress}%)</span>
                        </>
                    ) : (
                        <>
                            <Send size={24} />
                            <span>Envoyer le Rapport</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default DailyReportModal;
