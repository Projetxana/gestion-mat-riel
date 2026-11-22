import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, Send, Trash2, RotateCcw, Check } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../context/AppContext';

const DeliveryNoteModal = ({ onClose }) => {
    const { addLog, currentUser, sites, currentCompanyId } = useAppContext();
    const [selectedSiteId, setSelectedSiteId] = useState('');
    const [deliveryNotice, setDeliveryNotice] = useState('');
    const availableSites = (sites || []).filter(site =>
        site.status === 'active' && String(site.company_id) === String(currentCompanyId));
    const selectedSite = availableSites.find(site => String(site.id) === selectedSiteId);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const cameraStreamRef = useRef(null);
    const photoUrlsRef = useRef([]);
    const [stream, setStream] = useState(null);
    const [photos, setPhotos] = useState([]); // Array of { blob, url }
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    // Initialize Camera
    useEffect(() => {
        startCamera();
        return () => {
            cameraStreamRef.current?.getTracks().forEach(track => track.stop());
            for (const url of photoUrlsRef.current) URL.revokeObjectURL(url);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const startCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }, // Use back camera on mobile
                audio: false
            });
            cameraStreamRef.current = mediaStream;
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (err) {
            console.error("Error accessing camera:", err);
            alert("Impossible d'accéder à la caméra. Vérifiez les permissions.");
        }
    };

    useEffect(() => {
        photoUrlsRef.current = photos.map(photo => photo.url);
    }, [photos]);

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
                if (!blob) { setDeliveryNotice('La prise de photo a échoué, recommencez.'); return; }
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
        if (!photos.length || isUploading || !selectedSite || !currentCompanyId) return;
        setDeliveryNotice('');
        setIsUploading(true);
        setUploadProgress(0);
        try {
            const { data: authData, error: authError } = await supabase.auth.getUser();
            if (authError || !authData?.user?.id) throw new Error('Session expirée. Reconnectez-vous.');
            const userId = authData.user.id;
            const paths = [];
            const submissionId = crypto.randomUUID();
            for (let i = 0; i < photos.length; i++) {
                const { blob } = photos[i];
                if (blob.size > 3 * 1024 * 1024) throw new Error('Photo trop volumineuse. Réessayez.');
                const path = String(currentCompanyId) + '/' + selectedSite.id + '/' + userId +
                    '/delivery_' + submissionId + '_' + (i + 1) + '.jpg';
                const { error: uploadError } = await supabase.storage
                    .from('bt-delivery-private')
                    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
                if (uploadError) throw uploadError;
                paths.push(path);
                setUploadProgress(Math.round(((i + 1) / photos.length) * 65));
            }
            const { data, error: callError } = await supabase.functions.invoke(
                'bt-send-delivery-note', {
                    body: { company_id: currentCompanyId, site_id: selectedSite.id, paths }
                }
            );
            if (callError || !data?.sent) {
                throw new Error(data?.error || 'Transmission impossible. Vérifiez avec la comptabilité avant de réessayer.');
            }
            setUploadProgress(100);
            addLog('Bon de livraison transmis pour le chantier ' + selectedSite.name);
            alert(data.tracked
                ? 'Bon transmis à la comptabilité et placé dans le suivi du chantier.'
                : 'Bon transmis à la comptabilité, mais suivi à réconcilier. Ne le renvoyez pas.');
            onClose();
        } catch (error) {
            // A network failure can follow a successful SMTP send.
            // Do not automatically resubmit; server fingerprint guards duplicates.
            setDeliveryNotice('Envoi non confirmé : ' + (error.message || 'erreur réseau') +
                ' — vérifiez le statut auprès de la comptabilité avant de recommencer.');
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

            <div className="absolute top-16 left-3 right-3 z-20 rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-2 text-white shadow-xl">
                <label htmlFor="delivery-site" className="block text-xs font-semibold mb-1">
                    Chantier indiqué sur le bon
                </label>
                <select id="delivery-site" value={selectedSiteId} disabled={isUploading}
                    onChange={event => { setSelectedSiteId(event.target.value); setDeliveryNotice(''); }}
                    className="min-h-11 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-white">
                    <option value="">Choisir un chantier actif…</option>
                    {availableSites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
                </select>
                {deliveryNotice && <p role="status" className="mt-2 text-xs text-amber-200">{deliveryNotice}</p>}
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
                    disabled={photos.length === 0 || isUploading || !selectedSite}
                    className={`flex flex-col items-center gap-1 min-w-[60px] ${!selectedSite || photos.length === 0 ? 'text-slate-600' : 'text-green-500 hover:text-green-400'}`}
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
