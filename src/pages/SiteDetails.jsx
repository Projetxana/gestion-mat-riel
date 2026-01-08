import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { ArrowLeft, MapPin, Hammer, ExternalLink } from 'lucide-react';
import MaterialDetailsModal from '../components/MaterialDetailsModal';

const SiteDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { sites, materials } = useAppContext();
    const [selectedTool, setSelectedTool] = useState(null);

    const site = sites.find(s => s.id === Number(id));
    const siteTools = materials.filter(m => m.locationType === 'site' && m.locationId === Number(id));

    if (!site) {
        return (
            <div className="p-8 text-center">
                <h2 className="text-xl font-bold">Chantier Introuvable</h2>
                <button onClick={() => navigate('/sites')} className="text-blue-400 mt-4">Retour aux chantiers</button>
            </div>
        );
    }

    return (
        <div>
            <button
                onClick={() => navigate('/sites')}
                className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
            >
                <ArrowLeft size={20} />
                <span>Retour aux chantiers</span>
            </button>

            <div className="glass-panel p-8 mb-8">
                <div className="flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-3xl font-bold">{site.name}</h1>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${site.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-slate-500/10 text-slate-400'
                                }`}>
                                {site.status}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                            <MapPin size={18} />
                            <p>{site.address}</p>
                        </div>
                    </div>
                </div>

                <div className="flex gap-8 mt-8 border-t border-slate-800 pt-6">
                    <div>
                        <p className="text-3xl font-bold text-white">{siteTools.length}</p>
                        <p className="text-xs text-slate-500 uppercase font-medium">Matériel Assigné</p>
                    </div>
                    <div>
                        <p className="text-3xl font-bold text-white">{siteTools.filter(t => t.status === 'in_use').length}</p>
                        <p className="text-xs text-slate-500 uppercase font-medium">En Utilisation</p>
                    </div>
                </div>
            </div>

            <h2 className="text-xl font-bold mb-4">Matériel Assigné</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {siteTools.map((tool) => (
                    <div key={tool.id} className="glass-panel p-4 flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                            <div className="p-2 rounded bg-slate-800 text-slate-400">
                                <Hammer size={20} />
                            </div>
                            <div>
                                <p className="font-bold text-slate-200">{tool.name}</p>
                                <p className="text-xs text-slate-500">{tool.serialNumber}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setSelectedTool(tool)}
                            className="p-2 rounded-full hover:bg-slate-800 text-slate-500 hover:text-blue-400 transition-colors"
                        >
                            <ExternalLink size={18} />
                        </button>
                    </div>
                ))}
                {siteTools.length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-500 bg-slate-900/50 rounded-xl border border-dashed border-slate-800">
                        <p>Aucun matériel sur ce site.</p>
                        <p className="text-sm mt-2">Allez dans "Matériel" pour affecter de l'équipement.</p>
                    </div>
                )}
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

export default SiteDetails;
