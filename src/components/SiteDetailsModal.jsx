import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { X, MapPin, Hammer, ExternalLink } from 'lucide-react';
import MaterialDetailsModal from './MaterialDetailsModal';

const SiteDetailsModal = ({ site, onClose }) => {
    const { materials, currentUser, updateSite, deleteSite } = useAppContext();
    const [selectedTool, setSelectedTool] = useState(null);
    const [editMode, setEditMode] = useState(false);
    const [editData, setEditData] = useState({ ...site });

    // Ensure tasks array exists
    if (!editData.tasks) editData.tasks = [];

    const handleUpdate = (e) => {
        e.preventDefault();
        updateSite(site.id, editData);
        setEditMode(false);
    };

    const handleDelete = () => {
        if (confirm('Êtes-vous sûr de vouloir supprimer ce chantier ?')) {
            deleteSite(site.id);
            onClose();
        }
    };

    const siteTools = materials.filter(m => m.locationType === 'site' && m.locationId === site.id);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-start justify-between p-6 border-b border-slate-800 bg-slate-900/50">
                    <div>
                        {editMode ? (
                            <form onSubmit={handleUpdate} className="flex flex-col gap-2">
                                <input
                                    className="bg-slate-800 p-2 rounded text-white border border-slate-600"
                                    value={editData.name}
                                    onChange={e => setEditData({ ...editData, name: e.target.value })}
                                />
                                <textarea
                                    className="bg-slate-800 p-2 rounded text-white border border-slate-600 text-sm resize-none"
                                    value={editData.address}
                                    onChange={e => setEditData({ ...editData, address: e.target.value })}
                                />
                                <input
                                    className="bg-slate-800 p-2 rounded text-white border border-slate-600 text-sm"
                                    placeholder="Email du responsable"
                                    type="email"
                                    value={editData.email || ''}
                                    onChange={e => setEditData({ ...editData, email: e.target.value })}
                                />
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setEditMode(false)} className="text-xs text-slate-400">Annuler</button>
                                    <button type="submit" className="text-xs text-green-500">Sauvegarder</button>
                                </div>
                            </form>
                        ) : (
                            <>
                                <div className="flex items-center gap-3 mb-2">
                                    <h2 className="text-2xl font-bold text-white max-w-md truncate">{site.name}</h2>
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${site.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-slate-500/10 text-slate-400'
                                        }`}>
                                        {site.status === 'active' ? 'Actif' : site.status}
                                    </span>
                                    {currentUser?.role === 'admin' && (
                                        <div className="flex gap-2 ml-4">
                                            <button onClick={() => setEditMode(true)} className="text-xs text-slate-500 hover:text-blue-400">Modifier</button>
                                            <button onClick={handleDelete} className="text-xs text-slate-500 hover:text-red-500">Supprimer</button>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                        {!editMode && (
                            <div className="flex items-center gap-2 text-slate-400">
                                <MapPin size={16} />
                                <p className="text-sm">{site.address}</p>
                            </div>
                        )}
                        {!editMode && site.email && (
                            <div className="flex items-center gap-2 text-slate-500 mt-1">
                                <p className="text-sm ml-6">{site.email}</p>
                            </div>
                        )}
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
                    {editMode ? (
                        /* EDIT MODE CONTENT */
                        <div className="space-y-6">
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                <h3 className="text-sm font-bold text-slate-300 mb-3 uppercase">Gérer les Tâches</h3>
                                <div className="space-y-2 mb-4">
                                    {(editData.tasks || []).map(task => (
                                        <div key={task.id} className="flex justify-between items-center bg-slate-800 p-3 rounded-lg border border-slate-700">
                                            <span className="text-white">{task.name}</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const newTasks = (editData.tasks || []).filter(t => t.id !== task.id);
                                                    setEditData({ ...editData, tasks: newTasks });
                                                }}
                                                className="text-slate-500 hover:text-red-400 p-1"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ))}
                                    {(!editData.tasks || editData.tasks.length === 0) && (
                                        <p className="text-sm text-slate-500 italic text-center py-2">Aucune tâche définie</p>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Nouvelle tâche..."
                                        id="newTaskInput"
                                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 outline-none"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                const val = e.target.value.trim();
                                                if (val) {
                                                    const newTask = { id: `t-${Date.now()}`, name: val };
                                                    const currentTasks = editData.tasks || [];
                                                    setEditData({ ...editData, tasks: [...currentTasks, newTask] });
                                                    e.target.value = '';
                                                }
                                            }
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const input = document.getElementById('newTaskInput');
                                            const val = input.value.trim();
                                            if (val) {
                                                const newTask = { id: `t-${Date.now()}`, name: val };
                                                const currentTasks = editData.tasks || [];
                                                setEditData({ ...editData, tasks: [...currentTasks, newTask] });
                                                input.value = '';
                                            }
                                        }}
                                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 rounded-lg font-medium text-sm"
                                    >
                                        Ajouter
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* VIEW MODE CONTENT */
                        <>
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
                        </>
                    )}
                </div>

                {selectedTool && (
                    <MaterialDetailsModal
                        tool={selectedTool}
                        onClose={() => setSelectedTool(null)}
                    />
                )}
            </div>
        </div>
    );
};

export default SiteDetailsModal;
