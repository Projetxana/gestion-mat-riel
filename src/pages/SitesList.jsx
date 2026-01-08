import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Plus, MapPin, HardHat, ChevronRight } from 'lucide-react';
import AddSiteModal from '../components/AddSiteModal';
import SiteDetailsModal from '../components/SiteDetailsModal';

const SitesList = () => {
    const { sites, materials } = useAppContext();
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedSite, setSelectedSite] = useState(null);

    const getToolCount = (siteId) => {
        return materials.filter(m => m.locationType === 'site' && m.locationId === siteId).length;
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="page-title">Chantiers</h1>
                    <p className="text-slate-400">Gérez les projets actifs et l'équipement assigné</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="btn btn-primary"
                >
                    <Plus size={20} />
                    <span>Nouveau Chantier</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {sites.map((site) => (
                    <div
                        key={site.id}
                        onClick={() => setSelectedSite(site)}
                        className="glass-panel p-6 cursor-pointer hover:border-slate-500 transition-all group hover:scale-[1.01] hover:shadow-lg"
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 rounded-lg bg-orange-500/10 text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                                <HardHat size={28} />
                            </div>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${site.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-slate-500/10 text-slate-400'
                                }`}>
                                {site.status === 'active' ? 'Actif' : site.status}
                            </span>
                        </div>

                        <h3 className="text-xl font-bold mb-2">{site.name}</h3>
                        <div className="flex items-start gap-2 text-slate-400 text-sm mb-6">
                            <MapPin size={16} className="mt-0.5" />
                            <p>{site.address}</p>
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                            <div>
                                <p className="text-2xl font-bold text-white">{getToolCount(site.id)}</p>
                                <p className="text-xs text-slate-500 font-medium uppercase">Matériel Assigné</p>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                <ChevronRight size={18} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {showAddModal && <AddSiteModal onClose={() => setShowAddModal(false)} />}
            {selectedSite && <SiteDetailsModal site={selectedSite} onClose={() => setSelectedSite(null)} />}
        </div>
    );
};

export default SitesList;
