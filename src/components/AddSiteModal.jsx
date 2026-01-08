import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

const AddSiteModal = ({ onClose }) => {
    const { addSite } = useAppContext();
    const [formData, setFormData] = useState({
        name: '',
        address: '',
        status: 'active'
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        addSite(formData);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-6 border-b border-slate-800">
                    <h2 className="text-xl font-bold text-white">Nouveau Chantier</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Nom du Chantier</label>
                        <input
                            type="text"
                            required
                            placeholder="ex: Projet Alpha"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Adresse / Lieu</label>
                        <textarea
                            required
                            rows="3"
                            placeholder="123 Rue de la Construction..."
                            value={formData.address}
                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="btn btn-ghost">Annuler</button>
                        <button type="submit" className="btn btn-primary">Créer Chantier</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddSiteModal;
