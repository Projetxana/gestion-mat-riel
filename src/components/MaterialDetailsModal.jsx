import React, { useState, useEffect } from 'react';
import { X, MapPin, Truck, Wrench, AlertCircle, QrCode, Send, Camera } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { supabase } from '../supabaseClient';

const MaterialDetailsModal = ({ tool, onClose }) => {
    const { sites, transferTool, updateMaterial, deleteMaterial, currentUser, addLog } = useAppContext();
    const [transferMode, setTransferMode] = useState(false);
    const [reportMode, setReportMode] = useState(false);
    const [issueDescription, setIssueDescription] = useState('');
    const [issueImage, setIssueImage] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [editData, setEditData] = useState({ ...tool });
    const [isScanning, setIsScanning] = useState(false);

    useEffect(() => {
        let scanner = null;
        if (isScanning) {
            scanner = new Html5QrcodeScanner(
                "edit-reader",
                { fps: 10, qrbox: { width: 250, height: 250 } },
                /* verbose= */ false
            );
            scanner.render(onScanSuccess, onScanFailure);
        }

        return () => {
            if (scanner) {
                scanner.clear().catch(error => console.error("Failed to clear scanner", error));
            }
        };
    }, [isScanning]);

    const onScanSuccess = (decodedText, decodedResult) => {
        setEditData(prev => ({ ...prev, qrCode: decodedText }));
        setIsScanning(false);
    };

    const onScanFailure = (error) => {
        // console.warn(`Code scan error = ${error}`);
    };

    const [selectedLocationType, setSelectedLocationType] = useState('site'); // site, warehouse, repair
    const [selectedSiteId, setSelectedSiteId] = useState('');

    const handleTransfer = (e) => {
        e.preventDefault();
        const locId = selectedLocationType === 'site' ? Number(selectedSiteId) : null;
        transferTool(tool.id, selectedLocationType, locId);
        setTransferMode(false);
        onClose();
    };

    const handleUpdate = (e) => {
        e.preventDefault();
        updateMaterial(tool.id, editData);
        setEditMode(false);
    };

    const handleReportIssue = async (e) => {
        e.preventDefault();
        if (!issueDescription.trim()) return;

        setIsUploading(true);
        let imageUrl = '';

        try {
            // 0. Upload image if present
            if (issueImage) {
                const fileName = `issue_${Date.now()}_${tool.id}.jpg`;
                const { data, error } = await supabase.storage
                    .from('delivery-notes') // Reusing bucket for now
                    .upload(fileName, issueImage);

                if (!error) {
                    const { data: publicData } = supabase.storage
                        .from('delivery-notes')
                        .getPublicUrl(fileName);
                    imageUrl = publicData.publicUrl;
                }
            }

            // 1. Update status to repair
            updateMaterial(tool.id, { status: 'repair' });

            // 2. Add log
            addLog(`Reported issue for ${tool.name}: ${issueDescription}`);

            // 3. Construct email
            const subject = `Problème Matériel: ${tool.name} [${tool.serialNumber}]`;
            let body = `Bonjour,\n\nJe signale un problème sur l'outil suivant :\n\nNom: ${tool.name}\nSérie: ${tool.serialNumber}\nQR: ${tool.qrCode}\n\nDescription du problème :\n${issueDescription}\n\n`;

            if (imageUrl) {
                body += `Photo du problème : ${imageUrl}\n\n`;
            }

            body += `Signalé par : ${currentUser?.name || 'Utilisateur'}\n\nCordialement.`;

            window.location.href = `mailto:materiaux@cd.atoomerp.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

            onClose();
        } catch (error) {
            console.error(error);
            alert("Erreur lors de l'envoi du rapport.");
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = () => {
        if (confirm('Êtes-vous sûr de vouloir supprimer cet outil ? Cette action est irréversible.')) {
            deleteMaterial(tool.id);
            onClose();
        }
    };

    const currentLocationName = () => {
        if (tool.locationType === 'warehouse') return 'Entrepôt';
        if (tool.locationType === 'repair') return 'Atelier';
        const site = sites.find(s => s.id === tool.locationId);
        return site ? site.name : 'Site Inconnu';
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-6 border-b border-slate-800">
                    <div>
                        <h2 className="text-2xl font-bold text-white">{tool.name}</h2>
                        <p className="text-slate-400 font-mono text-sm">{tool.qrCode}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6">
                    {/* Status & Location Banner */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                        <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                            <p className="text-sm text-slate-400 mb-1">Statut Actuel</p>
                            <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${tool.status === 'available' ? 'bg-green-500' :
                                    tool.status === 'in_use' ? 'bg-blue-500' : 'bg-red-500'
                                    }`} />
                                <span className="font-bold text-lg capitalize">
                                    {tool.status === 'available' ? 'Disponible' : tool.status === 'in_use' ? 'Utilisé' : 'En Réparation'}
                                </span>
                            </div>
                        </div>

                        <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                            <p className="text-sm text-slate-400 mb-1">Emplacement Actuel</p>
                            <div className="flex items-center gap-2">
                                <MapPin size={20} className="text-blue-400" />
                                <span className="font-bold text-lg">{currentLocationName()}</span>
                            </div>
                        </div>
                    </div>

                    {editMode ? (
                        <form onSubmit={handleUpdate} className="mb-6 space-y-3 bg-slate-800 p-4 rounded-xl">
                            {isScanning && (
                                <div className="mb-4 p-4 bg-black rounded-lg">
                                    <div id="edit-reader" className="w-full"></div>
                                    <button
                                        type="button"
                                        onClick={() => setIsScanning(false)}
                                        className="mt-2 w-full py-2 bg-red-600 text-white rounded text-sm"
                                    >
                                        Arrêter le scan
                                    </button>
                                </div>
                            )}
                            <div>
                                <label className="text-xs text-slate-400">Nom</label>
                                <input
                                    className="w-full bg-slate-700 p-2 rounded text-white"
                                    value={editData.name}
                                    onChange={e => setEditData({ ...editData, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400">Numéro de Série</label>
                                <input
                                    className="w-full bg-slate-700 p-2 rounded text-white"
                                    value={editData.serialNumber}
                                    onChange={e => setEditData({ ...editData, serialNumber: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400">QR Code</label>
                                <div className="flex gap-2">
                                    <input
                                        className="w-full bg-slate-700 p-2 rounded text-white"
                                        value={editData.qrCode}
                                        onChange={e => setEditData({ ...editData, qrCode: e.target.value })}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setIsScanning(!isScanning)}
                                        className="p-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors"
                                        title="Scanner QR"
                                    >
                                        <QrCode size={20} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex gap-2 justify-end mt-2">
                                <button type="button" onClick={() => setEditMode(false)} className="px-3 py-1 text-sm bg-slate-600 rounded">Annuler</button>
                                <button type="submit" className="px-3 py-1 text-sm bg-green-600 rounded">Sauvegarder</button>
                            </div>
                        </form>
                    ) : (
                        <div className="mb-6">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Détails Appareil</h3>
                                {currentUser?.role === 'admin' && (
                                    <div className="flex gap-2">
                                        <button onClick={() => setEditMode(true)} className="text-xs text-blue-400 hover:underline">Modifier</button>
                                        <button onClick={handleDelete} className="text-xs text-red-500 hover:underline">Supprimer</button>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                <div className="text-slate-500">Numéro de Série</div>
                                <div className="text-slate-200 font-mono">{tool.serialNumber}</div>
                                <div className="text-slate-500">Date d'ajout</div>
                                <div className="text-slate-200">{new Date(tool.created_at || Date.now()).toLocaleDateString()}</div>
                            </div>
                        </div>
                    )}

                    {!transferMode && !reportMode ? (
                        <div className="flex gap-3 pt-4 border-t border-slate-800">
                            <button
                                onClick={() => setTransferMode(true)}
                                className="flex-1 btn btn-primary flex justify-center py-3"
                            >
                                <Truck size={20} />
                                <span>Transférer / Affecter</span>
                            </button>
                            <button
                                onClick={() => setReportMode(true)}
                                className="btn btn-ghost border border-slate-700 text-yellow-500 hover:bg-yellow-500/10 hover:text-yellow-400"
                            >
                                <Wrench size={20} />
                                <span>Signaler Problème</span>
                            </button>
                        </div>
                    ) : reportMode ? (
                        <div className="bg-slate-800 p-4 rounded-lg border border-slate-600 animate-in slide-in-from-top-2">
                            <h3 className="font-bold mb-4 flex items-center gap-2 text-yellow-500">
                                <AlertCircle size={20} />
                                Signaler un Problème
                            </h3>
                            <form onSubmit={handleReportIssue} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-2">Description de la panne</label>
                                    <textarea
                                        required
                                        rows={4}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-yellow-500"
                                        placeholder="Décrivez le problème..."
                                        value={issueDescription}
                                        onChange={(e) => setIssueDescription(e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-2">Photo (Optionnel)</label>
                                    <div className="flex items-center gap-3">
                                        <label className="flex items-center gap-2 cursor-pointer bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded text-sm text-white transition-colors">
                                            <Camera size={16} />
                                            {issueImage ? 'Changer Photo' : 'Ajouter Photo'}
                                            <input
                                                type="file"
                                                accept="image/*"
                                                capture="environment"
                                                className="hidden"
                                                onChange={(e) => setIssueImage(e.target.files[0])}
                                            />
                                        </label>
                                        {issueImage && (
                                            <span className="text-xs text-green-400 truncate max-w-[150px]">
                                                {issueImage.name}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setReportMode(false)}
                                        className="btn btn-ghost text-sm"
                                        disabled={isUploading}
                                    >Annuler</button>
                                    <button
                                        type="submit"
                                        className="btn btn-primary bg-yellow-600 hover:bg-yellow-500 border-none text-white shadow-lg shadow-yellow-900/20"
                                        disabled={isUploading}
                                    >
                                        {isUploading ? (
                                            "Envoi..."
                                        ) : (
                                            <>
                                                <Send size={16} className="mr-2" />
                                                Envoyer Rapport
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    ) : (
                        <div className="bg-slate-800 p-4 rounded-lg border border-slate-600 animate-in slide-in-from-top-2">
                            <h3 className="font-bold mb-4 flex items-center gap-2">
                                <Truck size={20} className="text-blue-400" />
                                Transférer Matériel
                            </h3>

                            <form onSubmit={handleTransfer} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-2">Type Destination</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedLocationType('site')}
                                            className={`p-2 text-sm rounded border text-center ${selectedLocationType === 'site' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-300'}`}
                                        >Chantier</button>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedLocationType('warehouse')}
                                            className={`p-2 text-sm rounded border text-center ${selectedLocationType === 'warehouse' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-300'}`}
                                        >Entrepôt</button>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedLocationType('repair')}
                                            className={`p-2 text-sm rounded border text-center ${selectedLocationType === 'repair' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-300'}`}
                                        >Atelier</button>
                                    </div>
                                </div>

                                {selectedLocationType === 'site' && (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">Sélectionner Chantier</label>
                                        <select
                                            required
                                            value={selectedSiteId}
                                            onChange={(e) => setSelectedSiteId(e.target.value)}
                                        >
                                            <option value="">-- Choisir Chantier --</option>
                                            {sites.filter(s => s.status === 'active').map(site => (
                                                <option key={site.id} value={site.id}>{site.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {selectedLocationType === 'repair' && (
                                    <div className="flex items-center gap-2 p-3 bg-red-500/10 text-red-400 rounded border border-red-500/20 text-sm">
                                        <AlertCircle size={16} />
                                        Le statut passera à "En Réparation"
                                    </div>
                                )}

                                <div className="flex justify-end gap-3 mt-4">
                                    <button
                                        type="button"
                                        onClick={() => setTransferMode(false)}
                                        className="btn btn-ghost text-sm"
                                    >Annuler</button>
                                    <button
                                        type="submit"
                                        className="btn btn-primary text-sm"
                                        disabled={selectedLocationType === 'site' && !selectedSiteId}
                                    >Confirmer Transfert</button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MaterialDetailsModal;
