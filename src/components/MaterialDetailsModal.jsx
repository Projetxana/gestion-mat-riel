import React, { useState } from 'react';
import { X, MapPin, Truck, Wrench, AlertCircle } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

const MaterialDetailsModal = ({ tool, onClose }) => {
    const { sites, transferTool } = useAppContext();
    const [transferMode, setTransferMode] = useState(false);
    const [selectedLocationType, setSelectedLocationType] = useState('site'); // site, warehouse, repair
    const [selectedSiteId, setSelectedSiteId] = useState('');

    const handleTransfer = (e) => {
        e.preventDefault();
        const locId = selectedLocationType === 'site' ? Number(selectedSiteId) : null;
        transferTool(tool.id, selectedLocationType, locId);
        setTransferMode(false);
        onClose();
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

                    <div className="mb-6">
                        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-2">Détails Appareil</h3>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                            <div className="text-slate-500">Numéro de Série</div>
                            <div className="text-slate-200 font-mono">{tool.serialNumber}</div>
                            <div className="text-slate-500">Date d'ajout</div>
                            <div className="text-slate-200">{new Date().toLocaleDateString()}</div>
                        </div>
                    </div>

                    {!transferMode ? (
                        <div className="flex gap-3 pt-4 border-t border-slate-800">
                            <button
                                onClick={() => setTransferMode(true)}
                                className="flex-1 btn btn-primary flex justify-center py-3"
                            >
                                <Truck size={20} />
                                <span>Transférer / Affecter</span>
                            </button>
                            <button className="btn btn-ghost border border-slate-700 text-yellow-500 hover:bg-yellow-500/10 hover:text-yellow-400">
                                <Wrench size={20} />
                                <span>Signaler Problème</span>
                            </button>
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
