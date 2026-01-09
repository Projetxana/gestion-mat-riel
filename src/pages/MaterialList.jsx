import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { Plus, Search, Filter, QrCode, Hammer, MapPin, LayoutGrid, List, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import AddMaterialModal from '../components/AddMaterialModal';
import MaterialDetailsModal from '../components/MaterialDetailsModal';

const MaterialList = () => {
    const { materials, sites } = useAppContext();
    const [searchParams] = useSearchParams();
    const [showAddModal, setShowAddModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState(searchParams.get('filter') || 'all');
    const [viewMode, setViewMode] = useState('grid');
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

    const getSiteName = (id) => {
        const site = sites.find(s => s.id === id);
        return site ? site.name : 'Unknown Site';
    };

    const handleSort = (key) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const filteredMaterials = materials.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.qrCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.serialNumber.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter = filterStatus === 'all' || item.status === filterStatus;
        return matchesSearch && matchesFilter;
    });

    const sortedMaterials = [...filteredMaterials].sort((a, b) => {
        const direction = sortConfig.direction === 'asc' ? 1 : -1;

        switch (sortConfig.key) {
            case 'name':
                return direction * a.name.localeCompare(b.name);
            case 'serialNumber':
                return direction * a.serialNumber.localeCompare(b.serialNumber);
            case 'status':
                return direction * a.status.localeCompare(b.status);
            case 'location':
                // Simple location type sort for now, could be more complex
                return direction * a.locationType.localeCompare(b.locationType);
            default:
                return 0;
        }
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
            <div className="glass-panel p-4 mb-6 flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                        type="text"
                        placeholder="Rechercher par nom, série ou QR..."
                        className="pl-10 w-full"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <select
                        className="flex-1 md:w-40"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                    >
                        <option value="all">Tous statuts</option>
                        <option value="available">Disponible</option>
                        <option value="in_use">Utilisé</option>
                        <option value="repair">En Réparation</option>
                    </select>

                    {/* View Toggle */}
                    <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
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
                </div>
            </div>

            {/* Content */}
            {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sortedMaterials.map((item) => (
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
                                        Nom
                                        {sortConfig.key === 'name' ? (
                                            sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                                        ) : <ArrowUpDown size={14} className="opacity-50" />}
                                    </div>
                                </th>
                                <th
                                    className="p-4 font-medium hidden md:table-cell cursor-pointer hover:text-white transition-colors"
                                    onClick={() => handleSort('serialNumber')}
                                >
                                    <div className="flex items-center gap-2">
                                        Série / QR
                                        {sortConfig.key === 'serialNumber' ? (
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
                                    className="p-4 font-medium hidden md:table-cell cursor-pointer hover:text-white transition-colors"
                                    onClick={() => handleSort('location')}
                                >
                                    <div className="flex items-center gap-2">
                                        Emplacement
                                        {sortConfig.key === 'location' ? (
                                            sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                                        ) : <ArrowUpDown size={14} className="opacity-50" />}
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {sortedMaterials.map((item) => (
                                <tr
                                    key={item.id}
                                    onClick={() => setSelectedTool(item)}
                                    className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                                >
                                    <td className="p-4">
                                        <div className="font-bold text-white">{item.name}</div>
                                        <div className="md:hidden text-xs text-slate-500">{item.serialNumber}</div>
                                    </td>
                                    <td className="p-4 hidden md:table-cell">
                                        <div className="text-slate-300 text-sm">{item.serialNumber}</div>
                                        <div className="text-slate-500 text-xs font-mono">{item.qrCode}</div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(item.status)} capitalize`}>
                                            {formatStatus(item.status)}
                                        </span>
                                    </td>
                                    <td className="p-4 hidden md:table-cell text-sm text-slate-400">
                                        {item.locationType === 'warehouse' ? 'Entrepôt' :
                                            item.locationType === 'repair' ? 'Atelier' :
                                                getSiteName(item.locationId)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

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
