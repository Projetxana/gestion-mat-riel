import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { X, MapPin, Hammer, ExternalLink } from 'lucide-react';
import MaterialDetailsModal from './MaterialDetailsModal';

const SiteDetailsModal = ({ site, onClose }) => {
    const { materials } = useAppContext();
    const [selectedTool, setSelectedTool] = useState(null);

    const siteTools = materials.filter(m => m.locationType === 'site' && m.locationId === site.id);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-start justify-between p-6 border-b border-slate-800 bg-slate-900/50">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h2 className="text-2xl font-bold text-white">{site.name}</h2>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${site.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-slate-500/10 text-slate-400'
                                }`}>
                                {site.status === 'active' ? 'Actif' : site.status}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                            <MapPin size={16} />
                            <p className="text-sm">{site.address}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-2 gap-4 mb-8">
                        <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-800">
                            <p className="text-3xl font-bold text-white">{siteTools.length}</p>
                            <p className="text-xs text-slate-500 uppercase font-medium">Matériel Assigné</p>
                        </div>
                        <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-800">
                            <p className="text-3xl font-bold text-white">{siteTools.filter(t => t.status === 'in_use').length}</p>
                            <p className="text-xs text-slate-500 uppercase font-medium">En Utilisation</p>
                        </div>
                    </div>

                    <h3 className="text-lg font-bold mb-4">Liste du Matériel</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {siteTools.map((tool) => (
                            <div
                                key={tool.id}
                                onClick={() => setSelectedTool(tool)}
                                className="bg-slate-800/30 border border-slate-800 p-4 rounded-xl flex items-center justify-between group hover:border-blue-500/30 hover:bg-slate-800/50 transition-all cursor-pointer"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="p-2 rounded-lg bg-slate-800/80 text-blue-400">
                                        <Hammer size={20} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-200">{tool.name}</p>
                                        <p className="text-xs text-slate-500">{tool.serialNumber}</p>
                                    </div>
                                </div>
                                <ExternalLink size={16} className="text-slate-600 group-hover:text-blue-400 transition-colors" />
                            </div>
                        ))}
                        {siteTools.length === 0 && (
                            <div className="col-span-full py-12 text-center text-slate-500 bg-slate-800/20 rounded-xl border border-dashed border-slate-800">
                                <p>Aucun matériel sur ce site.</p>
                                <p className="text-sm mt-2">Allez dans "Matériel" pour affecter de l'équipement.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {selectedTool && (
                <MaterialDetailsModal
                    tool={selectedTool}
                    onClose={() => setSelectedTool(null)}
                />
            )}
        </div>
    );
};

export default SiteDetailsModal;
