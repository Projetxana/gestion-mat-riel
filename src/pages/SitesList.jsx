import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Plus, MapPin, HardHat, ChevronRight, LayoutGrid, List, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import AddSiteModal from '../components/AddSiteModal';
import SiteDetailsModal from '../components/SiteDetailsModal';

const SitesList = () => {
    const { sites, materials } = useAppContext();
    const [viewMode, setViewMode] = useState('grid');
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

    const getToolCount = (siteId) => {
        return materials.filter(m => m.locationType === 'site' && m.locationId === siteId).length;
    };

    const handleSort = (key) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const sortedSites = [...sites].sort((a, b) => {
        const direction = sortConfig.direction === 'asc' ? 1 : -1;

        if (sortConfig.key === 'count') {
            return direction * (getToolCount(a.id) - getToolCount(b.id));
        }

        const valA = a[sortConfig.key] || '';
        const valB = b[sortConfig.key] || '';

        return direction * String(valA).localeCompare(String(valB));
    });

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="page-title">Chantiers</h1>
                    <p className="text-slate-400">Gérez les projets actifs et l'équipement assigné</p>
                </div>
                <div className="flex gap-4">
                    {/* View Toggle */}
                    <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700 h-fit">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded ${viewMode === 'grid' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                        >
                            <LayoutGrid size={18} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded ${viewMode === 'list' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                        >
                            <List size={18} />
                        </button>
                    </div>

                    <button
                        onClick={() => setShowAddModal(true)}
                        className="btn btn-primary"
                    >
                        <Plus size={20} />
                        <span className="hidden sm:inline">Nouveau Chantier</span>
                    </button>
                </div>
            </div>

            {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {sortedSites.map((site) => (
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
            ) : (
                <div className="glass-panel overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider">
                                <th
                                    className="p-4 font-medium cursor-pointer hover:text-white transition-colors"
                                    onClick={() => handleSort('name')}
                                >
                                    <div className="flex items-center gap-2">
                                        Nom Chantier
                                        {sortConfig.key === 'name' ? (
                                            sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                                        ) : <ArrowUpDown size={14} className="opacity-50" />}
                                    </div>
                                </th>
                                <th
                                    className="p-4 font-medium hidden md:table-cell cursor-pointer hover:text-white transition-colors"
                                    onClick={() => handleSort('address')}
                                >
                                    <div className="flex items-center gap-2">
                                        Adresse
                                        {sortConfig.key === 'address' ? (
                                            sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                                        ) : <ArrowUpDown size={14} className="opacity-50" />}
                                    </div>
                                </th>
                                <th
                                    className="p-4 font-medium cursor-pointer hover:text-white transition-colors"
                                    onClick={() => handleSort('status')}
                                >
                                    <div className="flex items-center gap-2">
                                        Statut
                                        {sortConfig.key === 'status' ? (
                                            sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                                        ) : <ArrowUpDown size={14} className="opacity-50" />}
                                    </div>
                                </th>
                                <th
                                    className="p-4 font-medium text-right cursor-pointer hover:text-white transition-colors"
                                    onClick={() => handleSort('count')}
                                >
                                    <div className="flex items-center justify-end gap-2">
                                        Matériel
                                        {sortConfig.key === 'count' ? (
                                            sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                                        ) : <ArrowUpDown size={14} className="opacity-50" />}
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {sortedSites.map((site) => (
                                <tr
                                    key={site.id}
                                    onClick={() => setSelectedSite(site)}
                                    className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                                >
                                    <td className="p-4">
                                        <div className="font-bold text-white mb-1">{site.name}</div>
                                        <div className="md:hidden text-xs text-slate-500">{site.address}</div>
                                    </td>
                                    <td className="p-4 hidden md:table-cell text-sm text-slate-400">
                                        {site.address}
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${site.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-slate-500/10 text-slate-400'
                                            }`}>
                                            {site.status === 'active' ? 'Actif' : site.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="font-bold text-white">{getToolCount(site.id)}</div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showAddModal && <AddSiteModal onClose={() => setShowAddModal(false)} />}
            {selectedSite && <SiteDetailsModal site={selectedSite} onClose={() => setSelectedSite(null)} />}
        </div>
    );
};

export default SitesList;
