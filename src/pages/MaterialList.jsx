import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { Plus, Search, Filter, QrCode, Hammer, MapPin } from 'lucide-react';
import AddMaterialModal from '../components/AddMaterialModal';
import MaterialDetailsModal from '../components/MaterialDetailsModal';

const MaterialList = () => {
    const { materials, sites } = useAppContext();
    const [searchParams] = useSearchParams();
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedTool, setSelectedTool] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState(searchParams.get('filter') || 'all');

    const getSiteName = (id) => {
        const site = sites.find(s => s.id === id);
        return site ? site.name : 'Unknown Site';
    };

    const filteredMaterials = materials.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.qrCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.serialNumber.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter = filterStatus === 'all' || item.status === filterStatus;
        return matchesSearch && matchesFilter;
    });

    const getStatusColor = (status) => {
        switch (status) {
            case 'available': return 'bg-green-500/10 text-green-400 border-green-500/20';
            case 'in_use': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
            case 'repair': return 'bg-red-500/10 text-red-400 border-red-500/20';
            default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
        }
    };

    const formatStatus = (status) => {
        switch (status) {
            case 'available': return 'Disponible';
            case 'in_use': return 'Utilisé';
            case 'repair': return 'En Réparation';
            default: return status;
        }
    };

    return (
        <div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="page-title">Outils et Matériel</h1>
                    <p className="text-slate-400">Gérez votre inventaire et suivez les emplacements</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="btn btn-primary"
                >
                    <Plus size={20} />
                    <span>Ajouter</span>
                </button>
            </div>

            {/* Filters & Search */}
            <div className="glass-panel p-4 mb-6 flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                        type="text"
                        placeholder="Rechercher par nom, série ou QR..."
                        className="pl-10"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-2">
                    <select
                        className="w-40"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                    >
                        <option value="all">Tous statuts</option>
                        <option value="available">Disponible</option>
                        <option value="in_use">Utilisé</option>
                        <option value="repair">En Réparation</option>
                    </select>
                    <button className="btn btn-ghost border border-slate-700 bg-slate-800" title="Scan QR to Search">
                        <QrCode size={18} />
                    </button>
                </div>
            </div>

            {/* Grid View */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredMaterials.map((item) => (
                    <div
                        key={item.id}
                        onClick={() => setSelectedTool(item)}
                        className="glass-panel p-5 hover:border-slate-600 transition-all duration-200 cursor-pointer group hover:scale-[1.01] hover:shadow-lg"
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 rounded-lg bg-slate-800 text-slate-300 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                <Hammer size={24} />
                            </div>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(item.status)} capitalize`}>
                                {formatStatus(item.status)}
                            </span>
                        </div>

                        <h3 className="text-lg font-bold mb-1">{item.name}</h3>
                        <p className="text-sm text-slate-500 mb-4">SN: {item.serialNumber}</p>

                        <div className="space-y-2 text-sm text-slate-400">
                            <div className="flex items-center gap-2">
                                <QrCode size={16} />
                                <span className="font-mono">{item.qrCode}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <MapPin size={16} />
                                <span className={item.locationType === 'site' ? 'text-blue-400' : ''}>
                                    {item.locationType === 'warehouse' ? 'Entrepôt' :
                                        item.locationType === 'repair' ? 'Atelier' :
                                            getSiteName(item.locationId)}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {filteredMaterials.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                    <p>Aucun outil trouvé.</p>
                </div>
            )}

            {showAddModal && <AddMaterialModal onClose={() => setShowAddModal(false)} />}
            {selectedTool && <MaterialDetailsModal tool={selectedTool} onClose={() => setSelectedTool(null)} />}
        </div>
    );
};

export default MaterialList;
