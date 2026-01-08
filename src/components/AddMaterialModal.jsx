import React, { useState } from 'react';
import { X, QrCode } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

const AddMaterialModal = ({ onClose }) => {
    const { addMaterial } = useAppContext();
    const [formData, setFormData] = useState({
        name: '',
        serialNumber: '',
        qrCode: '',
        status: 'available',
        locationType: 'warehouse',
        locationId: null
    });

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
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-6 border-b border-slate-800">
                    <h2 className="text-xl font-bold text-white">Ajouter un outil</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
                                onClick={generateMockQR}
                                className="btn btn-ghost border border-slate-700 hover:bg-slate-800"
                                title="Simuler Scan"
                            >
                                <QrCode size={20} />
                            </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">Cliquez sur l'icône QR pour simuler un scan.</p>
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
