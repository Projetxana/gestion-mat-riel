import React, { useState, useEffect } from 'react';
import { X, QrCode } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { Html5QrcodeScanner } from 'html5-qrcode';

const AddMaterialModal = ({ onClose }) => {
    const { addMaterial } = useAppContext();
    const [isScanning, setIsScanning] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        serialNumber: '',
        qrCode: '',
        status: 'available',
        locationType: 'warehouse',
        locationId: null
    });

    useEffect(() => {
        let scanner = null;
        if (isScanning) {
            scanner = new Html5QrcodeScanner(
                "reader",
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
        setFormData(prev => ({ ...prev, qrCode: decodedText }));
        setIsScanning(false);
    };

    const onScanFailure = (error) => {
        // console.warn(`Code scan error = ${error}`);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        addMaterial(formData);
        onClose();
    };

    const generateMockQR = () => {
        const randomCode = 'TOOL-' + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        setFormData({ ...formData, qrCode: randomCode });
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-200 overflow-y-auto max-h-[90vh]">
                <div className="flex items-center justify-between p-6 border-b border-slate-800">
                    <h2 className="text-xl font-bold text-white">Ajouter un outil</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">

                    {/* Scanner Section */}
                    {isScanning && (
                        <div className="mb-4 p-4 bg-black rounded-lg">
                            <div id="reader" className="w-full"></div>
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
                        <label className="block text-sm font-medium text-slate-400 mb-1">Nom de l'outil</label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. Hilti Impact Driver"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Numéro de série</label>
                            <input
                                type="text"
                                required
                                placeholder="SN-XXXX"
                                value={formData.serialNumber}
                                onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Statut</label>
                            <select
                                value={formData.status}
                                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                            >
                                <option value="available">Disponible</option>
                                <option value="in_use">Utilisé</option>
                                <option value="repair">En Réparation</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Code QR / Tag ID</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                required
                                placeholder="Scanner ou saisir le code..."
                                value={formData.qrCode}
                                onChange={(e) => setFormData({ ...formData, qrCode: e.target.value })}
                            />
                            <button
                                type="button"
                                onClick={() => setIsScanning(!isScanning)}
                                className="btn btn-primary bg-amber-500 hover:bg-amber-600 border-none text-white shadow-lg shadow-amber-900/20"
                                title="Scanner Code QR"
                            >
                                <QrCode size={20} />
                                <span className="ml-2 hidden sm:inline">Scanner</span>
                            </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">Utilisez la caméra pour scanner un code.</p>
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="btn btn-ghost">Annuler</button>
                        <button type="submit" className="btn btn-primary">Ajouter</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddMaterialModal;
