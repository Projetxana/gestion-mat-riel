import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, Send, Trash2, RotateCcw, Check } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../context/AppContext';

const DeliveryNoteModal = ({ onClose }) => {
    const { addLog, currentUser } = useAppContext();
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [photos, setPhotos] = useState([]); // Array of { blob, url }
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

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

    const handleSend = async () => {
        if (photos.length === 0) return;
        setIsUploading(true);
        setUploadProgress(0);

        try {
            const uploadedAttachments = [];
            const timestamp = Date.now();
            let successCount = 0;
            const userName = currentUser?.name || 'Utilisateur';

            for (let i = 0; i < photos.length; i++) {
                const { blob } = photos[i];
                const fileName = `delivery_${timestamp}_${i + 1}.jpg`;

                const { data, error } = await supabase.storage
                    .from('delivery-notes')
                    .upload(fileName, blob);

                if (error) throw error;

                const { data: publicUrlData } = supabase.storage
                    .from('delivery-notes')
                    .getPublicUrl(fileName);

                uploadedAttachments.push({
                    filename: fileName,
                    path: publicUrlData.publicUrl
                });

                successCount++;
                setUploadProgress(Math.round((successCount / photos.length) * 100));
            }

            addLog(`Envoi bon de livraison par ${userName}`);

            // Send Email via Edge Function
            const recipientEmail = "materiaux@cd.atoomerp.com";
            const dateStr = new Date().toLocaleDateString('fr-FR');

            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    recipient: recipientEmail,
                    subject: `Bon de Livraison - ${userName} - ${dateStr}`,
                    html: `
                        <h2>Nouveau Bon de Livraison</h2>
                        <p><strong>Envoyé par :</strong> ${userName}</p>
                        <p><strong>Date :</strong> ${dateStr}</p>
                        <p><strong>Nombre de photos :</strong> ${photos.length}</p>
                        <br/>
                        <p><em>Photos en pièces jointes.</em></p>
                    `,
                    attachments: uploadedAttachments
                })
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || "Erreur inconnue lors de l'envoi");
            }

            alert("Bon de livraison envoyé avec succès !");
            onClose();

        } catch (error) {
            console.error("Upload/Email error:", error);
            alert(`Erreur lors de l'envoi : ${error.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center p-4 bg-slate-900/50 backdrop-blur absolute top-0 w-full z-10 text-white">
                <h2 className="font-bold text-lg">Scanner Bon de Livraison</h2>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-white/20 transition-colors">
                    <X size={24} />
                </button>
            </div>

            {/* Video Feed */}
            <div className="flex-1 flex items-center justify-center bg-black overflow-hidden relative">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Guide Overlay */}
                <div className="absolute inset-0 border-2 border-white/30 pointer-events-none m-8 rounded-lg">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-amber-500 rounded-tl-lg"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-amber-500 rounded-tr-lg"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-amber-500 rounded-bl-lg"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-amber-500 rounded-br-lg"></div>
                </div>

                {!stream && <p className="text-white">Démarrage de la caméra...</p>}
            </div>

            {/* Thumbnails Strip */}
            {photos.length > 0 && (
                <div className="h-24 bg-slate-900/80 backdrop-blur flex items-center gap-3 p-3 overflow-x-auto">
                    {photos.map((photo, index) => (
                        <div key={index} className="relative flex-shrink-0 group">
                            <img
                                src={photo.url}
                                alt={`Capture ${index}`}
                                className="h-16 w-16 object-cover rounded-lg border border-slate-600"
                            />
                            <button
                                onClick={() => deletePhoto(index)}
                                className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-md hover:bg-red-600 transition-colors"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Controls */}
            <div className="h-24 bg-slate-950 p-4 flex items-center justify-between gap-8">
                {/* Send Button */}
                <button
                    onClick={handleSend}
                    disabled={photos.length === 0 || isUploading}
                    className={`flex flex-col items-center gap-1 min-w-[60px] ${photos.length === 0 ? 'text-slate-600' : 'text-green-500 hover:text-green-400'}`}
                >
                    {isUploading ? (
                        <RotateCcw className="animate-spin" size={28} />
                    ) : (
                        <div className="relative">
                            <Send size={28} />
                            {photos.length > 0 && (
                                <span className="absolute -top-2 -right-2 bg-green-500 text-slate-950 text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full">
                                    {photos.length}
                                </span>
                            )}
                        </div>
                    )}
                    <span className="text-xs font-medium">{isUploading ? `${uploadProgress}%` : 'Envoyer'}</span>
                </button>

                {/* Shutter Button */}
                <button
                    onClick={takePhoto}
                    className="w-16 h-16 rounded-full border-4 border-white bg-slate-800 flex items-center justify-center hover:bg-slate-700 active:scale-95 transition-all shadow-lg shadow-white/10"
                >
                    <div className="w-12 h-12 rounded-full bg-white"></div>
                </button>

                {/* Spacer/Placeholder for symmetry or other action */}
                <div className="w-[60px]"></div>
            </div>
        </div>
    );
};

export default DeliveryNoteModal;
